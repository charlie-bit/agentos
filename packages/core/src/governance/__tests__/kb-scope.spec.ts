/** spec #337 — a role's knowledge declaration fences kb_search to a subtree. */
import { describe, expect, it } from "vitest";
import { buildKbTools } from "../tools.js";
import type { KnowledgeProvider } from "@agentos/contracts";

function provider(calls: Array<unknown>): KnowledgeProvider {
  return {
    name: "fake",
    capabilities: { search: true, write: false },
    bootstrap: async () => ({ index: { entries: [] }, recentUpdates: [] }),
    search: async (_q, opts) => {
      calls.push(opts);
      return [];
    },
    getPage: async (id) => ({ id, title: id, body: "" }),
    listPages: async () => ({ entries: [] }),
    writePage: async () => ({ receiptId: "r", pageId: "p", createdAtMs: 0 }),
    commit: async () => ({ path: "p", commit: "s", appended: false }),
  };
}

const ctx = (over: Record<string, unknown>) => ({
  provider: provider([]),
  confirmCapable: false,
  bookRoot: "/b",
  draftsDir: "/d",
  receiptsLog: "/r",
  workspaceOverviewFile: "/w/ov.md",
  confirm: async () => ({ approved: false }),
  tenant: { tenantId: "t" },
  ...over,
});

describe("kb search scope (spec #337)", () => {
  it("passes the role scope to provider.search; absent scope leaves it unset", async () => {
    const calls: Array<unknown> = [];
    const scoped = buildKbTools(ctx({ provider: provider(calls), searchScope: "team-a" }) as never);
    await scoped.find((t) => t.name === "kb_search")!.handler({ q: "x", limit: 5 });
    expect(calls[0]).toEqual({ limit: 5, scope: "team-a" });

    const calls2: Array<unknown> = [];
    const open = buildKbTools(ctx({ provider: provider(calls2) }) as never);
    await open.find((t) => t.name === "kb_search")!.handler({ q: "x" });
    expect(calls2[0]).toEqual({});
  });
});
