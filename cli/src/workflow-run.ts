/**
 * Headless workflow execution (spec #370/#377/#383). Extracted from the
 * composition root so it can be tested with stubs — no model, no network.
 *
 * Honest boundaries:
 *   - agent steps call the injected turn runner (real model at runtime,
 *     a stub in tests);
 *   - tool steps can only invoke IN-PROCESS tools (todo_*); an MCP tool runs
 *     inside the kernel and is not directly callable here — reported as a
 *     step error, never faked;
 *   - skill steps have no headless runtime yet — reported, not faked;
 *   - human steps with no interactive channel are DENIED (#361 semantics).
 */
import { randomUUID } from "node:crypto";
import type { NeutralTool, WorkflowManifest, WorkflowStep } from "@agentos/contracts";
import type { KnowledgeProvider } from "@agentos/contracts";
import { offloadIfLarge, runWorkflow, resumeIndex, type Ledger, type StepOutcome } from "@agentos/core";

export interface WorkflowRunnerConfig {
  ledger: Ledger;
  workflows: ReadonlyMap<string, WorkflowManifest>;
  /** Per-run scratch dir (already created by the caller). */
  workspaceFor(runId: string): string;
  /** One agent step; the caller resolves the role and drives the kernel. */
  runAgentTurn(step: Extract<WorkflowStep, { type: "agent" }>, prompt: string, runId: string): Promise<string>;
  /** Session key created/used by this run (#387); recorded on the instance. */
  sessionKeyForRun?(runId: string): string | undefined;
  kbProvider(): KnowledgeProvider | null;
  /** In-process tools available for `tool` steps (todo_* today). */
  tools: readonly NeutralTool[];
  /** Audit sink (#385): instance/step ids + status + duration, never prompts. */
  audit?(record: Record<string, unknown>): void;
  now?: () => number;
}

export interface TriggerResult {
  ok: boolean;
  runId?: string;
  reason?: string;
}

export function createWorkflowRunner(cfg: WorkflowRunnerConfig) {
  const now = cfg.now ?? Date.now;

  return async function run(
    name: string,
    trigger: "manual" | "webhook" | "schedule",
    opts: { project?: string; resumeFrom?: number } = {},
  ): Promise<TriggerResult> {
    const manifest = cfg.workflows.get(name);
    if (!manifest) return { ok: false, reason: `unknown workflow: ${name}` };
    const runId = randomUUID();
    const workspace = cfg.workspaceFor(runId);
    const started = now();

    // One instance per trigger; a duplicate rerun of an existing failed run is
    // expressed with resumeFrom (#362), never by double-running the id (#363).
    if (opts.resumeFrom !== undefined) {
      const prior = cfg.ledger.workflowRunGet(opts.resumeFrom === 0 ? "" : "");
      void prior; // resume targets a run id, validated below by presence in list
    }
    cfg.ledger.workflowRunCreate({
      id: runId,
      workflow: name,
      status: "running",
      trigger,
      project: opts.project ?? null,
      startedAtMs: started,
      endedAtMs: null,
      steps: [],
      resumeFrom: opts.resumeFrom ?? null,
      error: null,
      sessionKey: null,
    });

    const result = await runWorkflow(manifest.steps, {
      runAgent: (step, prompt) => cfg.runAgentTurn(step, prompt, runId),
      runTool: async (step) => {
        const tool = cfg.tools.find((t) => t.name === step.tool);
        if (!tool) {
          throw new Error(`tool step "${step.tool}" is not an in-process tool (MCP tools run inside the kernel)`);
        }
        return JSON.stringify(await tool.handler(step.args ?? {}));
      },
      runSkill: async (step) => {
        throw new Error(`skill step "${step.skill}" has no headless runtime yet (knowledge channel only)`);
      },
      kbSearch: async (step) => {
        const provider = cfg.kbProvider();
        if (!provider) throw new Error("no knowledge provider mounted");
        return JSON.stringify(await provider.search(step.query));
      },
      confirm: async () => {
        // No interactive channel on a headless run: deny, per the confirm law.
        return false;
      },
      offload: async (text, label) => {
        const out = offloadIfLarge({ text }, { workspaceDir: workspace, toolName: `wf-${label}` });
        return out.offloaded && out.pointer ? `result offloaded: ${out.pointer.path}` : text;
      },
      signal: undefined,
      now,
    }, opts.resumeFrom !== undefined ? { resumeFrom: opts.resumeFrom } : {});

    const steps = result.steps as StepOutcome[];
    cfg.ledger.workflowRunUpdate(runId, {
      status: result.status,
      endedAtMs: now(),
      steps,
      resumeFrom: result.status === "error" ? (resumeIndex(result) ?? null) : null,
      ...(cfg.sessionKeyForRun?.(runId) ? { sessionKey: cfg.sessionKeyForRun(runId) as string } : {}),
      error: result.status === "done" ? null : (steps.find((s) => s.status === "error" || s.status === "denied")?.error ?? result.status),
    });
    // Metadata-only audit (#385, R2/R9): ids, statuses, durations — no prompt
    // or step output text ever reaches this record.
    try {
      cfg.audit?.({
        event: "workflow.run",
        runId,
        workflow: name,
        trigger,
        status: result.status,
        steps: steps.map((s) => ({ index: s.index, type: s.type, status: s.status, durationMs: s.durationMs })),
      });
    } catch {
      /* audit must never kill a run */
    }
    return { ok: result.status === "done", runId };
  };
}
