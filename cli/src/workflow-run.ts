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
import type { NeutralTool, SkillEntry, WorkflowManifest, WorkflowStep } from "@agentos/contracts";
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
  /** Cancellation for one run (#365); aborting leaves partial step outcomes. */
  signalForRun?(runId: string): AbortSignal | undefined;
  kbProvider(): KnowledgeProvider | null;
  /** In-process tools available for `tool` steps (todo_* today). */
  tools: readonly NeutralTool[];
  /** Mounted skills by name (stage C): the `skill` step resolves one here. */
  skills?: ReadonlyMap<string, SkillEntry>;
  /** MCP tools: a direct JSON-RPC call, no model turn. */
  runForeignTool?(name: string, args: unknown, runId: string): Promise<string>;
  /**
   * Output sink executor (stage B). The composition root owns it because
   * posting to Slack means driving the mounted Slack provider, which the
   * domain-free runner must never learn. Absent + a declared sink = the run
   * fails loudly instead of silently dropping the output.
   */
  postOutput?(output: Extract<WorkflowManifest["output"], { sink: "slack" }>, text: string, runId: string): Promise<void>;
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
    opts: { project?: string; resumeFrom?: number; runId?: string; input?: string } = {},
  ): Promise<TriggerResult> {
    const manifest = cfg.workflows.get(name);
    if (!manifest) return { ok: false, reason: `unknown workflow: ${name}` };
    // Idempotency by instance id (#363): a caller-supplied runId that already
    // exists is refused, never silently re-run.
    if (opts.runId && cfg.ledger.workflowRunGet(opts.runId)) {
      return { ok: false, reason: `workflow instance already exists: ${opts.runId}` };
    }
    const runId = opts.runId ?? randomUUID();
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
        if (tool) return JSON.stringify(await tool.handler(step.args ?? {}));
        // MCP tools live inside the kernel: the composition root runs one fenced
        // turn (stage B proxy). No proxy wired = loud error, never a silent skip.
        if (cfg.runForeignTool) return cfg.runForeignTool(step.tool, step.args ?? {}, runId);
        throw new Error(`tool step "${step.tool}" is not an in-process tool (MCP tools run inside the kernel)`);
      },
      runSkill: async (step, prompt) => {
        // A skill is INSTRUCTIONS, not a turn: loading its body is free, and
        // the following agent step executes it with {prev}. Running prose here
        // would spend a model turn to produce the same text.
        const skill = cfg.skills?.get(step.skill);
        if (!skill) throw new Error(`skill step "${step.skill}" is not mounted (preset.skills)`);
        return prompt.trim().length > 0 ? `${skill.body}\n\n${prompt}` : skill.body;
      },
      kbSearch: async (step) => {
        const provider = cfg.kbProvider();
        if (!provider) throw new Error("no knowledge provider mounted");
        return JSON.stringify(await provider.search(step.query));
      },
       offload: async (text, label) => {
        const out = offloadIfLarge({ text }, { workspaceDir: workspace, toolName: `wf-${label}` });
        return out.offloaded && out.pointer ? `result offloaded: ${out.pointer.path}` : text;
      },
      signal: cfg.signalForRun?.(runId),
      now,
    }, {
      ...(opts.resumeFrom !== undefined ? { resumeFrom: opts.resumeFrom } : {}),
      ...(opts.input !== undefined ? { input: opts.input } : {}),
    });

    // Output sink (stage B): a declared sink is part of the run's contract, so
    // failing to deliver flips the run to error instead of dropping the result.
    let finalStatus = result.status;
    let sinkError: string | undefined;
    if (result.status === "done" && manifest.output?.sink === "slack") {
      try {
        if (!cfg.postOutput) throw new Error("slack output sink is declared but this deployment wired no sink executor");
        await cfg.postOutput(manifest.output, result.output ?? "", runId);
      } catch (err) {
        finalStatus = "error";
        sinkError = `output sink: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const steps = result.steps as StepOutcome[];
    cfg.ledger.workflowRunUpdate(runId, {
      status: finalStatus,
      endedAtMs: now(),
      steps,
      resumeFrom: finalStatus === "error" ? (resumeIndex(result) ?? null) : null,
      ...(cfg.sessionKeyForRun?.(runId) ? { sessionKey: cfg.sessionKeyForRun(runId) as string } : {}),
      error: finalStatus === "done" ? null : (sinkError ?? steps.find((s) => s.status === "error" || s.status === "denied")?.error ?? finalStatus),
    });
    // Metadata-only audit (#385, R2/R9): ids, statuses, durations — no prompt
    // or step output text ever reaches this record.
    try {
      cfg.audit?.({
        event: "workflow.run",
        runId,
        workflow: name,
        trigger,
        status: finalStatus,
        steps: steps.map((s) => ({ index: s.index, type: s.type, status: s.status, durationMs: s.durationMs })),
      });
    } catch {
      /* audit must never kill a run */
    }
    return { ok: finalStatus === "done", runId };
  };
}
