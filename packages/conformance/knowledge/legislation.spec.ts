/**
 * LEGISLATION SUITE (P7b) — the knowledge book's own statutes, black-box:
 *   1. frontmatter validator branches (core public surface);
 *   2. kb lint CLI behavior incl. exit codes, README/dot skip, --strict escalation;
 *   3. kb stale queue semantics + ordering;
 *   4. GATE FILE SEMANTICS (D-0910-8): canonical=.agentos/escalations.log;
 *      backups never auto-counted; --include merges an explicitly named file.
 * Fully offline; zero credentials; temp fixtures everywhere; injected clocks.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validatePageFrontmatter } from "@agentos/core";
import { runKbGate } from "../../../cli/dist/kb-gate.js";
import { runKbLint } from "../../../cli/dist/kb-lint.js";
import { runKbStale } from "../../../cli/dist/kb-stale.js";

const tempDirs: string[] = [];
function tmp(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `agentos-legis-${label}-`));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

const NOW = new Date("2026-09-11T00:00:00Z");
const page = (meta: string, body = "body\n"): string => `---\n${meta}\n---\n\n${body}`;

/* ------------------------------------------------------------------ validator */

describe("validatePageFrontmatter (the ratified shape)", () => {
  it("a fully valid published page: zero errors, zero warnings", () => {
    const v = validatePageFrontmatter(page("owner: kb-team\nlast_verified: 2026-09-01\nstale_after: 2027-03-01\nstatus: published"), NOW);
    expect(v).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("no frontmatter at all is an EXPLICIT error — ownership is unattributable, never guessed", () => {
    const v = validatePageFrontmatter("# just a heading\n", NOW);
    expect(v.ok).toBe(false);
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0]?.path).toBe("frontmatter");
    expect(v.errors[0]?.message).toMatch(/no frontmatter/);
  });

  it("each required field missing is its own error with the dotted field path", () => {
    const v = validatePageFrontmatter(page("owner: kb-team"), NOW);
    const paths = v.errors.map((e) => e.path);
    expect(paths).toEqual(["frontmatter.last_verified", "frontmatter.stale_after", "frontmatter.status"]);
    expect(v.ok).toBe(false);
  });

  it("bad dates are errors even when the string is non-empty (YYYY-MM-DD is the promise)", () => {
    const v = validatePageFrontmatter(page("owner: t\nlast_verified: 2026/09/01\nstale_after: soon\nstatus: draft"), NOW);
    const paths = v.errors.map((e) => e.path).sort();
    expect(paths).toEqual(["frontmatter.last_verified", "frontmatter.stale_after"]);
  });

  it("status outside {draft, published} is an error quoting the allowed set", () => {
    const v = validatePageFrontmatter(page("owner: t\nlast_verified: 2026-09-01\nstale_after: 2027-09-01\nstatus: final"), NOW);
    expect(v.errors[0]?.message).toMatch(/draft \| published/);
  });

  it("published + past stale_after is a WARNING (queue input), NOT a lint error", () => {
    const v = validatePageFrontmatter(page("owner: t\nlast_verified: 2026-01-01\nstale_after: 2026-06-01\nstatus: published"), NOW);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]?.path).toBe("frontmatter.stale_after");
  });

  it("draft + past stale_after is NOT even a warning — a draft is already not-settled", () => {
    const v = validatePageFrontmatter(page("owner: t\nlast_verified: 2026-01-01\nstale_after: 2026-06-01\nstatus: draft"), NOW);
    expect(v).toEqual({ ok: true, errors: [], warnings: [] });
  });
});

/* ------------------------------------------------------------------ kb lint */

function bookWith(files: Record<string, string>): string {
  const dir = tmp("book");
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

describe("kb lint (directory scan, exit semantics)", () => {
  it("clean book exits 0 with an honest 0-error summary", () => {
    const dir = bookWith({ "a.md": page("owner: t\nlast_verified: 2026-09-01\nstale_after: 2027-09-01\nstatus: published") });
    const r = runKbLint([dir]);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join("\n")).toMatch(/1 page\(s\), 0 error\(s\)/);
  });

  it("error lines carry BOTH the file path and the dotted field path (formatter philosophy)", () => {
    const dir = bookWith({ "bad.md": page("owner: t") });
    const r = runKbLint([dir]);
    expect(r.exitCode).toBe(1);
    // one line per missing field, each with file path + dotted field path
    expect(r.lines.some((l) => /bad\.md: frontmatter\.last_verified: is required/.test(l))).toBe(true);
    expect(r.lines.some((l) => /bad\.md: frontmatter\.stale_after: is required/.test(l))).toBe(true);
    expect(r.lines.some((l) => /bad\.md: frontmatter\.status: is required/.test(l))).toBe(true);
  });

  it("README.md and dot-directories are skipped — the socket charter and .git are not book pages", () => {
    const dir = bookWith({
      "README.md": "# socket charter, no frontmatter",
      ".hidden/x.md": page("owner: t"), // would error if scanned
      "keep.md": page("owner: t\nlast_verified: 2026-09-01\nstale_after: 2027-09-01\nstatus: draft"),
    });
    const r = runKbLint([dir]);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join("\n")).toMatch(/1 page\(s\)/); // README + .hidden not counted
  });

  it("--strict escalates the staleness warning to an error (book-repo CI posture)", () => {
    const stale = page("owner: t\nlast_verified: 2026-01-01\nstale_after: 2026-06-01\nstatus: published");
    const dir = bookWith({ "aging.md": stale });
    expect(runKbLint([dir]).exitCode).toBe(0); // default: warning rides, exit 0
    const strict = runKbLint([dir, "--strict"]);
    expect(strict.exitCode).toBe(1);
    expect(strict.lines.join("\n")).toMatch(/aging\.md: frontmatter\.stale_after/);
  });

  it("--json emits ONE machine-readable object with per-page reports and counts", () => {
    const dir = bookWith({ "bad.md": page("owner: t") });
    const r = runKbLint([dir, "--json"]);
    expect(r.exitCode).toBe(1);
    const payload = JSON.parse(r.lines[r.lines.length - 1] ?? "");
    expect(payload.errors).toBe(3);
    expect(payload.reports[0]?.page).toContain("bad.md");
    expect(payload.reports[0]?.errors[0]?.path).toBe("frontmatter.last_verified");
  });

  it("usage errors exit 2: missing dir, unknown flag", () => {
    expect(runKbLint([]).exitCode).toBe(2);
    expect(runKbLint(["x", "--bogus"]).exitCode).toBe(2);
  });

  it("an EMPTY book lints green with an honest 0-pages line (the CI-on-empty-dir clause)", () => {
    const dir = tmp("empty");
    const r = runKbLint([dir, "--strict"]);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join("\n")).toMatch(/0 pages/);
  });
});

/* ------------------------------------------------------------------ kb stale */

describe("kb stale (the re-verification queue)", () => {
  it("lists published-and-overdue pages MOST overdue first, with page/owner/days", () => {
    const dir = bookWith({
      "old.md": page("owner: alice\nlast_verified: 2026-01-01\nstale_after: 2026-02-01\nstatus: published"), // ~222d overdue
      "recent.md": page("owner: bob\nlast_verified: 2026-09-01\nstale_after: 2026-09-05\nstatus: published"), // 6d overdue
      "fresh.md": page("owner: carol\nlast_verified: 2026-09-01\nstale_after: 2027-09-01\nstatus: published"),
    });
    const r = runKbStale([dir], NOW);
    expect(r.exitCode).toBe(0); // a queue is information, never a failure
    const joined = r.lines.join("\n");
    expect(joined.indexOf("old.md")).toBeLessThan(joined.indexOf("recent.md"));
    expect(joined).not.toContain("fresh.md");
    expect(joined).toMatch(/owner=alice/);
    expect(joined).toMatch(/overdue \d+d/);
  });

  it("drafts and invalid-metadata pages stay out of the queue (lint's beat, not the queue's)", () => {
    const dir = bookWith({
      "draft.md": page("owner: t\nlast_verified: 2026-01-01\nstale_after: 2026-02-01\nstatus: draft"),
      "broken.md": page("owner: t"), // missing fields → not queueable
    });
    const r = runKbStale([dir], NOW);
    expect(r.lines.join("\n")).toMatch(/stale queue empty/);
  });
});

/* ------------------------------------------------------------------ kb gate (D-0910-8) */

describe("gate file semantics (D-0910-8): canonical alone, backups opt-in", () => {
  const DAY = 86_400_000;
  const now = () => Date.parse("2026-09-11T00:00:00Z");
  const rec = (daysAgo: number, sid: string): string =>
    `${JSON.stringify({ ts: now() - daysAgo * DAY, sessionId: sid, reason: "test" })}\n`;

  function gateDir(canonicalCount: number, backupCount: number): { config: string; canonical: string; backup: string } {
    const dir = tmp("gate");
    const config = join(dir, "config");
    mkdirSync(join(config, "knowledge"), { recursive: true });
    writeFileSync(
      join(config, "knowledge", "k.yml"),
      'kind: knowledge\nversion: "1"\nname: legis-test\nprovider: markdown\nmount:\n  type: path\n  path: ./kb\nescalationGate:\n  minPerWeek: 3\n  windowDays: 7\n',
    );
    const logDir = join(dir, "agentos");
    mkdirSync(logDir, { recursive: true });
    const canonical = join(logDir, "escalations.log");
    const backup = join(logDir, "escalations.log.acceptance-noise-20260910");
    writeFileSync(canonical, Array.from({ length: canonicalCount }, (_, i) => rec(i, `canon-${i}`)).join(""));
    writeFileSync(backup, Array.from({ length: backupCount }, (_, i) => rec(i, `back-${i}`)).join(""));
    return { config, canonical, backup };
  }

  it("default: the window counts ONLY the canonical file — the backup sits right next to it and never enters", () => {
    const { config, canonical } = gateDir(1, 5); // 1 canonical + 5 in the backup
    const r = runKbGate(config, canonical, now);
    const j = r.lines.join("\n");
    expect(j).toMatch(/in window: 1\/3/);
    expect(j).toMatch(/备份文件未计入/);
    expect(j).not.toContain("back-");
  });

  it("--include <file> merges the named archive into the count — opt-in, per invocation", () => {
    const { config, canonical, backup } = gateDir(1, 5);
    const r = runKbGate(config, canonical, now, [backup]);
    expect(r.lines.join("\n")).toMatch(/in window: 6\/3/); // 1 + 5 = 6, gate fires
    expect(r.lines.join("\n")).toMatch(/已触发/);
  });

  it("a missing canonical file is zero rows, never a crash — silence is the honest count", () => {
    const dir = tmp("gate-empty");
    const r = runKbGate(dir, join(dir, "no-such.log"), now);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join("\n")).toMatch(/in window: 0\/3/);
  });
});
