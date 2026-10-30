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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validatePageFrontmatter, type FrontmatterIssue } from "@agentos/core";
import { markdownFiles } from "./kb-scan.js";
import type { CliResult } from "./preset-validate.js";

export interface KbLintOptions {
  json?: boolean;
  strict?: boolean;
  now?: Date;
}

/** One dead relative link (spec #234): the page, the target as written, and why. */
export interface LinkIssue {
  page: string;
  target: string;
  message: string;
}

export interface KbLintReport {
  page: string;
  errors: FrontmatterIssue[];
  warnings: FrontmatterIssue[];
}

const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Relative-link existence over a book directory (spec #234). README.md is
 * INCLUDED here even though frontmatter validation skips it: its index links
 * are the book's map, and a map pointing at missing pages is a defect. Only
 * local targets are judged — http(s), mailto, in-page anchors and absolute
 * paths are other systems' business.
 */
export function lintLinks(dir: string): LinkIssue[] {
  const issues: LinkIssue[] = [];
  const pages = objectsToCheck(dir);
  for (const page of pages) {
    let raw: string;
    try {
      raw = readFileSync(page, "utf8");
    } catch {
      continue;
    }
    for (const match of raw.matchAll(LINK)) {
      const target = (match[1] ?? "").trim();
      if (target.length === 0) continue;
      if (/^(https?:|mailto:|tel:|#|\/)/i.test(target)) continue;
      const withoutAnchor = target.split("#")[0] ?? "";
      if (withoutAnchor.length === 0) continue;
      const resolved = resolve(dirname(page), withoutAnchor);
      if (!existsSync(resolved)) {
        issues.push({
          page,
          target,
          message: `relative link target does not exist (resolved to ${resolved})`,
        });
      }
    }
  }
  return issues;
}

/** Every markdown file in the book, README included (link check scope). */
function objectsToCheck(dir: string): string[] {
  const rootStat = statSync(dir, { throwIfNoEntry: false });
  if (!rootStat) return [];
  if (rootStat.isFile()) return /\.md$/i.test(dir) ? [dir] : [];
  const out: string[] = [];
  const walk = (current: string): void => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = join(current, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.md$/i.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
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
  for (const file of markdownFiles(dir)) {
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
  const links = lintLinks(resolve(dir));

  if (json) {
    // machine-readable: one JSON object, page reports + summary counts
    const payload = {
      dir,
      strict,
      pages: reports.length,
      errors: reports.reduce((n, r) => n + r.errors.length, 0),
      warnings: reports.reduce((n, r) => n + r.warnings.length, 0),
      unreadable,
      links,
      reports,
    };
    return { exitCode: payload.errors > 0 || links.length > 0 ? 1 : 0, lines: [JSON.stringify(payload)] };
  }

  const lines: string[] = [];
  const totalErrors = reports.reduce((n, r) => n + r.errors.length, 0);
  const totalWarnings = reports.reduce((n, r) => n + r.warnings.length, 0);
  for (const r of reports) {
    for (const e of r.errors) lines.push(`✗ ${r.page}: ${e.path}: ${e.message}`);
    for (const w of r.warnings) lines.push(`⚠ ${r.page}: ${w.path}: ${w.message}`);
  }
  for (const u of unreadable) lines.push(`✗ ${u}: unreadable (missing or no permission)`);
  for (const l of links) lines.push(`✗ ${l.page}: link:${l.target}: ${l.message}`);
  lines.push(
    reports.length === 0
      ? `○ linted ${dir}: 0 pages (directory is empty or has no .md besides README) — lint itself ran clean`
      : `○ linted ${dir}: ${reports.length} page(s), ${totalErrors} error(s), ${totalWarnings} warning(s), ${links.length} dead link(s)`,
  );
  return { exitCode: totalErrors > 0 || unreadable.length > 0 || links.length > 0 ? 1 : 0, lines };
}
