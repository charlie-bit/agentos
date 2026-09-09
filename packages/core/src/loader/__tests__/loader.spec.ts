/**
 * Loader tests are yml-in, plan-out: they reuse the manifest module's own
 * fixtures (core dogfooding its own pipeline) and inject a fake env record —
 * no real environment, no network, no kernel.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ToolProviderManifest } from "@agentos/contracts";
import { loadManifestDir } from "../../manifest/index.js";
import { planTools, driftReport } from "../index.js";

const fx = (p: string) => fileURLToPath(new URL(`../../manifest/__tests__/fixtures/${p}`, import.meta.url));
const toolManifests = (dir: string): ToolProviderManifest[] =>
  loadManifestDir(fx(dir))
    .loaded.map((l) => l.manifest)
    .filter((m): m is ToolProviderManifest => m.kind === "tool");

const ENV = { FS_ROOT: "/srv/docs", GW_TOKEN: "tok-fake-123" };

describe("planTools — three transports", () => {
  it("stdio: tokenizes the command line into executable + args", () => {
    const m: ToolProviderManifest = loadManifestDir(fx("valid")).loaded.find((l) => l.manifest.name === "filesystem")!
      .manifest as ToolProviderManifest;
    const { plans, errors } = planTools([m], { env: {} });
    expect(errors).toEqual([]);
    expect(plans[0]?.stdio?.command).toBe("npx");
    expect(plans[0]?.stdio?.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]);
    expect(plans[0]?.allowedTools).toEqual(["read_file", "write_file"]);
    expect(plans[0]?.idempotent).toEqual({ default: true, overrides: { write_file: false } });
  });

  it("http: expands the endpoint and resolves bearer lease into headers (in memory)", () => {
    const m = {
      kind: "tool",
      version: "1",
      name: "gw",
      transport: "http",
      endpoint: "https://${GW_HOST}/rpc",
      auth: { mode: "bearer-token-env", env: "GW_TOKEN" },
      schemaExchange: "json-schema",
    } as ToolProviderManifest;
    const { plans, errors } = planTools([m], { env: { ...ENV, GW_HOST: "mcp.example.com" } });
    expect(errors).toEqual([]);
    expect(plans[0]?.http?.url).toBe("https://mcp.example.com/rpc");
    expect(plans[0]?.http?.headers).toEqual({ Authorization: "Bearer tok-fake-123" });
  });

  it("sdk: registered factory yields a name-only plan", () => {
    const m = {
      kind: "tool",
      version: "1",
      name: "builtin",
      transport: "sdk",
      auth: { mode: "none" },
      schemaExchange: "json-schema",
    } as ToolProviderManifest;
    const { plans, errors, warnings } = planTools([m], { env: {}, sdkFactories: { builtin: {} } });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(plans[0]?.sdk).toEqual({ factoryName: "builtin" });
  });
});

describe("planTools — expansion, filters, degradation", () => {
  const stdioManifest = (over: Partial<ToolProviderManifest> = {}): ToolProviderManifest =>
    ({
      kind: "tool",
      version: "1",
      name: "expander",
      transport: "stdio",
      command: "run --root ${FS_ROOT}",
      auth: { mode: "none" },
      schemaExchange: "json-schema",
      ...over,
    }) as ToolProviderManifest;

  it("expands ${VAR} occurrences in command", () => {
    const { plans, errors } = planTools([stdioManifest()], { env: ENV });
    expect(errors).toEqual([]);
    expect(plans[0]?.stdio?.command).toBe("run");
    expect(plans[0]?.stdio?.args).toEqual(["--root", "/srv/docs"]);
  });

  it("missing ${VAR} fails LOUD with the field path, never silently empties", () => {
    const { plans, errors } = planTools([stdioManifest()], { env: {} });
    expect(plans).toHaveLength(0); // fail loud: an entry with expansion errors is NOT mounted
    expect(errors[0]?.path).toBe("expander.command");
    expect(errors[0]?.message).toContain("FS_ROOT");
  });

  it("unresolvable auth lease is an error at <name>.auth.env", () => {
    const m = {
      kind: "tool",
      version: "1",
      name: "leakygate",
      transport: "http",
      endpoint: "https://mcp.example.com/rpc",
      auth: { mode: "bearer-token-env", env: "NOT_SET_PROBABLY" },
      schemaExchange: "json-schema",
    } as ToolProviderManifest;
    const { errors } = planTools([m], { env: {} });
    expect(errors[0]?.path).toBe("leakygate.auth.env");
  });

  it("enabled:false is filtered out (declared but unmounted)", () => {
    const { plans, errors, warnings } = planTools([stdioManifest({ enabled: false })], { env: ENV });
    expect(plans).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("sdk without a registered factory degrades to a warning and stays absent", () => {
    const m = {
      kind: "tool",
      version: "1",
      name: "ghostfactory",
      transport: "sdk",
      auth: { mode: "none" },
      schemaExchange: "json-schema",
    } as ToolProviderManifest;
    const { plans, errors, warnings } = planTools([m], { env: {}, sdkFactories: {} });
    expect(plans).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(warnings[0]?.message).toContain("not registered");
  });
});

describe("driftReport (pure)", () => {
  it("empty declared = pass-through: both sides empty regardless of discovery", () => {
    expect(driftReport([], ["anything", "grew"])).toEqual({ missing: [], undeclared: [] });
  });

  it("surfaces renamed/disappeared declared tools and unauthorized discoveries", () => {
    expect(driftReport(["read_file", "write_file"], ["read_file", "extra_tool"])).toEqual({
      missing: ["write_file"],
      undeclared: ["extra_tool"],
    });
  });

  it("* wildcard authorizes anything, matches specific shapes", () => {
    expect(driftReport(["read_*"], ["read_file", "read_lines"])).toEqual({ missing: [], undeclared: [] });
    expect(driftReport(["read_*"], ["write_file"])).toEqual({ missing: [], undeclared: ["write_file"] });
    expect(driftReport(["*"], ["whatever"])).toEqual({ missing: [], undeclared: [] });
  });
});

describe('"edit the yml, change the tool set" — executable proof', () => {
  it("two manifest dirs differing only in yml content yield differing plans", () => {
    // fixtures/valid carries filesystem/gateway/builtin (via transport members);
    // the manifest set from the same dir is the baseline. A second "dir" is
    // simulated by editing ONE manifest in memory the way an operator edits yml:
    // flip enabled. This is the yml-is-the-config promise, asserted.
    const all = toolManifests("valid");
    const opts = { env: { ...ENV, GATEWAY_TOKEN: "tok-fake-123" }, sdkFactories: { builtin: {} } };
    const before = planTools(all, opts);
    const edited = all.map((m) => (m.name === "builtin" ? { ...m, enabled: false } : m));
    const after = planTools(edited, opts);
    expect(before.errors).toEqual([]);
    expect(before.plans).toHaveLength(3); // filesystem, gateway, builtin
    expect(after.plans.map((p) => p.key).sort()).toEqual(["filesystem", "gateway"]);
  });
});
