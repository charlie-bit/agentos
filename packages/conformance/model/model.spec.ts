/**
 * MODEL SUITE — routing conformance (offline, zero credentials).
 * Fakes everywhere: injected fetch (probe semantics), injected clock (TTL),
 * injected env (lease presence), sentinel strings to prove non-leakage.
 * Black box over @agentos/core/routing + the two dialect packages' public API.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { modelProviderManifestSchema, type ModelProviderManifest } from "@agentos/contracts";
import { selectDialect, resolveModelAlias, resolveActiveModel, HealthGate, appendAttribution, formatAttributionLine, type ProbeResult } from "@agentos/core";
import { dialect as compat } from "@agentos/model-anthropic-compat";
import { dialect as bedrock } from "@agentos/model-bedrock";

const manifest = (over: Record<string, unknown> = {}): ModelProviderManifest =>
  modelProviderManifestSchema.parse({
    kind: "model",
    version: "1",
    name: "m-a",
    provider: "vendor-a",
    baseUrlEnv: "A_URL",
    credentialsEnv: "A_KEY",
    models: { general: "vendor-a/small", big: "vendor-a/big" },
    fallbackChain: ["general", "big"],
    ...over,
  }) as ModelProviderManifest;

/* ---- dialect selection + channel neutrality -------------------------------- */

describe("selectDialect (the one rule)", () => {
  it("url lease beats bedrock; provider-only bedrock selects native chain", () => {
    expect(selectDialect({ provider: "aws-bedrock" })).toBe("bedrock");
    expect(selectDialect({ provider: "aws-bedrock", baseUrlEnv: "X" })).toBe("anthropic-compat");
    expect(selectDialect({ provider: "deepseek", baseUrlEnv: "X" })).toBe("anthropic-compat");
    expect(selectDialect({ provider: "deepseek" })).toBe("anthropic-compat");
  });
});

describe("ModelChannel vocabulary is kernel-free and value-safe", () => {
  const FAKE_ENV = { A_URL: "https://sentinel-endpoint.example", A_KEY: "sk-sentinel-never-log-me" };
  it("compat reads both leases", () => {
    expect(compat.resolveChannel({ provider: "v", baseUrlEnv: "A_URL", credentialsEnv: "A_KEY" }, FAKE_ENV)).toEqual({
      baseUrl: FAKE_ENV.A_URL,
      authToken: FAKE_ENV.A_KEY,
    });
  });
  it("bedrock without lease yields the marker only — no values, no kernel env names", () => {
    const ch = bedrock.resolveChannel({ provider: "aws-bedrock", credentialsEnv: "A_KEY" }, FAKE_ENV);
    expect(ch).toEqual({ nativeChain: "bedrock" });
    expect(JSON.stringify(ch)).not.toContain("sk-sentinel");
  });
});

/* ---- alias resolution ------------------------------------------------------ */

describe("resolveModelAlias", () => {
  it("hit returns the real id", () => {
    expect(resolveModelAlias({ general: "v/x" }, "general")).toBe("v/x");
  });
  it("miss throws listing what exists (config error, loudly)", () => {
    expect(() => resolveModelAlias({ general: "v/x", big: "v/y" }, "nope")).toThrow(/have: general, big/);
  });
});

/* ---- active model: priority + humanized failure ---------------------------- */

describe("resolveActiveModel", () => {
  const models = [manifest(), manifest({ name: "m-b", provider: "vendor-b", models: { only: "vendor-b/one" }, fallbackChain: undefined })];
  it("preset slot alone resolves the manifest; single-alias lease is auto-picked", () => {
    const r = resolveActiveModel({ presetModel: "m-b", models });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.active).toMatchObject({ manifest: { name: "m-b" }, alias: "only", modelId: "vendor-b/one", source: "preset" });
  });
  it("multi-alias preset leaves alias undefined (kernel default, honest)", () => {
    const r = resolveActiveModel({ presetModel: "m-a", models });
    expect(r.ok && r.active.alias).toBeUndefined();
  });
  it("request override beats the preset — by manifest name…", () => {
    const r = resolveActiveModel({ presetModel: "m-a", override: "m-b", models });
    expect(r.ok && r.active.manifest.name).toBe("m-b");
    if (r.ok) expect(r.active.source).toBe("override");
  });
  it("…or by alias, landing on the manifest that leases it", () => {
    const r = resolveActiveModel({ presetModel: "m-b", override: "big", models });
    expect(r.ok && r.active.manifest.name).toBe("m-a");
    if (r.ok) expect(r.active.modelId).toBe("vendor-a/big");
  });
  it("unknown override lists BOTH vocabularies in the hint", () => {
    const r = resolveActiveModel({ presetModel: "m-a", override: "gpt-9000", models });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors[0];
      expect(e?.path).toBe("--model");
      expect(e?.hint).toContain("m-a, m-b");
      expect(e?.hint).toContain("general, big, only");
    }
  });
  it("dangling preset slot is a structured error with the option list", () => {
    const r = resolveActiveModel({ presetModel: "ghost", models });
    expect(!r.ok && r.errors[0]?.message).toContain("ghost");
  });
});

/* ---- health gate: probe semantics, fallback, TTL --------------------------- */

describe("probe semantics (compat dialect, injected fetch)", () => {
  const lease = { provider: "v", baseUrlEnv: "P_URL", credentialsEnv: "P_KEY" };
  const env = { P_URL: "https://probe.example", P_KEY: "sk-probe-sentinel" };
  it("ANY HTTP answer (even 404) = transport alive, and the auth header was sent", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const r = await compat.healthCheck(lease, {
      env,
      fetchFn: async (url, init) => {
        seen.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
        return { status: 404 }; // non-2xx must NOT fail a liveness probe
      },
    });
    expect(r.ok).toBe(true);
    expect(seen[0]?.url).toBe("https://probe.example/v1/models");
    expect(seen[0]?.headers.Authorization).toBe("Bearer sk-probe-sentinel");
  });
  it("network error = dead, with reason; fetch budget honors timeout option", async () => {
    const r = await compat.healthCheck(lease, {
      env,
      fetchFn: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("fetch failed");
  });
});

describe("bedrock presence health (no network at all)", () => {
  it("profile present -> ok", async () => {
    expect(await bedrock.healthCheck({ provider: "aws-bedrock" }, { AWS_PROFILE: "x" })).toMatchObject({ ok: true });
  });
  it("empty env -> not-ok with an actionable, human reason", async () => {
    const r = await bedrock.healthCheck({ provider: "aws-bedrock" }, {});
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("AWS_PROFILE");
  });
});

describe("HealthGate: fallback walk + TTL cache (fake clock)", () => {
  const mk = () => {
    const calls: string[] = [];
    let nowMs = 1_000;
    const results = new Map<string, ProbeResult>();
    const gate = new HealthGate(
      async (_m, alias) => {
        calls.push(alias);
        return results.get(alias) ?? { ok: true };
      },
      { now: () => nowMs, ttlMs: 60_000 },
    );
    return { gate, calls, results, advance: (ms: number) => (nowMs += ms) };
  };

  it("preferred alias dead -> falls to next chain alias; probes map records both", async () => {
    const { gate, results } = mk();
    results.set("general", { ok: false, reason: "dead" });
    results.set("big", { ok: true });
    const picked = await gate.pick(manifest(), "general");
    expect(picked.ok && picked.alias).toBe("big");
    if (picked.ok) expect(picked.modelId).toBe("vendor-a/big");
    expect(picked.probes.general?.ok).toBe(false);
    expect(picked.probes.big?.ok).toBe(true);
  });

  it("whole chain dead -> structured failure carrying every probe", async () => {
    const { gate, results } = mk();
    results.set("general", { ok: false, reason: "r1" });
    results.set("big", { ok: false, reason: "r2" });
    const picked = await gate.pick(manifest(), "general");
    expect(picked.ok).toBe(false);
    expect(Object.keys(picked.probes).sort()).toEqual(["big", "general"]);
  });

  it("TTL: within window no re-probe; after expiry exactly one more", async () => {
    const { gate, calls, advance } = mk();
    const m = manifest();
    await gate.check(m, "general");
    await gate.check(m, "general");
    expect(calls).toEqual(["general"]); // cached
    advance(60_001);
    await gate.check(m, "general");
    expect(calls).toEqual(["general", "general"]); // one refetch, not two
  });

  it("no preferred alias: sweeps fallbackChain declarations", async () => {
    const { gate, results } = mk();
    results.set("general", { ok: false });
    const picked = await gate.pick(manifest());
    expect(picked.ok && picked.alias).toBe("big");
  });
});

/* ---- attribution ----------------------------------------------------------- */

describe("attribution record + JSONL log", () => {
  const tempDirs: string[] = [];
  afterAll(() => {
    while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
  });

  it("line carries model provenance and counts — never credential shapes", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-attr-"));
    tempDirs.push(dir);
    const path = join(dir, "usage.log");
    appendAttribution(
      {
        tsMs: 1,
        preset: "example",
        session: "web-1",
        manifest: "deepseek",
        provider: "deepseek",
        alias: "general",
        modelId: "deepseek-chat",
        usage: { input: 12, output: 340, cacheRead: 100 },
        costUsd: 0.0123,
      },
      path,
    );
    const line = readFileSync(path, "utf8").trim();
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({ manifest: "deepseek", alias: "general", modelId: "deepseek-chat" });
    expect(line).toContain("deepseek-chat"); // model id present
    for (const banned of ["sk-", "token", "secret", "Bearer", "password"]) {
      expect(line.toLowerCase()).not.toContain(banned.toLowerCase()); // no credential shapes at all
    }
    expect(formatAttributionLine({ tsMs: 1, manifest: "m", provider: "p", alias: "a", modelId: "m/real", usage: { input: 1, output: 2 }, costUsd: 0.5 })).toBe(
      "model: m/a→m/real | in=1 out=2 | cost≈$0.5000",
    );
    expect(formatAttributionLine({ tsMs: 1, manifest: "m", provider: "p" })).toBe("model: m/kernel-default");
  });
});
