/**
 * `agentos kb lint <dir> [--json] [--strict]` — frontmatter conformance over a
 * book directory (P7b legislation). Recursively scans .md, skipping README
 * (the socket's own charter, not book content) and dot-directories (.git etc).
 * Error lines carry BOTH the file path and the dotted field path (formatter
 * philosophy: "where: what is wrong"). Exit codes: 0 = all clean, 1 = errors
 * found, 2 = usage. Zero side effects on the book itself.
 *
 * `--strict` escalates staleness WARNINGS to errors (a book repo's own CI
 * demands a fully-fresh tree; the app repo's CI runs this against an EMPTY
 * gitignored directory, which must lint green with an honest "0 pages" line —
 * the hook point for the book repo's remote-ization).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validatePageFrontmatter, type FrontmatterIssue } from "@agentos/core";
import type { CliResult } from "./preset-validate.js";

export interface KbLintOptions {
  json?: boolean;
  strict?: boolean;
  now?: Date;
}

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "README.md" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (/\.md$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

export interface KbLintReport {
  page: string;
  errors: FrontmatterIssue[];
  warnings: FrontmatterIssue[];
}

/** Lint a directory and return per-page reports (sorted by path). Pure: no output, no fs writes. */
export function lintBook(dir: string, opts: KbLintOptions = {}): { reports: KbLintReport[]; unreadable: string[] } {
  const now = opts.now ?? new Date();
  const reports: KbLintReport[] = [];
  const unreadable: string[] = [];
  let rootStat;
  try {
    rootStat = statSync(dir);
  } catch {
    return { reports, unreadable: [dir] };
  }
  if (rootStat.isFile()) {
    if (!/\.md$/i.test(dir)) return { reports, unreadable: [] };
    reports.push({ page: dir, ...judge(readFileSync(dir, "utf8"), opts, now) });
    return { reports, unreadable: [] };
  }
  for (const file of mdFiles(dir)) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      unreadable.push(file);
      continue;
    }
    reports.push({ page: file, ...judge(raw, opts, now) });
  }
  return { reports, unreadable };
}

function judge(raw: string, opts: KbLintOptions, now: Date): { errors: FrontmatterIssue[]; warnings: FrontmatterIssue[] } {
  const v = validatePageFrontmatter(raw, now);
  if (!opts.strict) return { errors: v.errors, warnings: v.warnings };
  return { errors: [...v.errors, ...v.warnings], warnings: [] };
}

export function runKbLint(argv: readonly string[]): CliResult {
  const positional: string[] = [];
  let json = false;
  let strict = false;
  for (const a of argv) {
    if (a === "--json") json = true;
    else if (a === "--strict") strict = true;
    else if (a.startsWith("-")) return { exitCode: 2, lines: [`✗ unknown flag ${JSON.stringify(a)} (kb lint takes --json --strict)`] };
    else positional.push(a);
  }
  const dir = positional[0];
  if (positional.length > 1) return { exitCode: 2, lines: ["✗ kb lint takes exactly one <dir>"] };
  if (!dir) return { exitCode: 2, lines: ["✗ kb lint requires <dir>"] };

  const { reports, unreadable } = lintBook(dir, { json, strict });

  if (json) {
    // machine-readable: one JSON object, page reports + summary counts
    const payload = {
      dir,
      strict,
      pages: reports.length,
      errors: reports.reduce((n, r) => n + r.errors.length, 0),
      warnings: reports.reduce((n, r) => n + r.warnings.length, 0),
      unreadable,
      reports,
    };
    return { exitCode: payload.errors > 0 ? 1 : 0, lines: [JSON.stringify(payload)] };
  }

  const lines: string[] = [];
  const totalErrors = reports.reduce((n, r) => n + r.errors.length, 0);
  const totalWarnings = reports.reduce((n, r) => n + r.warnings.length, 0);
  for (const r of reports) {
    for (const e of r.errors) lines.push(`✗ ${r.page}: ${e.path}: ${e.message}`);
    for (const w of r.warnings) lines.push(`⚠ ${r.page}: ${w.path}: ${w.message}`);
  }
  for (const u of unreadable) lines.push(`✗ ${u}: unreadable (missing or no permission)`);
  lines.push(
    reports.length === 0
      ? `○ linted ${dir}: 0 pages (directory is empty or has no .md besides README) — lint itself ran clean`
      : `○ linted ${dir}: ${reports.length} page(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`,
  );
  return { exitCode: totalErrors > 0 || unreadable.length > 0 ? 1 : 0, lines };
}
