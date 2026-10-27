/**
 * The preset is the single convergence point of the four sockets: it holds NAME
 * REFERENCES to manifests in config/ and zero inline configuration — switching
 * business = switching this one file.
 * Reference-integrity validation (do these names exist, with the right kinds)
 * is core loader's job, deliberately NOT this package: parse here guarantees
 * shape, resolvability is a deployment-time question.
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

export const presetSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("preset"),
  name: z.string().min(1),
  /** Name of a knowledge manifest. */
  knowledge: z.string().min(1),
  /** Name of a model manifest. */
  model: z.string().min(1),
  /** Names of tool manifests, in mount order. Duplicates are caller error, not schema's. */
  tools: z.array(z.string().min(1)),
  /** Name of the entry manifest binding the client-facing channel. */
  entry: z.string().min(1),
  /**
   * Middle routing layer (spec #208): channel/tenant label → model manifest
   * name OR alias. Priority is request override > channel entry > this
   * preset's `model` slot. Absent = every channel uses the slot. Labels are
   * the mounted entry names (cli / rest) and, for deployments that hand one
   * preset to several tenants, tenant labels.
   */
  channelModels: z.record(z.string().min(1), z.string().min(1)).optional(),
  /**
   * Channel → entry-adapter routing table (spec #212). A channel is an
   * inbound surface ("cli", "web"); the value names the code-registered
   * EntryAdapter that serves it, i.e. one channel belongs to exactly one
   * kernel (anti-pattern ③). Absent = the preset's `entry` serves every
   * channel. Adding a second route is a config edit, not a code path.
   */
  channels: z.record(z.string().min(1), z.string().min(1)).optional(),
  /**
   * Hard spend threshold (spec #163): once cumulative usage.log cost for this
   * deployment reaches this many USD, a new turn asks a human before running.
   * Absent = no budget gate. Data, not a service — git is the audit trail.
   */
  budgetUsd: z.number().positive().optional(),
  /**
   * Single-machine resource governance (spec #164): maximum concurrently
   * running turns; further turns queue (FIFO) instead of failing.
   */
  maxConcurrentSessions: z.number().int().min(1).max(64).optional(),
  /**
   * Cross-endpoint fallback (spec #26): model manifest names tried IN ORDER
   * when every alias of the primary manifest is unhealthy. Alias-level
   * fallback stays inside a manifest (fallbackChain); this field is the
   * explicit, declared escape across endpoints — never an implicit one.
   */
  fallbackModels: z.array(z.string().min(1)).optional(),
});

export type Preset = z.infer<typeof presetSchema>;
