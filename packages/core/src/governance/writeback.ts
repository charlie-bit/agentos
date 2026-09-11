/**
 * Two-phase writeback, second beat: commitDraft is the ONLY door into the
 * knowledge book repo. The human-confirmation credential is structural —
 * a commit without one is refused by construction (there is deliberately no
 * --yes escape: a gate with a backdoor is scenery). Every accepted commit is
 * signed off with an evidence paragraph and an agent trailer in the git
 * message, so the book's history itself is the audit log.
 *
 * Path law: pageId (caller-supplied at draft time) is resolved UNDER bookRoot
 * only — traversal is refused, not normalized.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export interface CommitConfirmation {
  confirmedBy: string;
  confirmedAtMs: number;
}

export interface CommitDraftArgs {
  bookRoot: string;
  draftsDir: string;
  receiptsLog: string;
  receiptId: string;
  /** Relative target path inside the book, e.g. "topics/x.md" (from the receipt). */
  pageId: string;
  /** Human text justifying the write (goes into the commit message). */
  evidence: string;
  confirmation: CommitConfirmation;
  /** Inject only for failure-injection tests; defaults to real git. */
  runGit?: (args: string[], cwd: string) => string;
}

export interface CommitDraftResult {
  path: string;
  commit: string;
  appended: boolean;
}

// 2 header lines on disk: writePage writes "<!-- agentos draft -->\n<!-- target -->\n"
// followed by the body's first line (the historical value 3 ate the body's
// first line — invisible until the first frontmatter-carrying page lost its
// opening fence; fixed with P7b's founding content, human-approved 2026-09-11).
const DRAFT_HEADER_LINES = 2;

function refuse(reason: string): never {
  throw new Error(`kb_commit refused: ${reason}`);
}

export function commitDraft(a: CommitDraftArgs): CommitDraftResult {
  if (
    a.confirmation === null ||
    typeof a.confirmation !== "object" ||
    typeof a.confirmation.confirmedBy !== "string" ||
    a.confirmation.confirmedBy.length === 0 ||
    typeof a.confirmation.confirmedAtMs !== "number"
  ) {
    refuse("no human confirmation credential (confirm() result required; there is no --yes by design)");
  }
  if (a.evidence.trim().length === 0) refuse("empty evidence paragraph");

  const bookRoot = resolve(a.bookRoot);
  const target = resolve(join(bookRoot, a.pageId));
  if (target !== bookRoot && !target.startsWith(bookRoot + sep)) refuse(`pageId escapes the book root: ${JSON.stringify(a.pageId)}`);

  const draftFile = resolve(join(a.draftsDir, `${a.receiptId}.md`));
  if (!existsSync(draftFile)) refuse(`receipt ${a.receiptId} has no draft on disk (expired or already committed?)`);

  const raw = readFileSync(draftFile, "utf8");
  const body = raw.split("\n").slice(DRAFT_HEADER_LINES).join("\n").trim() === "" ? raw : raw.split("\n").slice(DRAFT_HEADER_LINES).join("\n");

  const existed = existsSync(target);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, existed ? `${readFileSync(target, "utf8").replace(/\s+$/, "")}\n\n${body}\n` : `${body.trim()}\n`, "utf8");

  const git =
    a.runGit ??
    ((args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim());
  if (!existsSync(join(bookRoot, ".git"))) git(["init"], bookRoot);
  git(["add", "--", a.pageId], bookRoot);
  const identity = ["-c", "user.name=agentos-kb", "-c", "user.email=kb@agentos.local"];
  const message = [
    `kb: ${existed ? "append" : "add"} ${a.pageId}`,
    "",
    `evidence: ${a.evidence.trim()}`,
    `confirmed-by: ${a.confirmation.confirmedBy}`,
    `confirmed-at: ${new Date(a.confirmation.confirmedAtMs).toISOString()}`,
    "",
    "Assisted-by: agentos knowledge writeback (two-phase commit)",
  ].join("\n");
  git([...identity, "commit", "-m", message, "--", a.pageId], bookRoot);
  const sha = git(["rev-parse", "HEAD"], bookRoot);

  appendFileSync(
    a.receiptsLog,
    JSON.stringify({ receiptId: a.receiptId, pageId: a.pageId, committedAtMs: Date.now(), commit: sha, evidence: a.evidence.trim() }) + "\n",
    "utf8",
  );
  return { path: target, commit: sha, appended: existed };
}

/** Draft-phase ledger line (written by the kb_write tool handler). */
export function appendDraftLedger(receiptsLog: string, line: Record<string, unknown>): void {
  mkdirSync(dirname(receiptsLog), { recursive: true });
  appendFileSync(receiptsLog, JSON.stringify({ phase: "draft", atMs: Date.now(), ...line }) + "\n", "utf8");
}
