/**
 * Reference-integrity layer: individually valid manifests must still assemble.
 * All cases load real fixtures (no hand-built objects) so the check runs on
 * exactly the shapes the contracts emit.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadManifest, loadManifestDir, validatePresetRefs, type LoadedManifest } from "../index.js";

const fx = (p: string) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));

const validSet = (): LoadedManifest[] => loadManifestDir(fx("valid")).loaded;

function loadOne(file: string): LoadedManifest {
  const r = loadManifest(fx(file));
  if (!r.ok) throw new Error(`${file} must be a VALID manifest to test the validation layer: ${JSON.stringify(r.errors)}`);
  return { source: r.source, manifest: r.manifest };
}

describe("validatePresetRefs — the happy chain", () => {
  it("accepts the full valid set with its entry adapter registered", () => {
    expect(validatePresetRefs(validSet(), { entryNames: ["mock-chat"] })).toEqual([]);
  });

  it("swap semantics: repointing the preset's model slot at another declared manifest passes with zero code changes", () => {
    const loaded = [...validSet(), loadOne("alt/vendor-b.yml")];
    const idx = loaded.findIndex((l) => l.manifest.kind === "preset");
    const preset = loaded[idx]!;
    // Minimal mutation of a LOADED manifest — the swap itself, not a hand-built object.
    const swapped: LoadedManifest = {
      source: preset.source,
      manifest: { ...preset.manifest, model: "vendor-b" } as LoadedManifest["manifest"],
    };
    const errors = validatePresetRefs(
      [...loaded.slice(0, idx), swapped, ...loaded.slice(idx + 1)],
      { entryNames: ["mock-chat"] },
    );
    expect(errors).toEqual([]);
  });

  it("reports the entry slot when no adapters are registered yet", () => {
    const errors = validatePresetRefs(validSet());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("entry");
    expect(errors[0]?.hint).toContain("code registration");
  });
});

describe("validatePresetRefs — cross-manifest failures", () => {
  it("catches a preset referencing a manifest name that was never declared", () => {
    const errors = validatePresetRefs([...validSet(), loadOne("bad/preset-dangling.yml")], { entryNames: ["mock-chat"] });
    const dangling = errors.find((e) => e.message.includes("ghost-handbook"));
    expect(dangling, "expected dangling-reference error").toBeDefined();
    expect(dangling?.path).toBe("knowledge");
  });

  it("catches a slot referencing a name of the wrong kind", () => {
    const errors = validatePresetRefs([...validSet(), loadOne("bad/preset-wrong-kind.yml")], { entryNames: ["mock-chat"] });
    const wrong = errors.find((e) => e.path === "model");
    expect(wrong, "expected kind-mismatch error on the model slot").toBeDefined();
    expect(wrong?.message).toContain('as a model');
    expect(wrong?.message).toContain('"tool"');
  });

  it("catches duplicate tool references, pointing at the later index", () => {
    const errors = validatePresetRefs([...validSet(), loadOne("bad/preset-dup-tools.yml")], { entryNames: ["mock-chat"] });
    expect(errors.some((e) => e.path === "tools.1" && e.message.includes("filesystem"))).toBe(true);
  });

  it("catches a fallbackChain alias outside its own lease map", () => {
    const errors = validatePresetRefs([...validSet(), loadOne("bad/model-bad-fallback.yml")], { entryNames: ["mock-chat"] });
    const bad = errors.find((e) => e.path.startsWith("fallbackChain"));
    expect(bad, "expected fallbackChain error").toBeDefined();
    expect(bad?.path).toBe("fallbackChain.1");
    expect(bad?.message).toContain("turbo");
  });

  it("catches two manifests sharing one name", () => {
    const dup = [loadOne("bad/dup-a.yml"), loadOne("bad/dup-b.yml")];
    const errors = validatePresetRefs([...validSet(), ...dup], { entryNames: ["mock-chat"] });
    const dupe = errors.find((e) => e.path === "name" && e.message.includes("twin"));
    expect(dupe, "expected duplicate-name error").toBeDefined();
    expect(dupe?.source).toContain("dup-b.yml");
  });

  it("every validation error keeps the path/message non-empty invariant", () => {
    const all = [
      ...validSet(),
      ...["bad/preset-dangling.yml", "bad/preset-wrong-kind.yml", "bad/preset-dup-tools.yml", "bad/model-bad-fallback.yml", "bad/dup-a.yml", "bad/dup-b.yml"].map(loadOne),
    ];
    for (const e of validatePresetRefs(all, { entryNames: ["mock-chat"] })) {
      expect(e.path.length).toBeGreaterThan(0);
      expect(e.message.length).toBeGreaterThan(0);
      expect(e.source.length).toBeGreaterThan(0);
    }
  });
});
