/**
 * TOOL SUITE — sandbox-roots conformance (D-0910-7 / NEW-1, fully offline).
 *
 * The statute under test: "a preset must not declare a capability surface the
 * kernel cannot honor." Evidence chain (see adapter run.ts JSDoc): the kernel
 * answers a stdio server's MCP roots/list with cwd ∪ granted additional
 * directories; server-filesystem 2026.8.x REPLACES its argv roots with that
 * answer — so an argv-declared root that is not in the grant is a mount that
 * LIES ("mounted but capability-empty"), and the drift check cannot see it
 * (the tools enumerate fine; only path reachability dies).
 *
 * The conformance clause: for every stdio mount plan carrying absolute-path
 * args, the root set handed to the kernel must equal the declared root set ∪
 * the session workspace — plan-derived, never a code constant, flags/package
 * names excluded. Asserted through the adapter's PUBLIC pure-function surface
 * (buildQueryOptions against an injected env; no spawn, no network, no real
 * credentials) — the same black-box precedent as the entry suites.
 */
import { describe, expect, it } from "vitest";
import { buildQueryOptions, canUseToolFromPlans, fsRootsFromPlans } from "@agentos/adapter-claude-sdk";
import type { ToolMountPlan } from "@agentos/contracts";

const FAKE_ENV = {
  AGENTOS_SMOKE_BASE_URL: "https://channel.example/anthropic",
  AGENTOS_SMOKE_API_KEY: "sk-conformance-fake-not-real",
} as const;

const lease = { provider: "vendor-x", baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" } as const;

const stdioPlan = (key: string, args: string[]): ToolMountPlan => ({
  key,
  transport: "stdio",
  stdio: { command: "npx", args },
  allowedTools: ["read_file"],
});

describe("sandbox-roots contract (D-0910-7): the grant mirrors the declaration", () => {
  it("every absolute path a stdio plan declares as a root reaches the kernel grant exactly once", () => {
    const plans = [
      stdioPlan("fs", ["-y", "@modelcontextprotocol/server-filesystem", "/declared/root"]),
      stdioPlan("fs-b", ["-y", "@modelcontextprotocol/server-filesystem", "/declared/root", "/other/root"]),
      { key: "remote", transport: "http", http: { url: "https://x.example/rpc" } } as ToolMountPlan,
    ];
    const opts = buildQueryOptions(
      { model: lease, prompt: "x", toolMounts: plans, workspaceDir: "/ws/session-1" },
      FAKE_ENV,
    );
    expect(opts.additionalDirectories).toEqual(["/declared/root", "/other/root", "/ws/session-1"]);
  });

  it("a plan root set with no absolute paths grants only the workspace — flags and package names are never roots", () => {
    expect(fsRootsFromPlans([stdioPlan("fs", ["-y", "pkg"])], "/ws/session-1")).toEqual(["/ws/session-1"]);
    expect(fsRootsFromPlans([stdioPlan("fs", ["-y", "pkg"])], undefined)).toEqual([]);
  });

  it("clean-room clauses are NOT loosened by the grant: settingSources/skills stay sealed, cwd stays the workspace", () => {
    const opts = buildQueryOptions(
      { model: lease, prompt: "x", toolMounts: [stdioPlan("fs", ["/declared/root"])], workspaceDir: "/ws/session-1" },
      FAKE_ENV,
    );
    expect(opts.settingSources).toEqual([]);
    expect(opts.skills).toEqual([]);
    expect(opts.cwd).toBe("/ws/session-1");
    // the grant widens path reachability for the DECLARED mount only — the
    // builtin availability gate is untouched by it
    expect(opts.tools).toEqual(["Read"]);
  });

  it("the legacy smoke shape (no workspaceDir, no stdio roots) sends NO grant key at all — zero-diff parity", () => {
    const opts = buildQueryOptions(
      { model: lease, prompt: "x", toolMounts: [{ key: "remote", transport: "http", http: { url: "https://x/rpc" } }] },
      FAKE_ENV,
    );
    expect(opts.additionalDirectories).toBeUndefined();
    expect("additionalDirectories" in opts).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* ④a execution-side hard gate: canUseTool mirrors the declared menu.         */

describe("canUseTool hard gate (④a): execution mirrors the advertisement", () => {
  it("ALLOW: Read and every mcp__<mounted-key>__* pass the gate", () => {
    const plans = [
      stdioPlan("mcp-filesystem", ["/repo"]),
      { key: "kb", transport: "sdk", sdk: { factoryName: "kb" } } as ToolMountPlan,
    ];
    const gate = canUseToolFromPlans(plans);
    expect(gate("Read")).toBe(true);
    expect(gate("mcp__mcp-filesystem__read_file")).toBe(true);
    expect(gate("mcp__kb__kb_commit")).toBe(true);
  });

  it("DENY: banned builtins and unmounted mcp keys are refused — structured deny, never a throw", () => {
    const plans = [stdioPlan("mcp-filesystem", ["/repo"])];
    const gate = canUseToolFromPlans(plans);
    for (const banned of ["Bash", "Write", "Edit", "WebFetch", "Task"]) expect(gate(banned)).toBe(false);
    expect(gate("mcp__ghost-server__sneaky")).toBe(false); // not a mounted key
  });

  it("mount-key matching is exact: mcp__mcp-filesystem-x__read_file is NOT mcp-filesystem", () => {
    const plans = [stdioPlan("mcp-filesystem", ["/repo"])];
    const gate = canUseToolFromPlans(plans);
    expect(gate("mcp__mcp-filesystem-x__read_file")).toBe(false); // different key, must not prefix-match
    expect(gate("mcp__mcp-filesystem__read_file")).toBe(true);
  });
});
