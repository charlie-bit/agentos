/**
 * Load semantics: typed object or humanized structured errors, never silent.
 * Invariants asserted across ALL sad cases: ok=false, and every error carries a
 * non-empty path AND a non-empty message — the P1b cli renders these lines
 * verbatim. Environment failures (syntax, missing file) throw instead.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadManifest, loadManifestDir, type LoadResult } from "../index.js";

const fx = (p: string) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));

/** Assert structured-failure invariants and return the errors for content checks. */
function expectStructured(r: LoadResult, sourceLabel: string) {
  if (r.ok) throw new Error(`${sourceLabel}: expected rejection, got ${JSON.stringify(r.manifest)}`);
  expect(r.ok).toBe(false);
  for (const e of r.errors) {
    expect(e.path.length, `${sourceLabel} error path must be non-empty`).toBeGreaterThan(0);
    expect(e.message.length, `${sourceLabel} error message must be non-empty`).toBeGreaterThan(0);
  }
  return r.errors;
}

describe("loadManifest — valid manifests", () => {
  const cases = [
    ["valid/filesystem.yml", "tool"],
    ["valid/gateway.yml", "tool"],
    ["valid/builtin.yml", "tool"],
    ["valid/vendor-a.yml", "model"],
    ["valid/handbook.yml", "knowledge"],
    ["valid/submodule-kb.yml", "knowledge"],
    ["valid/synced-kb.yml", "knowledge"],
    ["valid/handbook-assistant.yml", "preset"],
  ] as const;

  for (const [file, kind] of cases) {
    it(`loads ${file} as a ${kind} manifest`, () => {
      const r = loadManifest(fx(file));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.manifest.kind).toBe(kind);
    });
  }

  it("typed access survives the round trip (discriminated union on kind)", () => {
    const r = loadManifest(fx("valid/vendor-a.yml"));
    if (!r.ok) throw new Error("fixture must load");
    if (r.manifest.kind === "model") expect(r.manifest.models.general).toBe("vendor-a/small");
    else expect.unreachable("kind should be model");
  });
});

describe("loadManifestDir", () => {
  it("loads the whole valid directory, zero failures", () => {
    const { loaded, failed } = loadManifestDir(fx("valid"));
    expect(failed).toHaveLength(0);
    expect(loaded).toHaveLength(8);
    expect(new Set(loaded.map((l) => l.manifest.kind))).toEqual(new Set(["tool", "model", "knowledge", "preset"]));
  });
});

describe("loadManifest — structured data failures (return, never throw)", () => {
  it("rejects unknown kind, naming the allowed values", () => {
    const errors = expectStructured(loadManifest(fx("bad/unknown-kind.yml")), "unknown-kind");
    expect(errors.some((e) => e.path === "kind" && e.message.includes("agent"))).toBe(true);
  });

  it("rejects version other than 1 before routing", () => {
    const errors = expectStructured(loadManifest(fx("bad/bad-version.yml")), "bad-version");
    expect(errors.some((e) => e.path === "version" && e.message.includes('"1"'))).toBe(true);
  });

  it("rejects a non-mapping document with a $document path", () => {
    const errors = expectStructured(loadManifest(fx("bad/scalar-doc.yml")), "scalar-doc");
    expect(errors[0]?.path).toBe("$document");
  });

  it("propagates contracts-layer field errors (missing name → path name)", () => {
    const errors = expectStructured(loadManifest(fx("bad/missing-name.yml")), "missing-name");
    expect(errors.some((e) => e.path === "name")).toBe(true);
  });

  it("literal secret rejected by contracts, humanized here: auth.token + env-var-name hint", () => {
    const errors = expectStructured(loadManifest(fx("bad/secret.yml")), "secret");
    const secret = errors.find((e) => e.path === "auth.token");
    expect(secret, "expected an error pinned to auth.token").toBeDefined();
    expect(secret?.message).toContain("not part of this manifest shape");
    expect(secret?.hint).toContain("ENV VAR NAME");
  });
});

describe("loadManifest — environment failures (throw, never swallow)", () => {
  it("throws on YAML syntax errors", () => {
    expect(() => loadManifest(fx("bad/bad-syntax.yml"))).toThrow(/YAML syntax error/);
  });

  it("throws when the file does not exist", () => {
    expect(() => loadManifest(fx("valid/no-such-file.yml"))).toThrow(/ENOENT|no such file/i);
  });
});
