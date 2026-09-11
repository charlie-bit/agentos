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
import { buildQueryOptions, fsRootsFromPlans } from "@agentos/adapter-claude-sdk";
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
