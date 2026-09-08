/**
 * Happy/sad-path matrix over every manifest schema.
 * Sad cases assert the zod issue shape, not prose: issue.path must be non-empty
 * and point at the offending field, so the P1b error formatter can render
 * "where is wrong" without re-deriving it. Probe-confirmed zod v4 shapes:
 * - missing / wrong-typed / bad-literal field  → path points at the field
 *   (nested members arrive as ["mount","repoUrl"] style chains);
 * - strict-object extra key                    → top-level objects report
 *   path:[] with the key name in message (e.g. "Unrecognized key: \"token\"");
 *   nested objects report path:["auth"]. The formatter must expect both shapes.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  knowledgeManifestSchema,
  manifestEnvelopeSchema,
  modelProviderManifestSchema,
  presetSchema,
  toolProviderManifestSchema,
  type EntryAdapter,
} from "../index.js";

type Shape = z.ZodType;

/** Flattened issue dump: one string per issue, "<path joined>|<message>". */
function issuesOf(result: { success: false; error: z.ZodError }): string[] {
  return result.error.issues.map((i) => `${i.path.join(".")}|${i.message}`);
}

/** Field-level rejection: some issue's path is exactly `path`, and `needles` appear in the dump. */
function expectFieldRejected(s: Shape, obj: unknown, path: string[], ...needles: string[]) {
  const r = s.safeParse(obj);
  expect(r.success).toBe(false);
  if (r.success) throw new Error("unreachable");
  const paths = r.error.issues.map((i) => i.path.join("."));
  expect(paths).toContain(path.join("."));
  const dump = issuesOf(r).join(" ; ");
  for (const n of needles) expect(dump).toContain(n);
}

/** strict-object rejection: key name only lives in the message; assert containment path + key. */
function expectKeyRejected(s: Shape, obj: unknown, containerPath: string[], key: string) {
  const r = s.safeParse(obj);
  expect(r.success).toBe(false);
  if (r.success) throw new Error("unreachable");
  const paths = r.error.issues.map((i) => i.path.join("."));
  expect(paths).toContain(containerPath.join("."));
  expect(issuesOf(r).join(" ; ")).toContain(key);
}

const TOOL_BASE = {
  kind: "tool",
  version: "1",
  name: "t",
  auth: { mode: "none" },
  schemaExchange: "json-schema",
} as const;

describe("manifest envelope", () => {
  it("accepts: both kinds of the only existing version", () => {
    expect(manifestEnvelopeSchema.safeParse({ kind: "preset", version: "1"}).success).toBe(true);
    expect(manifestEnvelopeSchema.safeParse({ kind: "knowledge", version: "1" }).success).toBe(true);
  });
  it("rejects: missing kind", () =>
    expectFieldRejected(manifestEnvelopeSchema, { version: "1" }, ["kind"]));
  it("rejects: missing version", () =>
    expectFieldRejected(manifestEnvelopeSchema, { kind: "tool" }, ["version"]));
  it("rejects: unknown envelope key", () =>
    expectKeyRejected(manifestEnvelopeSchema, { kind: "tool", version: "1", author: "x" }, [], "author"));
});

describe("ToolProviderManifest", () => {
  it("accepts: sdk transport with allowlist and enabled flag", () => {
    expect(
      toolProviderManifestSchema.safeParse({
        ...TOOL_BASE,
        transport: "sdk",
        allowedTools: ["a_tool", "b_tool"],
        enabled: false,
      }).success,
    ).toBe(true);
  });
  it("accepts: stdio transport with full idempotency carve-out", () => {
    expect(
      toolProviderManifestSchema.safeParse({
        ...TOOL_BASE,
        transport: "stdio",
        command: "run-server --stdio",
        idempotent: { default: true, overrides: { write_file: false } },
      }).success,
    ).toBe(true);
  });
  it("accepts: http transport with bearer-token-env and envRouting", () => {
    expect(
      toolProviderManifestSchema.safeParse({
        ...TOOL_BASE,
        auth: { mode: "bearer-token-env", env: "GW_TOKEN" },
        transport: "http",
        endpoint: "https://gw.example.com/mcp",
        envRouting: ["dev", "prod"],
      }).success,
    ).toBe(true);
  });

  it("rejects: envelope kind not narrowed to tool", () =>
    expectFieldRejected(toolProviderManifestSchema, { ...TOOL_BASE, kind: "model", transport: "sdk" }, ["kind"]));
  it("rejects: version other than 1", () =>
    expectFieldRejected(toolProviderManifestSchema, { ...TOOL_BASE, version: "2", transport: "sdk" }, ["version"]));
  it("rejects: missing name", () =>
    expectFieldRejected(toolProviderManifestSchema, { ...TOOL_BASE, transport: "sdk", name: undefined }, ["name"]));
  it("rejects: unknown transport discriminator", () =>
    expectFieldRejected(toolProviderManifestSchema, { ...TOOL_BASE, transport: "grpc" }, ["transport"]));
  it("rejects: http without endpoint", () =>
    expectFieldRejected(toolProviderManifestSchema, { ...TOOL_BASE, transport: "http" }, ["endpoint"]));
  it("rejects: stdio without command", () =>
    expectFieldRejected(toolProviderManifestSchema, { ...TOOL_BASE, transport: "stdio" }, ["command"]));
  it("rejects: endpoint on stdio (transport-conditional field)", () =>
    expectKeyRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "stdio", command: "x", endpoint: "https://a.b" },
      [],
      "endpoint",
    ));
  it("rejects: literal token key inside auth (secret cannot enter the manifest)", () =>
    expectKeyRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "http", endpoint: "https://a.b", auth: { mode: "bearer-token-env", env: "E", token: "sk-live" } },
      ["auth"],
      "token",
    ));
  it("rejects: bearer-token-env without env var name", () =>
    expectFieldRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "http", endpoint: "https://a.b", auth: { mode: "bearer-token-env" } },
      ["auth"], // object-level refine lands on its container, not a leaf
      "env is required",
    ));
  it("rejects: schemaExchange not json-schema", () =>
    expectFieldRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "sdk", schemaExchange: "zod-native" },
      ["schemaExchange"],
      "json-schema",
    ));
  it("rejects: idempotent.default wrong type", () =>
    expectFieldRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "sdk", idempotent: { default: "yes" } },
      ["idempotent", "default"],
    ));
  it("rejects: idempotent.overrides value not boolean", () =>
    expectFieldRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "sdk", idempotent: { default: true, overrides: { write_file: "false" } } },
      ["idempotent", "overrides", "write_file"],
    ));
  it("rejects: allowedTools element not string", () =>
    expectFieldRejected(
      toolProviderManifestSchema,
      { ...TOOL_BASE, transport: "sdk", allowedTools: ["ok", 42] },
      ["allowedTools", "1"],
    ));
});

describe("ModelProviderManifest", () => {
  it("accepts: minimal provider with one alias", () => {
    expect(
      modelProviderManifestSchema.safeParse({
        kind: "model",
        version: "1",
        name: "m1",
        provider: "vendor-a",
        models: { general: "vendor-a/model-small" },
      }).success,
    ).toBe(true);
  });
  it("accepts: env-leased endpoint plus fallback chain and usage labels", () => {
    expect(
      modelProviderManifestSchema.safeParse({
        kind: "model",
        version: "1",
        name: "m2",
        provider: "vendor-b",
        baseUrlEnv: "VENDOR_B_BASE_URL",
        credentialsEnv: "VENDOR_B_API_KEY",
        models: { sonnet: "vendor-b/big", haiku: "vendor-b/small" },
        fallbackChain: ["sonnet", "haiku"],
        usageAttr: { costCenter: "platform" },
      }).success,
    ).toBe(true);
  });
  it("accepts: alias pointing at an unrelated vendor model (lease semantics)", () => {
    expect(
      modelProviderManifestSchema.safeParse({
        kind: "model",
        version: "1",
        name: "m3",
        provider: "vendor-c",
        models: { general: "other-vendor/whatever-v9" },
      }).success,
    ).toBe(true);
  });

  it("rejects: missing provider", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: "m", models: { a: "b" }, provider: undefined },
      ["provider"],
    ));
  it("rejects: missing models map", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: "m", provider: "p", models: undefined },
      ["models"],
    ));
  it("rejects: missing name", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: undefined, provider: "p", models: { a: "b" } },
      ["name"],
    ));
  it("rejects: envelope version 2 for a model body", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "2", name: "m", provider: "p", models: { a: "b" } },
      ["version"],
    ));
  it("rejects: kind preset on a model body (envelope/field mismatch)", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "preset", version: "1", name: "m", provider: "p", models: { a: "b" } },
      ["kind"],
    ));
  it("rejects: empty models map (lease with nothing leased)", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: "m", provider: "p", models: {} },
      ["models"],
      "at least one alias",
    ));
  it("rejects: alias value not a string modelId", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: "m", provider: "p", models: { general: 42 } },
      ["models", "general"],
    ));
  it("rejects: fallbackChain element not string", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      {
        kind: "model",
        version: "1",
        name: "m",
        provider: "p",
        models: { a: "b" },
        fallbackChain: ["a", 7],
      },
      ["fallbackChain", "1"],
    ));
  it("rejects: usageAttr value not string", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: "m", provider: "p", models: { a: "b" }, usageAttr: { cost: 100 } },
      ["usageAttr", "cost"],
    ));
  it("rejects: baseUrlEnv as a literal URL instead of env name", () =>
    expectFieldRejected(
      modelProviderManifestSchema,
      { kind: "model", version: "1", name: "m", provider: "p", models: { a: "b" }, baseUrlEnv: 1234 },
      ["baseUrlEnv"],
    ));
});

describe("KnowledgeManifest", () => {
  const base = { kind: "knowledge", version: "1", name: "k", provider: "markdown" } as const;

  it("accepts: submodule mount with pinned ref", () => {
    expect(
      knowledgeManifestSchema.safeParse({ ...base, mount: { type: "submodule", path: "kb", ref: "v3" } }).success,
    ).toBe(true);
  });
  it("accepts: path mount, the minimal deployment", () => {
    expect(knowledgeManifestSchema.safeParse({ ...base, mount: { type: "path", path: "./books" } }).success).toBe(true);
  });
  it("accepts: git-sync mount with optional fields and token env lease", () => {
    expect(
      knowledgeManifestSchema.safeParse({
        ...base,
        workspaceId: "w-1",
        tokenEnv: "KB_TOKEN",
        mount: { type: "git-sync", repoUrl: "https://git.example.com/org/books", targetPath: "/srv/kb", intervalMs: 60_000 },
      }).success,
    ).toBe(true);
  });

  it("rejects: unknown mount type", () =>
    expectFieldRejected(knowledgeManifestSchema, { ...base, mount: { type: "nfs", path: "/x" } }, ["mount", "type"]));
  it("rejects: submodule without path", () =>
    expectFieldRejected(knowledgeManifestSchema, { ...base, mount: { type: "submodule" } }, ["mount", "path"]));
  it("rejects: git-sync without repoUrl", () =>
    expectFieldRejected(
      knowledgeManifestSchema,
      { ...base, mount: { type: "git-sync", targetPath: "/x" } },
      ["mount", "repoUrl"],
    ));
  it("rejects: git-sync without targetPath", () =>
    expectFieldRejected(knowledgeManifestSchema, { ...base, mount: { type: "git-sync", repoUrl: "https://a.b/c" } }, ["mount", "targetPath"]));
  it("rejects: path mount carrying git-sync fields", () =>
    expectKeyRejected(
      knowledgeManifestSchema,
      { ...base, mount: { type: "path", path: "./books", repoUrl: "https://a.b/c" } },
      ["mount"],
      "repoUrl",
    ));
  it("rejects: tokenEnv not a string", () =>
    expectFieldRejected(knowledgeManifestSchema, { ...base, tokenEnv: true, mount: { type: "path", path: "p" } }, ["tokenEnv"]));
  it("rejects: path mount without path", () =>
    expectFieldRejected(knowledgeManifestSchema, { ...base, mount: { type: "path" } }, ["mount", "path"]));
  it("rejects: missing name", () =>
    expectFieldRejected(
      knowledgeManifestSchema,
      { kind: "knowledge", version: "1", name: undefined, provider: "markdown", mount: { type: "path", path: "p" } },
      ["name"],
    ));
  it("rejects: envelope version other than 1 on a knowledge body", () =>
    expectFieldRejected(
      knowledgeManifestSchema,
      { kind: "knowledge", version: "0", name: "k", provider: "markdown", mount: { type: "path", path: "p" } },
      ["version"],
    ));
  it("accepts (type-only): capabilities.write=false remains type-legal — gating its effect is core's duty, not this schema's", () => {
    // Read-only declaration is a valid provider shape; core must act on it.
    // Compile-only assertion — no runtime behavior to test at the contracts layer.
    const readOnly = {
      name: "read-only-kb",
      capabilities: { search: true, write: false },
      async bootstrap() {
        return { index: { entries: [] }, recentUpdates: [] };
      },
      async search() {
        return []; // empty array, never throw — per interface doc.
      },
      async getPage(id) {
        return { id, title: "t", body: "" };
      },
      async listPages() {
        return { entries: [] };
      },
      async writePage(draft) {
        void draft;
        return { receiptId: "r", pageId: "p", createdAtMs: 0 };
      },
    } satisfies import("../index.js").KnowledgeProvider;
    expectTypeOf(readOnly.capabilities.write).toMatchTypeOf<boolean>();
  });
});

describe("Preset", () => {
  const base = { kind: "preset", version: "1", name: "p", knowledge: "k", model: "m", tools: ["t1"], entry: "e" } as const;

  it("accepts: four-slot reference graph", () => {
    expect(presetSchema.safeParse(base).success).toBe(true);
  });
  it("accepts: multiple tool references in mount order", () => {
    expect(presetSchema.safeParse({ ...base, tools: ["a", "b", "c"] }).success).toBe(true);
  });
  it("accepts: zero tools (knowledge-only assistant is expressible)", () => {
    expect(presetSchema.safeParse({ ...base, tools: [] }).success).toBe(true);
  });

  for (const slot of ["knowledge", "model", "entry"] as const) {
    it(`rejects: missing required slot ${slot}`, () =>
      expectFieldRejected(presetSchema, { ...base, [slot]: undefined }, [slot]));
  }
  it("rejects: tools missing", () =>
    expectFieldRejected(presetSchema, { ...base, tools: undefined }, ["tools"]));
  it("rejects: tools element not string", () =>
    expectFieldRejected(presetSchema, { ...base, tools: [42] }, ["tools", "0"]));
  it("rejects: inline config in a slot instead of a name reference", () =>
    expectFieldRejected(presetSchema, { ...base, model: { provider: "vendor" } }, ["model"]));
  it("rejects: name missing", () =>
    expectFieldRejected(presetSchema, { ...base, name: undefined }, ["name"]));
  it("rejects: envelope version other than 1", () =>
    expectFieldRejected(presetSchema, { ...base, version: "2" }, ["version"]));
  it("rejects: kind tool on a preset body", () =>
    expectFieldRejected(presetSchema, { ...base, kind: "tool" }, ["kind"]));
});

describe("EntryAdapter (type-only: no runtime schema exists)", () => {
  // The entry contract is a behavior interface; vitest never executes this shape.
  // The satisfies operator below IS the test — if the contract drifts, tsc fails.
  const mock = {
    async identity() {
      return { userId: "u", tenant: { tenantId: "t" } };
    },
    async session() {
      return { clientSessionId: "c", agentSessionId: "a" };
    },
    render(events) {
      void events; // presentation-only, never throws on display glitches — contract doc.
    },
    async confirm(req) {
      void req;
      return { approved: false, decidedBy: "compile-check-stub" };
    },
    capabilities: { confirm: false }, // honest declaration: this entry cannot ask a human.
  } satisfies EntryAdapter;

  it("accepts (compile-only): mock conforms to EntryAdapter", () => {
    // Only structural type assertions here — zero runtime semantics.
    expectTypeOf(mock.confirm).parameter(0).toMatchTypeOf<{ requestId: string }>();
    expectTypeOf(mock.identity).returns.resolves.toMatchTypeOf<{ userId: string; tenant: { tenantId: string } }>();
  });
});
