/**
 * spec #214 — one human confirmation = one commit.
 * The draft file is consumed on success AND a durable `phase:"committed"`
 * ledger line is written, so a second kb_commit with the same receiptId is
 * refused even if the draft unlink failed. Offline: runGit is injected.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitDraft, type CommitDraftArgs } from "../writeback.js";

const roots: string[] = [];

function fixture(): CommitDraftArgs & { gitCalls: string[][]; book: string; draftFile: string } {
  const root = mkdtempSync(join(tmpdir(), "agentos-writeback-"));
  roots.push(root);
  const book = join(root, "book");
  const draftsDir = join(root, "drafts");
  const receiptsLog = join(root, "receipts.jsonl");
  mkdirSync(book, { recursive: true });
  mkdirSync(draftsDir, { recursive: true });
  const receiptId = "r-1";
  const draftFile = join(draftsDir, `${receiptId}.md`);
  writeFileSync(draftFile, `<!-- agentos draft ${receiptId} -->\n<!-- target: NEW topics/retry.md -->\n\n# Retry policy\nevidence body\n`, "utf8");
  const gitCalls: string[][] = [];
  const runGit = (args: string[]): string => {
    gitCalls.push(args);
    return args[0] === "rev-parse" ? "sha-1" : "";
  };
  return {
    bookRoot: book,
    draftsDir,
    receiptsLog,
    receiptId,
    pageId: "topics/retry.md",
    evidence: "oncall asked twice this week",
    confirmation: { confirmedBy: "cli-user:yes", confirmedAtMs: 1_700_000_000_000 },
    runGit,
    gitCalls,
    book,
    draftFile,
  };
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("commitDraft — double-submit guard (#214)", () => {
  it("commits once, consumes the draft, and records a durable committed line", () => {
    const a = fixture();
    const out = commitDraft(a);

    expect(out.commit).toBe("sha-1");
    expect(existsSync(a.draftFile)).toBe(false);
    const ledger = readFileSync(a.receiptsLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ phase: "committed", receiptId: "r-1", pageId: "topics/retry.md", commit: "sha-1" });
    // no credential shapes / no body in the audit line
    expect(JSON.stringify(ledger[0])).not.toContain("evidence body");
  });

  it("refuses the same receiptId a second time (no second git commit, no double body)", () => {
    const a = fixture();
    commitDraft(a);
    const commitsBefore = a.gitCalls.filter((c) => c.includes("commit")).length;
    const committedBytes = readFileSync(join(a.book, "topics/retry.md"), "utf8");

    expect(() => commitDraft(a)).toThrow(/already committed/);
    expect(a.gitCalls.filter((c) => c.includes("commit")).length).toBe(commitsBefore);
    expect(readFileSync(join(a.book, "topics/retry.md"), "utf8")).toBe(committedBytes);
  });

  it("still refuses when the draft file survives the unlink (ledger is the durable guard)", () => {
    const a = fixture();
    const first = commitDraft(a);
    // Simulate an unlink that failed: the draft is back on disk.
    writeFileSync(a.draftFile, "<!-- resurrected -->\n\nbody\n", "utf8");
    expect(() => commitDraft({ ...a, runGit: a.runGit })).toThrow(/already committed/);
    expect(first.path.endsWith("topics/retry.md")).toBe(true);
  });

  it("refuses a pageId that escapes the book root", () => {
    const a = fixture();
    expect(() => commitDraft({ ...a, pageId: "../escape.md" })).toThrow(/escapes the book root/);
  });

  it("requires a human confirmation credential and non-empty evidence", () => {
    const a = fixture();
    expect(() => commitDraft({ ...a, confirmation: { confirmedBy: "", confirmedAtMs: 1 } })).toThrow(/confirmation/);
    expect(() => commitDraft({ ...a, evidence: "   " })).toThrow(/evidence/);
  });
});
