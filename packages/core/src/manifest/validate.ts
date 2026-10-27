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
import type { ErrorCategory, ManifestError } from "./errors.js";

/** A manifest-layer finding: ManifestError plus the file it came from. */
export interface ValidationError extends ManifestError {
  source: string;
}

/** Validate-phase findings are reference defects by definition (spec #204). */
const REF: ErrorCategory = "reference";

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
        category: REF,
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
  const agentByName = new Map<string, { baseAgent?: string; source: string }>();
  for (const { source, manifest } of loaded) {
    if (manifest.kind === "agent") agentByName.set(manifest.name, { ...(manifest.baseAgent ? { baseAgent: manifest.baseAgent } : {}), source });
  }
  for (const { source, manifest } of loaded) {
    if (manifest.kind !== "agent") continue;
    if (manifest.baseAgent !== undefined) {
      if (!agentByName.has(manifest.baseAgent)) {
        errors.push({ source, category: REF, path: "baseAgent", message: `references agent ${JSON.stringify(manifest.baseAgent)}, which no config/agents manifest declares`, hint: "external agents are MCP tools (#418); baseAgent only names a local role" });
      } else {
        // cycle detection: walk the base chain from this agent
        const seen = new Set<string>([manifest.name]);
        let cursor: string | undefined = manifest.baseAgent;
        while (cursor !== undefined) {
          if (seen.has(cursor)) {
            errors.push({ source, category: REF, path: "baseAgent", message: `baseAgent chain forms a cycle (${[...seen, cursor].join(" → ")})` });
            break;
          }
          seen.add(cursor);
          cursor = agentByName.get(cursor)?.baseAgent;
        }
      }
    }
    const check = (slot: "knowledge" | "model") => {
      const ref = manifest[slot];
      if (ref === undefined) return;
      const kind = slot;
      const found = byName.get(ref);
      if (!found) errors.push({ source, category: REF, path: slot, message: `references ${JSON.stringify(ref)}, which no manifest declares` });
      else if (found.kind !== kind) errors.push({ source, category: REF, path: slot, message: `references ${JSON.stringify(ref)} as a ${kind}, but it is a ${JSON.stringify(found.kind)} manifest` });
    };
    check("knowledge");
    check("model");
    // agent.tools are BARE TOOL NAMES inside mounted providers (#336, e.g.
    // kb_search / todo_add) — runtime fence entries, not manifest references,
    // so they are not statically resolvable here. knowledge/model/baseAgent
    // remain manifest references and are checked above.
  }

  for (const { source, manifest } of loaded) {
    if (manifest.kind !== "workflow") continue;
    manifest.steps.forEach((step, i) => {
      if (step.type === "agent" && !byName.has(step.agent)) {
        errors.push({ source, category: REF, path: `steps.${i}.agent`, message: `references agent ${JSON.stringify(step.agent)}, which no config/agents manifest declares`, hint: "external agents are MCP tools; workflow agent steps name local roles" });
      }
    });
  }

  for (const { source, manifest } of loaded) {
    if (manifest.kind !== "project") continue;
    const checks: Array<["agents" | "workflows" | "tools" | "knowledge", string]> = [
      ["agents", "agent"],
      ["workflows", "workflow"],
      ["tools", "tool"],
      ["knowledge", "knowledge"],
    ];
    for (const [slot, kind] of checks) {
      (manifest[slot] ?? []).forEach((ref, i) => {
        const found = byName.get(ref);
        if (!found) errors.push({ source, category: REF, path: `${slot}.${i}`, message: `references ${JSON.stringify(ref)}, which no manifest declares` });
        else if (found.kind !== kind) errors.push({ source, category: REF, path: `${slot}.${i}`, message: `references ${JSON.stringify(ref)} as a ${kind}, but it is a ${JSON.stringify(found.kind)} manifest` });
      });
    }
  }

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

    (manifest.workflows ?? []).forEach((ref, i) => {
      const found = byName.get(ref);
      if (!found) errors.push({ source, category: REF, path: `workflows.${i}`, message: `references workflow ${JSON.stringify(ref)}, which no config/workflows manifest declares` });
      else if (found.kind !== "workflow") errors.push({ source, category: REF, path: `workflows.${i}`, message: `references ${JSON.stringify(ref)} as a workflow, but it is a ${JSON.stringify(found.kind)} manifest` });
    });

    (manifest.agents ?? []).forEach((ref, i) => {
      const found = byName.get(ref);
      if (!found) errors.push({ source, category: REF, path: `agents.${i}`, message: `references agent ${JSON.stringify(ref)}, which no config/agents manifest declares` });
      else if (found.kind !== "agent") errors.push({ source, category: REF, path: `agents.${i}`, message: `references ${JSON.stringify(ref)} as an agent, but it is a ${JSON.stringify(found.kind)} manifest` });
    });

    (manifest.fallbackModels ?? []).forEach((ref, i) => {
      const found = byName.get(ref);
      if (!found) {
        errors.push({
          source,
          category: REF,
          path: `fallbackModels.${i}`,
          message: `references model manifest ${JSON.stringify(ref)}, which no manifest declares`,
        });
      } else if (found.kind !== "model") {
        errors.push({
          source,
          category: REF,
          path: `fallbackModels.${i}`,
          message: `references ${JSON.stringify(ref)} as a model, but that name is a ${JSON.stringify(found.kind)} manifest`,
        });
      }
    });

    for (const [channel, target] of Object.entries(manifest.channels ?? {})) {
      if (!entryNames.has(target)) {
        errors.push({
          source,
          category: REF,
          path: `channels.${channel}`,
          message: `routes channel ${JSON.stringify(channel)} to entry adapter ${JSON.stringify(target)}, which is not registered`,
          hint: "channel targets are code-registered entry names (see ENTRY_ADAPTER_NAMES)",
        });
      }
    }

    if (!entryNames.has(manifest.entry)) {
      errors.push({
        source,
        category: REF,
        path: "entry",
        message: `references ${JSON.stringify(manifest.entry)}, which is not a registered entry adapter`,
        hint: "entry adapters come from code registration (validate entryNames option), not from config manifests",
      });
    }
  }

  return errors;
}
