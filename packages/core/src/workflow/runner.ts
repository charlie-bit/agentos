/**
 * Sequential workflow runner (spec #359–#362). Domain-free: every step type
 * is a capability injected by the composition root, so the kernel never
 * parses MCP results (#177) and never runs a step itself.
 *
 * Laws:
 *   - steps run in order; `{prev}` in a prompt is replaced by the previous
 *     result, and a result over 1KB is offloaded with a pointer (#360);
 *   - a human step is a confirmation; denial stops the run (#361);
 *   - the first failure stops the run, earlier results are kept, and
 *     `resumeFrom` skips already-completed steps (#362);
 *   - cancellation is cooperative via AbortSignal (#365 follows the same law).
 */
import type { WorkflowStep } from "@agentos/contracts";

export const STEP_CONTEXT_CAP_BYTES = 1024;

export interface StepOutcome {
  index: number;
  type: WorkflowStep["type"];
  status: "ok" | "error" | "denied" | "skipped";
  /** Bounded text handed to the next step (pointer when offloaded). */
  output?: string;
  durationMs: number;
  error?: string;
}

export type RunStatus = "done" | "error" | "aborted";

export interface WorkflowDeps {
  runAgent(step: Extract<WorkflowStep, { type: "agent" }>, prompt: string): Promise<string>;
  runTool(step: Extract<WorkflowStep, { type: "tool" }>, prev: string | undefined): Promise<string>;
  runSkill(step: Extract<WorkflowStep, { type: "skill" }>, prompt: string): Promise<string>;
  kbSearch(step: Extract<WorkflowStep, { type: "kb_search" }>): Promise<string>;
  /** Human gate; denial is a stop, timeout is the confirm contract's duty (#77). */
  confirm(prompt: string, timeoutMs?: number): Promise<boolean>;
  /** Offload a large result (#206) and return the pointer line. */
  offload(text: string, label: string): Promise<string>;
  signal?: AbortSignal;
  now?: () => number;
}

export interface RunResult {
  status: RunStatus;
  steps: StepOutcome[];
  /** Bounded final output (last successful step). */
  output?: string;
}

const bytes = (s: string): number => Buffer.byteLength(s, "utf8");

function injectPrev(text: string, prev: string | undefined): string {
  return text.includes("{prev}") ? text.replaceAll("{prev}", prev ?? "") : text;
}

async function bound(text: string, deps: WorkflowDeps, label: string): Promise<string> {
  if (bytes(text) <= STEP_CONTEXT_CAP_BYTES) return text;
  return deps.offload(text, label);
}

export async function runWorkflow(
  steps: readonly WorkflowStep[],
  deps: WorkflowDeps,
  opts: { resumeFrom?: number } = {},
): Promise<RunResult> {
  const now = deps.now ?? Date.now;
  const outcomes: StepOutcome[] = [];
  let prev: string | undefined;
  const startIndex = Math.max(0, opts.resumeFrom ?? 0);

  // Steps before resumeFrom are recorded as skipped so the timeline is honest.
  for (let i = 0; i < startIndex; i += 1) {
    outcomes.push({ index: i, type: steps[i]!.type, status: "skipped", durationMs: 0 });
  }

  for (let i = startIndex; i < steps.length; i += 1) {
    const step = steps[i]!;
    if (deps.signal?.aborted) return { status: "aborted", steps: outcomes, ...(prev ? { output: prev } : {}) };
    const started = now();
    try {
      let raw: string;
      switch (step.type) {
        case "agent":
          raw = await deps.runAgent(step, injectPrev(step.prompt, prev));
          break;
        case "tool":
          raw = await deps.runTool(step, prev);
          break;
        case "skill":
          raw = await deps.runSkill(step, injectPrev(step.prompt ?? "", prev));
          break;
        case "kb_search":
          raw = await deps.kbSearch(step);
          break;
        case "human": {
          const approved = await deps.confirm(injectPrev(step.prompt, prev), step.timeoutMs);
          // Denial stops the run; this is not a retryable failure.
          outcomes.push({ index: i, type: step.type, status: approved ? "ok" : "denied", durationMs: now() - started, ...(approved ? {} : { error: "human denied" }) });
          if (!approved) return { status: "error", steps: outcomes, ...(prev ? { output: prev } : {}) };
          raw = prev ?? "approved";
          break;
        }
      }
      const output = await bound(raw, deps, `${step.type}-${i}`);
      outcomes.push({ index: i, type: step.type, status: "ok", output, durationMs: now() - started });
      prev = output;
    } catch (err) {
      outcomes.push({
        index: i,
        type: step.type,
        status: "error",
        durationMs: now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      // Failure keeps completed results (#362); resume continues from this index.
      return { status: "error", steps: outcomes, ...(prev ? { output: prev } : {}) };
    }
  }
  return { status: "done", steps: outcomes, ...(prev ? { output: prev } : {}) };
}

/** The step index a failed run should resume from (#362). */
export function resumeIndex(result: RunResult): number | undefined {
  const failed = result.steps.find((s) => s.status === "error" || s.status === "denied");
  return failed?.index;
}
