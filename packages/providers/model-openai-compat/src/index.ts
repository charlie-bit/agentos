/**
 * The OpenAI-compatible dialect: any endpoint that speaks the public
 * /v1/chat/completions + /v1/models contract — hosted vendors, self-hosted
 * gateways, local servers with a compatibility layer. Zero code branches on
 * vendor names: the dialect IS the leased URL.
 *
 * This is the first THIRD-PARTY dialect (spec #210): it lives entirely in
 * its own package, implements the contract's ModelDialect, and the core
 * kernel is untouched — onboarding a vendor family is a package plus a
 * `config/models/*.yml` file.
 *
 * Zero external dependencies; the probe uses global fetch (injectable for
 * offline conformance) with a bounded timeout.
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

/**
 * Transport-liveness probe: GET {base}/models. Any HTTP answer — 401
 * included — proves the endpoint exists; this is not an auth assertion.
 * With no leased base URL there is nothing to probe: that is a lease
 * misconfiguration, reported as unhealthy with a human reason.
 */
export async function healthCheck(lease: ModelLeaseSpec, opts: ModelHealthOptions = {}): Promise<ModelProbeResult> {
  const channel = resolveChannel(lease, opts.env ?? process.env);
  if (channel.baseUrl === undefined) {
    return { ok: false, reason: `no base URL leased (set ${lease.baseUrlEnv ?? "baseUrlEnv"} in the environment)` };
  }
  const base = channel.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (channel.authToken !== undefined) headers.Authorization = `Bearer ${channel.authToken}`;
  const started = Date.now();
  try {
    const fetchFn = opts.fetchFn ?? ((u: string, i?: RequestInit) => fetch(u, i));
    await fetchFn(`${base}/models`, { method: "GET", headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, reason: err instanceof Error ? err.message : String(err) };
  }
}

export const dialect: ModelDialect = {
  tag: "openai-compat",
  resolveChannel,
  healthCheck,
  resolveModel: (models: Readonly<Record<string, string>>, alias: string): string => resolveModelAlias(models, alias),
};
