/**
 * spec #447 — crash recovery through the LEDGER, not just the pure runner:
 * a failed instance is resumable by a NEW runner (process restart simulated by
 * constructing a fresh runner on the same database).
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkflowManifest } from "@agentos/contracts";
import { buildTodoTools, openLedger } from "@agentos/core";
import { createWorkflowRunner } from "../workflow-run.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

const manifest: WorkflowManifest = {
  kind: "workflow",
  version: "1",
  name: "recover",
  steps: [
    { type: "kb_search", query: "x" },
    { type: "tool", tool: "todo_add", args: { title: "after restart" } },
  ],
} as WorkflowManifest;

describe("workflow crash recovery (spec #447)", () => {
  it("an interrupted/failed instance resumes from its recorded step on a fresh runner", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-wf-recover-"));
    dirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const workspace = join(dir, "ws");
    mkdirSync(workspace, { recursive: true });

    const make = (tools: ReturnType<typeof buildTodoTools>, ledger: ReturnType<typeof openLedger>) =>
      createWorkflowRunner({
        ledger,
        workflows: new Map([["recover", manifest]]),
        workspaceFor: () => workspace,
        runAgentTurn: async () => "n/a",
        kbProvider: () => ({ search: async () => [{ id: "p", title: "p", score: 1 }] }) as never,
        tools,
        now: () => 1000,
      });

    // run 1: kb step passes, the tool step fails (nothing injected) -> error@1
    const led1 = openLedger(dbPath);
    await make([], led1)("recover", "manual");
    const failed = led1.workflowRunList()[0]!;
    expect(failed.status).toBe("error");
    expect(failed.resumeFrom).toBe(1);
    led1.close();

    // run 2 (fresh process, same DB): tools available, resume from step 1
    const led2 = openLedger(dbPath);
    const result = await make(buildTodoTools({ ledger: led2 }), led2)("recover", "manual", { resumeFrom: failed.resumeFrom as number });
    expect(result.ok).toBe(true);
    const done = led2.workflowRunGet(result.runId as string)!;
    expect(done.status).toBe("done");
    expect((done.steps as Array<{ status: string }>)[0]?.status).toBe("skipped");
    expect(led2.todoList()).toHaveLength(1);
    led2.close();
  });
});
