/**
 * Page frontmatter validator (P7b legislation piece, D-0910-8-adjacent).
 *
 * The ratified shape (knowledge-base/README.md, one line per `---` fence,
 * `key: value` pairs — the provider's documented subset, no YAML library):
 *
 *     owner: team-or-person
 *     last_verified: 2026-09-10
 *     stale_after: 2027-03-10
 *     status: draft | published
 *
 * JUDGMENT CLASSES — a lint error and a queue input are different things:
 *   - ERROR = the page's metadata cannot be trusted (missing/ill-typed
 *     fields, no frontmatter at all). Lint exits non-zero on these.
 *   - WARNING = the metadata is well-formed but aging: `status: published`
 *     with `stale_after` already in the past. Stale is the QUEUE's input
 *     (`agentos kb stale` lists it), NOT a lint failure — a page does not
 *     become invalid by growing old, it becomes due for re-verification.
 *     Under `--strict` the same condition escalates to an error so a book
 *     repo's own CI can demand a fully-fresh tree.
 *
 * Zero dependencies by statute (governance is importable from core's public
 * surface); the parser mirrors the markdown provider's regex subset exactly
 * so a page the provider accepts is a page the validator can judge.
 */

/** One frontmatter problem. `path` is the dotted field path ("frontmatter.owner"). */
export interface FrontmatterIssue {
  path: string;
  message: string;
}

/** Validation verdict: ok=true means zero ERRORS (warnings may still ride along). */
export interface FrontmatterVerdict {
  ok: boolean;
  errors: FrontmatterIssue[];
  warnings: FrontmatterIssue[];
}

const REQUIRED_FIELDS = ["owner", "last_verified", "stale_after", "status"] as const;
const STATUSES = ["draft", "published"] as const;

/** `---` fenced frontmatter split, provider-compatible; no fence = { none: true }. */
export function splitFrontmatter(raw: string): { none: boolean; meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { none: true, meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/.exec(line.trim());
    if (kv?.[1] !== undefined && kv[2] !== undefined) meta[kv[1]] = kv[2].trim();
  }
  return { none: false, meta, body: raw.slice(m[0].length) };
}

/** Strict ISO calendar date (YYYY-MM-DD) — what the README's shape promises. */
function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t);
}

/**
 * Validate one page's raw markdown. `now` is injectable so tests never touch
 * the wall clock. Never throws: every defect is a reported issue.
 */
export function validatePageFrontmatter(raw: string, now: Date = new Date()): FrontmatterVerdict {
  const errors: FrontmatterIssue[] = [];
  const warnings: FrontmatterIssue[] = [];
  const at = (field: string): string => `frontmatter.${field}`;

  const { none, meta } = splitFrontmatter(raw);
  if (none) {
    // A page without frontmatter is not guessed at — ownership and freshness
    // are unattributable, which is exactly what the legislation requires.
    errors.push({ path: "frontmatter", message: "page has no frontmatter block (--- fenced, key: value lines)" });
    return { ok: false, errors, warnings };
  }

  for (const field of REQUIRED_FIELDS) {
    const v = meta[field];
    if (v === undefined || v === "") {
      errors.push({ path: at(field), message: `is required (missing or empty)` });
    }
  }

  for (const field of ["last_verified", "stale_after"]) {
    const v = meta[field];
    if (v !== undefined && v !== "" && !isIsoDate(v)) {
      errors.push({ path: at(field), message: `must be an ISO date (YYYY-MM-DD), got "${v}"` });
    }
  }

  const status = meta.status;
  if (status !== undefined && status !== "" && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    errors.push({ path: at("status"), message: `must be one of draft | published, got "${status}"` });
  }

  // Staleness is a QUEUE INPUT, not a lint error (see header). Only a
  // published page can be stale: a draft is already "not settled", so aging
  // changes nothing about how it must be treated.
  if (status === "published" && meta.stale_after !== undefined && isIsoDate(meta.stale_after)) {
    const due = Date.parse(`${meta.stale_after}T00:00:00Z`);
    if (due < now.getTime()) {
      warnings.push({
        path: at("stale_after"),
        message: `published page is past its stale_after (${meta.stale_after}) — due for re-verification (see: agentos kb stale)`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
