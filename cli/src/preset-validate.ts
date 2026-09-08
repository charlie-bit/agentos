/**
 * `agentos preset validate` — thin orchestration over @agentos/core/manifest.
 * Zero judgment logic lives here: shape/data verdicts come from core return
 * values; this module only discovers files, calls core, and assembles lines.
 * The runners are pure (argv -> {exitCode, lines}); printing and process.exit
 * happen in main.mjs — the single sanctioned output point (repo-wide
 * no-console lint stays green because even here output is data).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  loadManifest,
  validatePresetRefs,
  type AnyManifest,
  type LoadedManifest,
} from "@agentos/core";

export interface CliResult {
  exitCode: number;
  lines: string[];
}

/**
 * Entry adapters are code-registered — no entry manifest kind exists in the
 * contract envelope. P2 replaces this placeholder list with the real runtime
 * registry; until then "console" is the only resolvable entry name.
 */
export const REGISTERED_ENTRY_NAMES: readonly string[] = ["console"];

/**
 * Config root convention (documented in README of cli, kept here as truth):
 * - directory target  -> the directory itself;
 * - file target       -> the nearest ancestor (max 5 levels) that contains a
 *   "presets" sub-directory; fallback: the file's own directory.
 * This makes `agentos preset validate config/presets/example.yml` resolve
 * references against the whole config/ tree without a --root flag, while
 * never escaping upward from a flat temp directory in tests.
 */
/**
 * Locate a CLI target, monorepo-style: try cwd, then walk up ancestors
 * (max 5). Needed because runners may start inside a workspace package
 * (e.g. `pnpm --filter agentos-cli exec …` sets cwd to cli/).
 */
export function locateTarget(targetPath: string): string | null {
  if (isAbsolute(targetPath)) return existsSync(targetPath) ? targetPath : null;
  let dir = process.cwd();
  for (let depth = 0; depth < 5 && dir !== dirname(dir); depth += 1) {
    const candidate = resolve(dir, targetPath);
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return null;
}

export function manifestRootFor(abs: string): string {
  if (statSync(abs).isDirectory()) return abs;
  let dir = dirname(abs);
  for (let depth = 0; depth < 5 && dir !== dirname(dir); depth += 1) {
    const presets = join(dir, "presets");
    if (existsSync(presets) && statSync(presets).isDirectory()) return dir;
    dir = dirname(dir);
  }
  return dirname(abs);
}

function collectYml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectYml(p));
    else if (/\.ya?ml$/i.test(entry.name)) out.push(p);
  }
  return out.sort();
}

function summarizePreset(p: Extract<AnyManifest, { kind: "preset" }>): string[] {
  return [
    `✓ preset "${p.name}" resolves:`,
    `    knowledge = ${p.knowledge}`,
    `    model     = ${p.model}`,
    `    tools     = [${p.tools.join(", ")}]`,
    `    entry     = ${p.entry}`,
  ];
}

export function runPresetValidate(targetPath: string): CliResult {
  const target = locateTarget(targetPath);
  if (!target) {
    return { exitCode: 1, lines: [`✗ target not found: ${targetPath} (searched cwd and 5 ancestors)`] };
  }
  const root = manifestRootFor(target);
  const files = collectYml(root);
  if (files.length === 0) {
    return { exitCode: 1, lines: [`✗ no *.yml/*.yaml manifest files found under ${root}`] };
  }

  const loaded: LoadedManifest[] = [];
  const failures: string[] = [];
  for (const file of files) {
    const r = loadManifest(file);
    if (r.ok) loaded.push({ source: r.source, manifest: r.manifest });
    else
      for (const e of r.errors) {
        failures.push(
          `✗ ${relative(root, file).split(sep).join("/")}: ${e.path}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`,
        );
      }
  }
  if (failures.length > 0) return { exitCode: 1, lines: failures };

  const refErrors = validatePresetRefs(loaded, { entryNames: REGISTERED_ENTRY_NAMES });
  if (refErrors.length > 0) {
    return {
      exitCode: 1,
      lines: refErrors.map(
        (e) =>
          `✗ ${relative(root, e.source).split(sep).join("/")}: ${e.path}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`,
      ),
    };
  }

  const byKind = new Map<string, string[]>();
  for (const { manifest } of loaded) {
    const names = byKind.get(manifest.kind) ?? [];
    names.push(manifest.name);
    byKind.set(manifest.kind, names);
  }
  const lines = [`✓ ${loaded.length} manifests validated against ${root}`];
  for (const [kind, names] of [...byKind.entries()].sort()) {
    lines.push(`  ${kind.padEnd(9)}: ${names.sort().join(", ")}`);
  }
  for (const { manifest } of loaded) {
    if (manifest.kind === "preset") lines.push(...summarizePreset(manifest));
  }
  return { exitCode: 0, lines };
}
