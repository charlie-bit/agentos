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
  /** Human-in-the-loop gate (#361); deny-on-timeout is the confirm contract (#77). */
  z.strictObject({ type: z.literal("human"), prompt: z.string().min(1), timeoutMs: z.number().int().positive().optional() }),
]);

const trigger = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("manual") }),
  /** Five-field cron (#357 parser); aliases @daily/@weekly allowed as strings. */
  z.strictObject({ type: z.literal("schedule"), cron: z.string().min(1) }),
  /** Bearer value is read from the named env var at call time (#12). */
  z.strictObject({ type: z.literal("webhook"), secretEnv: z.string().min(1) }),
]);

export const workflowManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("workflow"),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  steps: z.array(step).min(1),
  trigger: trigger.optional(),
});

export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
export type WorkflowStep = z.infer<typeof step>;
export type WorkflowTrigger = z.infer<typeof trigger>;
