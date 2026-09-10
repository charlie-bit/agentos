/**
 * Health gate: probe once, trust for a TTL, fail over per ALIAS (the
 * fallbackChain is alias-level within one endpoint per current contracts —
 * cross-endpoint failover is a known contract observation, NOT implemented
 * here; routing must not legislate beyond the contracts).
 *
 * The probe is transport-liveness (an HTTP answer, even 401/404, proves the
 * endpoint exists) — never an auth assertion. Results are cached per
 * manifest+alias with an injectable clock so conformance can prove "no
 * repeat probe within TTL" without wall-waiting.
 */
import type { ModelProviderManifest } from "@agentos/contracts";

export interface ProbeResult {
  ok: boolean;
  latencyMs?: number;
  /** Human line when ok:false (why the endpoint looked dead). */
  reason?: string;
}

export type Probe = (manifest: ModelProviderManifest, alias: string) => Promise<ProbeResult>;

export interface GateOptions {
  ttlMs?: number;
  now?: () => number;
}

export type PickResult =
  | { ok: true; alias: string; modelId: string; probes: Record<string, ProbeResult> }
  | { ok: false; probes: Record<string, ProbeResult> };

const chainFor = (m: ModelProviderManifest, preferred?: string): string[] => {
  const out: string[] = [];
  const push = (a: string) => {
    if (m.models[a] !== undefined && !out.includes(a)) out.push(a);
  };
  if (preferred !== undefined) push(preferred);
  for (const a of m.fallbackChain ?? []) push(a);
  if (out.length === 0) out.push(...Object.keys(m.models)); // unknown preferred: full lease sweep
  return out;
};

export class HealthGate {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; result: ProbeResult }>();

  constructor(
    private readonly probe: Probe,
    opts: GateOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  async check(manifest: ModelProviderManifest, alias: string): Promise<ProbeResult> {
    const key = `${manifest.name}/${alias}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.result;
    const result = await this.probe(manifest, alias);
    this.cache.set(key, { at: this.now(), result });
    return result;
  }

  /** Walk preferred alias + fallback chain; first healthy wins; all-dead carries every probe. */
  async pick(manifest: ModelProviderManifest, preferred?: string): Promise<PickResult> {
    const probes: Record<string, ProbeResult> = {};
    for (const alias of chainFor(manifest, preferred)) {
      const r = await this.check(manifest, alias);
      probes[alias] = r;
      if (r.ok) return { ok: true, alias, modelId: manifest.models[alias] as string, probes };
    }
    return { ok: false, probes };
  }
}
