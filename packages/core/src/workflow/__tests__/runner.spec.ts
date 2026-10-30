/** spec #359–#362 — the sequential engine, all deps injected. */
import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@agentos/contracts";
import { resumeIndex, runWorkflow, STEP_CONTEXT_CAP_BYTES, type WorkflowDeps } from "../runner.js";

const deps = (over: Partial<WorkflowDeps> = {}): WorkflowDeps & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    runAgent: async (_s, prompt) => {
      calls.push(`agent:${prompt}`);
      return `A(${prompt})`;
    },
    runTool: async (s) => {
      calls.push(`tool:${s.tool}`);
      return "tool-out";
    },
    runSkill: async (s, prompt) => {
      calls.push(`skill:${s.skill}:${prompt}`);
      return "skill-out";
    },
    kbSearch: async (s) => {
      calls.push(`kb:${s.query}`);
      return "kb-out";
    },
     offload: async (text, label) => {
      calls.push(`offload:${label}`);
      return `[offloaded ${text.length} bytes → pointer]`;
    },
    now: () => 0,
    ...over,
  } as WorkflowDeps & { calls: string[] };
};

describe("runWorkflow (#359)", () => {
  it("runs three heterogeneous steps in order and threads {prev}", async () => {
    const d = deps();
    const steps: WorkflowStep[] = [
      { type: "agent", agent: "analyst", prompt: "summarise" },
      { type: "kb_search", query: "retry" },
      { type: "tool", tool: "todo_add", args: { title: "x" } },
    ];
    const r = await runWorkflow(steps, d);
    expect(r.status).toBe("done");
    expect(d.calls).toEqual(["agent:summarise", "kb:retry", "tool:todo_add"]);
    expect(r.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("seeds the run input into {input}, and the first step also sees it as {prev} (stage B)", async () => {
    const d = deps();
    const steps: WorkflowStep[] = [
      { type: "agent", agent: "analyst", prompt: "first: {prev} / {input}" },
      { type: "agent", agent: "writer", prompt: "second: {prev} / {input}" },
    ];
    const r = await runWorkflow(steps, d, { input: "SEED" });
    expect(r.status).toBe("done");
    expect(d.calls[0]).toBe("agent:first: SEED / SEED");
    // After step 1, {prev} is its output; {input} stays the original seed.
    expect(d.calls[1]).toBe("agent:second: A(first: SEED / SEED) / SEED");
  });

  it("offloads a >1KB step result and passes the pointer forward (#360)", async () => {
    const base = deps();
    let call = 0;
    const d = {
      ...base,
      runAgent: async (_s: never, prompt: string) => {
        base.calls.push(`agent:${prompt}`);
        call += 1;
        return call === 1 ? "x".repeat(STEP_CONTEXT_CAP_BYTES + 1) : "ok";
      },
    } as typeof base;
    const r = await runWorkflow(
      [
        { type: "agent", agent: "a", prompt: "big" },
        { type: "agent", agent: "b", prompt: "use {prev}" },
      ],
      d,
    );
    expect(r.steps[0]?.output).toContain("pointer");
    expect(d.calls.some((c) => c.startsWith("offload:"))).toBe(true);
    expect(d.calls.some((c) => c.startsWith("agent:use [offloaded"))).toBe(true);
  });
});

describe("review step: a mounted role judges the last result", () => {
  it("an approving reviewer continues; a rejection stops with earlier results kept", async () => {
    const approve = deps({ runAgent: async () => "APPROVE: looks good" });
    const ok = await runWorkflow([{ type: "kb_search", query: "x" }, { type: "review", agent: "reviewer", prompt: "ship?" }], approve);
    expect(ok.status).toBe("done");
    expect(ok.steps.map((s) => s.status)).toEqual(["ok", "ok"]);

    const deny = deps({ runAgent: async () => "REJECT: missing tests" });
    const rejected = await runWorkflow(
      [{ type: "kb_search", query: "x" }, { type: "review", agent: "reviewer", prompt: "ship?" }, { type: "tool", tool: "nope" }],
      deny,
    );
    expect(rejected.status).toBe("error");
    expect(rejected.steps.map((s) => s.status)).toEqual(["ok", "denied"]);
  });

  it("mustInclude overrides the default verdict word", async () => {
    const d = deps({ runAgent: async () => "LGTM, ship it" });
    const r = await runWorkflow([{ type: "review", agent: "reviewer", mustInclude: "LGTM" }], d);
    expect(r.status).toBe("done");
  });
});

describe("failure and resume (#362)", () => {
  it("a failing step stops the run, keeps earlier results and names the resume index", async () => {
    const d = deps({
      runTool: async () => {
        throw new Error("boom");
      },
    });
    const r = await runWorkflow([{ type: "kb_search", query: "a" }, { type: "tool", tool: "bad" }, { type: "kb_search", query: "c" }], d);
    expect(r.status).toBe("error");
    expect(r.steps.map((s) => s.status)).toEqual(["ok", "error"]);
    expect(resumeIndex(r)).toBe(1);

    const resumed = await runWorkflow(
      [{ type: "kb_search", query: "a" }, { type: "tool", tool: "bad" }, { type: "kb_search", query: "c" }],
      deps(),
      { resumeFrom: 1 },
    );
    expect(resumed.steps[0]?.status).toBe("skipped");
    expect(resumed.status).toBe("done");
  });

  it("aborts cooperatively via the signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await runWorkflow([{ type: "kb_search", query: "a" }], deps({ signal: controller.signal }));
    expect(r.status).toBe("aborted");
  });
});
