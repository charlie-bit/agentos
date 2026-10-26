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
  /** Runtime dialect this endpoint speaks (e.g. "anthropic-compat", "openai-compat"); absent = provider heuristic. */
  dialect: z.string().min(1).optional(),
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

/**
 * Per-request runtime surface — the ONE provider-runtime type in the repo
 * (spec #202). It mirrors what a dialect actually needs to do: resolve the
 * lease into a channel, probe liveness, and map alias → model id. The two
 * shipped dialects (model-anthropic-compat, model-bedrock) declare
 * `dialect: ModelDialect`, and a new vendor runtime implements exactly this.
 */
export interface ModelLeaseSpec {
  /** Vendor tag from the manifest (free-form; selection rules live in core). */
  readonly provider: string;
  /** Explicit runtime dialect from the manifest; absent = provider heuristic. */
  readonly dialect?: string;
  /** Env var NAME carrying the base URL; never the URL itself. */
  readonly baseUrlEnv?: string;
  /** Env var NAME carrying the credential; never the value. */
  readonly credentialsEnv?: string;
}

/** Neutral channel values: memory-only, never logged, never persisted, never on the wire. */
export interface ModelChannel {
  /** Endpoint URL, when leased via env. */
  readonly baseUrl?: string;
  /** Credential value for that URL, read from env at this boundary only. */
  readonly authToken?: string;
  /** Vendor-native credential-chain marker (e.g. "bedrock"): no url/key here. */
  readonly nativeChain?: string;
}

export interface ModelProbeResult {
  readonly ok: boolean;
  readonly latencyMs?: number;
  /** Human line when ok:false (why the endpoint looked dead). */
  readonly reason?: string;
}

export interface ModelHealthOptions {
  /** Env source; injectable so tests never read real credentials. */
  readonly env?: NodeJS.ProcessEnv;
  /** Probe budget; dialect default when absent. */
  readonly timeoutMs?: number;
  /** Injectable transport for offline conformance. */
  readonly fetchFn?: (url: string, init?: RequestInit) => Promise<{ status: number }>;
}

export interface ModelDialect {
  /** Stable dialect identity (e.g. "anthropic-compat", "bedrock"). */
  readonly tag: string;
  /** Resolve env leases into a neutral channel. */
  resolveChannel(lease: ModelLeaseSpec, env?: NodeJS.ProcessEnv): ModelChannel;
  /**
   * Cheap liveness probe. Report unhealthy as ok:false — throwing is reserved
   * for transport failure, not bad health.
   */
  healthCheck(lease: ModelLeaseSpec, opts?: ModelHealthOptions): Promise<ModelProbeResult>;
  /** alias → real model id. Unknown alias throws: misconfiguration, not a runtime state. */
  resolveModel(models: Readonly<Record<string, string>>, alias: string): string;
}

export type ModelProviderManifest = z.infer<typeof modelProviderManifestSchema>;
