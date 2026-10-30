/**
 * spec #370/#377/#383 (headless path) — the runner end to end, with stubs.
 * No model, no network: agent steps use an injected turn stub, kb_search uses
 * a real markdown provider over a temp book, tool steps run the real todo tools.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkflowManifest } from "@agentos/contracts";
import { buildTodoTools, openLedger } from "@agentos/core";
import { createMarkdownProvider } from "@agentos/knowledge-markdown";
import { createWorkflowRunner } from "../workflow-run.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

function setup(manifest: WorkflowManifest, agentReply = "summarised", confirmSteps = true) {
  const dir = mkdtempSync(join(tmpdir(), "agentos-wfrun-"));
  dirs.push(dir);
  const ledger = openLedger(join(dir, "sessions.db"));
  const book = join(dir, "book");
  mkdirSync(book, { recursive: true });
  writeFileSync(
    join(book, "retry.md"),
    "---\nowner: t\nlast_verified: 2026-01-01\nstale_after: 2027-01-01\nstatus: published\n---\n# Retry policy\nbackoff capped\n",
  );
  const provider = createMarkdownProvider({ root: book, draftsDir: join(dir, "drafts"), receiptsLog: join(dir, "receipts.jsonl") });
  const audit: Array<Record<string, unknown>> = [];
  const runner = createWorkflowRunner({
    audit: (r) => audit.push(r),
    ledger,
    workflows: new Map([[manifest.name, manifest]]),
    workspaceFor: (id) => {
      const ws = join(dir, "ws", id);
      mkdirSync(ws, { recursive: true });
      return ws;
    },
    runAgentTurn: async (step, prompt) => {
      expect(prompt).toContain("context:");
      return `${agentReply} for ${step.agent}`;
    },
    kbProvider: () => provider,
    tools: buildTodoTools({ ledger }),
    now: () => 1000,
  });
  void confirmSteps;
  return { runner, ledger, audit };
}

const wf = (steps: WorkflowManifest["steps"]): WorkflowManifest => ({ kind: "workflow", version: "1", name: "daily", steps }) as WorkflowManifest;

describe("headless workflow runner", () => {
  it("runs agent → kb_search → todo tool and persists a done instance", async () => {
    const { runner, ledger, audit } = setup(
      wf([
        { type: "agent", agent: "analyst", prompt: "summarise context: {prev}" },
        { type: "kb_search", query: "backoff" },
        { type: "tool", tool: "todo_add", args: { title: "Review brief" } },
      ]),
    );
    const result = await runner("daily", "manual");
    expect(result.ok).toBe(true);
    const runs = ledger.workflowRunList({ workflow: "daily" });
    expect(runs[0]?.status).toBe("done");
    expect((runs[0]?.steps as Array<{ status: string }>).map((s) => s.status)).toEqual(["ok", "ok", "ok"]);
    expect(ledger.todoList()).toHaveLength(1);
    expect(audit[0]).toMatchObject({ event: "workflow.run", workflow: "daily", status: "done", trigger: "manual" });
    expect(JSON.stringify(audit[0])).not.toContain("Review brief"); // prompt/step text never audited (R2)
    ledger.close();
  });

  it("a review step rejects when the role does not approve; the run is resumable at that index", async () => {
    const { runner, ledger } = setup(wf([{ type: "kb_search", query: "x" }, { type: "review", agent: "reviewer", prompt: "review context: {prev}" }, { type: "tool", tool: "todo_add", args: {} }]));
    const result = await runner("daily", "schedule");
    expect(result.ok).toBe(false);
    const run = ledger.workflowRunList()[0]!;
    expect(run.status).toBe("error");
    expect(run.resumeFrom).toBe(1);
    ledger.close();
  });

  it("an MCP tool name with no direct-call wiring is refused instead of faked; unknown workflow is 404-shaped", async () => {
    const { runner, ledger } = setup(wf([{ type: "tool", tool: "mcp_remote_search", args: {} }]));
    expect((await runner("daily", "manual")).ok).toBe(false);
    expect((await runner("ghost", "manual")).ok).toBe(false);
    ledger.close();
  });
});
