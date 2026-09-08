/**
 * One manifest file in, typed object or humanized errors out.
 * Division of labor (declared in contracts/preset.ts): shape checking is delegated
 * entirely to the contract schemas; this module owns ROUTING (kind → schema,
 * version gate), FILE READING, and the error-semantics split below.
 * Load is pure — no registry, no mounting, no printing (cli's job, P1b-2).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  knowledgeManifestSchema,
  modelProviderManifestSchema,
  presetSchema,
  toolProviderManifestSchema,
  type KnowledgeManifest,
  type ModelProviderManifest,
  type Preset,
  type ToolProviderManifest,
} from "@agentos/contracts";
import { formatIssues, type ManifestError } from "./errors.js";

/** Any validated manifest, discriminated by its envelope kind. */
export type AnyManifest = ToolProviderManifest | ModelProviderManifest | KnowledgeManifest | Preset;

export interface LoadedManifest {
  source: string;
  manifest: AnyManifest;
}

export interface LoadFailure {
  source: string;
  errors: ManifestError[];
}

export type LoadResult = ({ ok: true } & LoadedManifest) | ({ ok: false } & LoadFailure);

const ROUTES = {
  tool: toolProviderManifestSchema,
  model: modelProviderManifestSchema,
  knowledge: knowledgeManifestSchema,
  preset: presetSchema,
} as const;

const KNOWN_KINDS = Object.keys(ROUTES).sort();

/**
 * Load a single manifest file.
 * Error semantics (mirrored from the contracts layer):
 * - DATA problems — non-mapping document, unknown kind, version gate, schema
 *   violations — return {ok:false, errors}; every error has a non-empty path.
 *   Never thrown.
 * - ENVIRONMENT problems — missing/unreadable file, YAML syntax crash — throw.
 *   A broken toolchain is not a data validation result.
 */
export function loadManifest(filePath: string): LoadResult {
  const raw = readFileSync(filePath, "utf8"); // missing/unreadable → throws, by contract
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${filePath}: YAML syntax error: ${detail}`, { cause: err });
  }
  const fail = (errors: ManifestError[]): LoadResult => ({ ok: false, source: filePath, errors });

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return fail([
      { path: "$document", message: "a manifest must be a YAML mapping with kind and version", hint: `kind ∈ ${KNOWN_KINDS.join(" | ")}` },
    ]);
  }
  const { kind, version } = doc as { kind?: unknown; version?: unknown };
  if (typeof kind !== "string" || kind.length === 0) {
    return fail([{ path: "kind", message: "required string naming the manifest type", hint: `kind ∈ ${KNOWN_KINDS.join(" | ")}` }]);
  }
  if (version !== "1") {
    return fail([
      { path: "version", message: `only manifest schema version "1" exists, got ${JSON.stringify(version ?? null)}` },
    ]);
  }
  const route = (ROUTES as Record<string, (typeof ROUTES)[keyof typeof ROUTES] | undefined>)[kind];
  if (!route) {
    return fail([
      { path: "kind", message: `unknown kind ${JSON.stringify(kind)} — allowed: ${KNOWN_KINDS.join(", ")}` },
    ]);
  }
  const result = route.safeParse(doc);
  if (!result.success) {
    return fail(formatIssues(result.error.issues));
  }
  return { ok: true, source: filePath, manifest: result.data as AnyManifest };
}

export interface LoadDirResult {
  loaded: LoadedManifest[];
  failed: LoadFailure[];
}

/**
 * Load every *.yml / *.yaml in a directory (sorted; deterministic).
 * Individual data failures are collected; directory IO failures throw.
 */
export function loadManifestDir(dirPath: string): LoadDirResult {
  const names = readdirSync(dirPath)
    .filter((n) => /\.(ya?ml)$/i.test(n))
    .sort();
  const loaded: LoadedManifest[] = [];
  const failed: LoadFailure[] = [];
  for (const name of names) {
    const r = loadManifest(join(dirPath, name));
    if (r.ok) loaded.push({ source: r.source, manifest: r.manifest });
    else failed.push({ source: r.source, errors: r.errors });
  }
  return { loaded, failed };
}
