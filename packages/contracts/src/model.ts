/**
 * A model lease is an alias map, not a model list: business code references
 * aliases; repointing an alias at another real model id is a lease swap done in
 * config, not in code. Manifest (declarative) and runtime (per-request
 * behavior) are split because the loader only ever reads the manifest, while
 * routing happens per request inside adapters.
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

export const modelProviderManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("model"),
  /** Preset reference key (config/ name). */
  name: z.string().min(1),
  /** Vendor tag the adapter routes on (e.g. "aws-bedrock", "deepseek"). Free-form string by design. */
  provider: z.string().min(1),
  /** Env var name carrying a base-URL override; absent = vendor default endpoint. Never the URL itself. */
  baseUrlEnv: z.string().min(1).optional(),
  /** Env var name carrying credentials; never the credential itself. */
  credentialsEnv: z.string().min(1).optional(),
  /**
   * alias → real model id. The alias is the lease: it may point at any real
   * model behind any endpoint without callers noticing. At least one alias.
   */
  models: z
    .record(z.string().min(1), z.string().min(1))
    .refine((m) => Object.keys(m).length > 0, { message: "models must declare at least one alias" }),
  /** Ordered fallback, entries are aliases of `models`. On upstream failure, tried in order. */
  fallbackChain: z.array(z.string().min(1)).optional(),
  /** Usage-attribution labels attached to every request (cost center, team…). Opaque to the contract. */
  usageAttr: z.record(z.string(), z.string()).optional(),
});

/** Per-request runtime surface that core uses through the adapter seam. */
export interface ModelProviderRuntime {
  /**
   * Cheap liveness probe. latencyMs = probe round trip in ms; absent = not measured.
   * Report unhealthy as ok:false — throwing is reserved for transport failure, not bad health.
   */
  healthCheck(): Promise<{ ok: boolean; latencyMs?: number }>;
  /** alias → real model id. Unknown alias throws: that is misconfiguration, not a runtime state. */
  resolveModel(alias: string): string;
}

export type ModelProviderManifest = z.infer<typeof modelProviderManifestSchema>;
