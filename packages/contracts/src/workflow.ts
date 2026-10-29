/**
 * Workflow manifest (spec #353/#354/#356, rulings D/E): steps are a closed
 * five-type union — the kernel never grows domain step kinds (#177). Triggers
 * are closed too (manual / schedule / webhook); schedule uses a hand-written
 * cron parser (#357), webhook authenticates by env-var NAME (#12 posture).
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

const step = z.discriminatedUnion("type", [
  /** Runs a config/agents role for one turn (#328), carrying its fence. */
  z.strictObject({ type: z.literal("agent"), agent: z.string().min(1), prompt: z.string().min(1) }),
  /** Calls one mounted tool by bare name (#18/#19 surface). */
  z.strictObject({
    type: z.literal("tool"),
    tool: z.string().min(1),
    args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  /** Runs a skill through the knowledge channel (#139); prompt optional. */
  z.strictObject({ type: z.literal("skill"), skill: z.string().min(1), prompt: z.string().min(1).optional() }),
  /** Knowledge lookup via the mounted provider. */
  z.strictObject({ type: z.literal("kb_search"), query: z.string().min(1) }),
  /**
   * Review gate: a mounted ROLE judges the previous result. Roles can be
   * anything (including a skill-backed reviewer), so the human-gate concept
   * becomes an automated gate that still stops the run on a rejection.
   * The verdict is the role talking: output must contain `mustInclude`
   * (default "APPROVE") to continue.
   */
  z.strictObject({
    type: z.literal("review"),
    agent: z.string().min(1),
    prompt: z.string().min(1).optional(),
    mustInclude: z.string().min(1).optional(),
  }),
]);

const trigger = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("manual") }),
  /** Five-field cron (#357 parser); aliases @daily/@weekly allowed as strings. */
  z.strictObject({ type: z.literal("schedule"), cron: z.string().min(1) }),
  /** Bearer value is read from the named env var at call time (#12). */
  z.strictObject({ type: z.literal("webhook"), secretEnv: z.string().min(1) }),
]);

/**
 * Where a run's seed value comes from (stage B, additive). "manual" means the
 * caller supplies it (the run endpoint's `input`); "none" starts empty. Slack
 * pull input is a later additive member, not a silent no-op today.
 */
const input = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("none") }),
  z.strictObject({ source: z.literal("manual") }),
]);

/**
 * Where the final step result goes (stage B, additive). "slack" posts the
 * bounded run output to one channel through the mounted Slack tool; the
 * composition root owns that call, the runner never learns a vendor API.
 */
const output = z.discriminatedUnion("sink", [
  z.strictObject({ sink: z.literal("none") }),
  z.strictObject({
    sink: z.literal("slack"),
    channel: z.string().min(1),
    /** Tool name on the mounted Slack provider; default slack_post_message. */
    tool: z.string().min(1).optional(),
  }),
]);

export const workflowManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("workflow"),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  /** The workflow's theme ("what I am doing"), for grouping in the console. */
  category: z.string().min(1).optional(),
  input: input.optional(),
  output: output.optional(),
  steps: z.array(step).min(1),
  trigger: trigger.optional(),
});

export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
export type WorkflowStep = z.infer<typeof step>;
export type WorkflowTrigger = z.infer<typeof trigger>;
export type WorkflowInput = z.infer<typeof input>;
export type WorkflowOutput = z.infer<typeof output>;
