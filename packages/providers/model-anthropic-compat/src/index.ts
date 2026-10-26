/**
 * The generic Anthropic-compatible dialect: any url+key endpoint — Anthropic
 * official or a public compatibility endpoint (DeepSeek, Kimi, GLM, … per
 * their published docs). The dialect is the URL, never a code branch: this
 * package has no vendor names in logic on purpose.
 * Zero external dependencies: the probe uses the global fetch (injectable for
 * offline conformance), AbortSignal.timeout for the 5s bound.
 */
import type { ModelChannel, ModelDialect, ModelHealthOptions, ModelLeaseSpec, ModelProbeResult } from "@agentos/contracts";
import { resolveModelAlias } from "@agentos/core";

/** Lease values enter from an injected env record only (memory; never logged). */
export function resolveChannel(lease: ModelLeaseSpec, env: NodeJS.ProcessEnv = process.env): ModelChannel {
  return {
    baseUrl: lease.baseUrlEnv ? env[lease.baseUrlEnv] : undefined,
    authToken: lease.credentialsEnv ? env[lease.credentialsEnv] : undefined,
  };
}

/** Local alias for the contract's probe options. */
export type HealthOptions = ModelHealthOptions;

/** Probed when no url is leased; a public, documented default endpoint. */
export const DEFAULT_BASE_URL = "https://api.anthropic.com";

/**
 * Transport-liveness probe: GET {base}/v1/models with a 5s budget.
 * ANY HTTP answer — including 401/404 — counts ok:true: it proves an
 * endpoint answers at the other end. This is deliberately NOT an auth check
 * (auth failures arrive as kernel turn errors, not routing gates).
 * Network error / timeout => ok:false with a human reason.
 */
export async function healthCheck(lease: ModelLeaseSpec, opts: HealthOptions = {}): Promise<ModelProbeResult> {
  const channel = resolveChannel(lease, opts.env ?? process.env);
  const base = (channel.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
  if (channel.authToken !== undefined) headers.Authorization = `Bearer ${channel.authToken}`;
  const started = Date.now();
  try {
    const fetchFn = opts.fetchFn ?? ((u: string, i?: RequestInit) => fetch(u, i));
    await fetchFn(`${base}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, reason: err instanceof Error ? err.message : String(err) };
  }
}

export const dialect: ModelDialect = {
  tag: "anthropic-compat",
  resolveChannel,
  healthCheck,
  resolveModel: (models: Readonly<Record<string, string>>, alias: string): string => resolveModelAlias(models, alias),
};
