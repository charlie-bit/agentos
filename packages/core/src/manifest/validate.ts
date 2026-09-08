/**
 * Layer two above parsing: a set of individually-valid manifests can still be
 * unassemblable — dangling preset references, kind mismatches, duplicate names,
 * fallback aliases outside their own lease map. This is the "presolvability"
 * half of the contracts/preset.ts division (reference integrity is core's job).
 * Pure function over already-loaded data; all findings are structured errors
 * carrying the source file, never thrown.
 *
 * Entry-slot note: the contract envelope has NO "entry" manifest kind — entry
 * adapters are code-registered (see packages/contracts/src/entry.ts). Entry
 * references are therefore checked against a caller-supplied list of registered
 * adapter names (cli/P1b-2 will feed it from its registry), not against manifests.
 */
import type { LoadedManifest } from "./load.js";
import type { ManifestError } from "./errors.js";

/** A manifest-layer finding: ManifestError plus the file it came from. */
export interface ValidationError extends ManifestError {
  source: string;
}

export interface ValidateOptions {
  /** Registered entry-adapter names from code. Absent = none registered. */
  entryNames?: readonly string[];
}

export function validatePresetRefs(
  loaded: readonly LoadedManifest[],
  opts: ValidateOptions = {},
): ValidationError[] {
  const errors: ValidationError[] = [];
  const byName = new Map<string, { kind: string; source: string }>();

  // 1. Names must be unique: preset slots resolve by name.
  for (const { source, manifest } of loaded) {
    const first = byName.get(manifest.name);
    if (first) {
      errors.push({
        source,
        path: "name",
        message: `duplicate manifest name ${JSON.stringify(manifest.name)} — already declared in ${first.source}`,
        hint: "every manifest name must be unique; slots resolve by name",
      });
    } else {
      byName.set(manifest.name, { kind: manifest.kind, source });
    }
  }

  // 2. Model fallback chains must stay inside their own alias lease map.
  for (const { source, manifest } of loaded) {
    if (manifest.kind !== "model") continue;
    const aliases = new Set(Object.keys(manifest.models));
    (manifest.fallbackChain ?? []).forEach((alias, i) => {
      if (!aliases.has(alias)) {
        errors.push({
          source,
          path: `fallbackChain.${i}`,
          message: `${JSON.stringify(alias)} is not an alias of this manifest's models`,
          hint: `fallback entries must be keys of models (have: ${[...aliases].join(", ")})`,
        });
      }
    });
  }

  // 3. Preset four slots must resolve to declared, kind-matching manifests.
  const entryNames = new Set(opts.entryNames ?? []);
  for (const { source, manifest } of loaded) {
    if (manifest.kind !== "preset") continue;
    const checkManifestRef = (slot: "knowledge" | "model", ref: string) => {
      const found = byName.get(ref);
      if (!found) {
        errors.push({
          source,
          path: slot,
          message: `references ${JSON.stringify(ref)}, which no manifest declares`,
          hint: `declare a ${slot} manifest with that name, or fix the reference`,
        });
      } else if (found.kind !== slot) {
        errors.push({
          source,
          path: slot,
          message: `references ${JSON.stringify(ref)} as a ${slot}, but that name is a ${JSON.stringify(found.kind)} manifest`,
        });
      }
    };
    checkManifestRef("knowledge", manifest.knowledge);
    checkManifestRef("model", manifest.model);

    const seen = new Set<string>();
    manifest.tools.forEach((ref, i) => {
      const path = `tools.${i}`;
      if (seen.has(ref)) {
        errors.push({
          source,
          path,
          message: `${JSON.stringify(ref)} is referenced more than once`,
          hint: "mount each tool manifest once; duplicates make registry drift undetectable",
        });
      }
      seen.add(ref);
      const found = byName.get(ref);
      if (!found) {
        errors.push({ source, path, message: `references ${JSON.stringify(ref)}, which no manifest declares`, hint: "declare the tool manifest or fix the name" });
      } else if (found.kind !== "tool") {
        errors.push({
          source,
          path,
          message: `references ${JSON.stringify(ref)} as a tool, but that name is a ${JSON.stringify(found.kind)} manifest`,
        });
      }
    });

    if (!entryNames.has(manifest.entry)) {
      errors.push({
        source,
        path: "entry",
        message: `references ${JSON.stringify(manifest.entry)}, which is not a registered entry adapter`,
        hint: "entry adapters come from code registration (validate entryNames option), not from config manifests",
      });
    }
  }

  return errors;
}
