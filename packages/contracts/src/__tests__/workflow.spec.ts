/** spec #353/#354/#356 — the closed step and trigger vocabularies. */
import { describe, expect, it } from "vitest";
import { workflowManifestSchema } from "../workflow.js";

const wf = (steps: unknown[], trigger?: unknown) => ({ kind: "workflow", version: "1", name: "w", steps, ...(trigger ? { trigger } : {}) });

describe("WorkflowManifest (#353)", () => {
  it("accepts each of the five step types", () => {
    for (const step of [
      { type: "agent", agent: "analyst", prompt: "summarise" },
      { type: "tool", tool: "todo_list", args: { status: "todo" } },
      { type: "skill", skill: "triage", prompt: "run it" },
      { type: "kb_search", query: "retry" },
      { type: "human", prompt: "approve the release?", timeoutMs: 60000 },
    ]) {
      expect(workflowManifestSchema.safeParse(wf([step])).success, JSON.stringify(step)).toBe(true);
    }
  });

  it("rejects unknown step types, empty steps and extra keys", () => {
    expect(workflowManifestSchema.safeParse(wf([{ type: "shell", command: "rm" }])).success).toBe(false);
    expect(workflowManifestSchema.safeParse(wf([])).success).toBe(false);
    expect(workflowManifestSchema.safeParse(wf([{ type: "kb_search", query: "x", extra: 1 }])).success).toBe(false);
  });

  it("accepts the three trigger types and rejects others (#356)", () => {
    for (const trigger of [{ type: "manual" }, { type: "schedule", cron: "@daily" }, { type: "webhook", secretEnv: "HOOK_TOKEN" }]) {
      expect(workflowManifestSchema.safeParse(wf([{ type: "kb_search", query: "x" }], trigger)).success).toBe(true);
    }
    expect(workflowManifestSchema.safeParse(wf([{ type: "kb_search", query: "x" }], { type: "mcp" })).success).toBe(false);
    expect(workflowManifestSchema.safeParse(wf([{ type: "kb_search", query: "x" }], { type: "webhook", secret: "literal" })).success).toBe(false);
  });
});

describe("workflow concurrency declaration (#366)", () => {
  it("preset accepts a bounded workflow concurrency and rejects nonsense", async () => {
    const { presetSchema } = await import("../preset.js");
    const base = { kind: "preset", version: "1", name: "p", knowledge: "k", model: "m", tools: [], entry: "cli" };
    expect(presetSchema.safeParse({ ...base, maxConcurrentWorkflows: 2 }).success).toBe(true);
    expect(presetSchema.safeParse({ ...base, maxConcurrentWorkflows: 0 }).success).toBe(false);
    expect(presetSchema.safeParse({ ...base, maxConcurrentWorkflows: 1.5 }).success).toBe(false);
  });
});
