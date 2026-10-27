/**
 * `agentos data export|import|gc` (spec #161/#162) — the offline face of data
 * sovereignty. A bundle is ONE JSON file (no archive library, no dependency):
 * session metadata, usage/escalation/receipt logs, and pending drafts.
 * Conversation transcripts live in the kernel's own store and are exported
 * per-session through /api/sessions/:id/export; this bundle says so instead
 * of silently omitting them.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { openLedger, ledgerPathFromEnv, type SessionRow } from "@agentos/core";
import type { CliResult } from "./preset-validate.js";

const AGENTOS = ".agentos";
const DAY = 86_400_000;

function listFiles(dir: string, suffix?: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => (suffix ? f.endsWith(suffix) : true))
    .sort();
}

function readIf(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export interface DataBundle {
  "agentos.bundle": "data-1";
  exportedAtMs: number;
  note: string;
  sessions: Array<Pick<SessionRow, "id" | "entry" | "externalKey" | "status" | "preset" | "title" | "createdAtMs" | "lastActiveMs">>;
  logs: Record<string, string | null>;
  drafts: Array<{ name: string; content: string }>;
}

export function runDataExport(argv: readonly string[]): CliResult {
  const out = argv[0];
  if (!out || out.startsWith("-")) return { exitCode: 2, lines: ["✗ data export requires <file.json>"] };
  const root = resolve(".");
  // Root-derived path, not the env lease: gc must clean the directory it was
  // told about, and the bundle's data commands do not read AGENTOS_SESSION_DB.
  const ledger = openLedger(join(root, AGENTOS, "sessions.db"));
  let sessions: DataBundle["sessions"] = [];
  try {
    // The public ledger surface has no "all rows" verb by design; export reads
    // the same sqlite file read-only through a second handle instead.
    const db = new DatabaseSync(ledgerPathFromEnv(), { readOnly: true });
    try {
      const rows = db.prepare("SELECT * FROM sessions").all() as Array<Record<string, unknown>>;
      sessions = rows.map((r) => ({
        id: String(r.id),
        entry: String(r.entry),
        externalKey: String(r.external_key),
        status: String(r.status) as SessionRow["status"],
        preset: String(r.preset),
        title: (r.title as string | null) ?? null,
        createdAtMs: Number(r.created_at_ms),
        lastActiveMs: Number(r.last_active_ms),
      }));
    } finally {
      db.close();
    }
  } finally {
    ledger.close();
  }

  const logs: Record<string, string | null> = {
    "usage.log": readIf(join(root, AGENTOS, "usage.log")),
    "escalations.log": readIf(join(root, AGENTOS, "escalations.log")),
    "kb-receipts.jsonl": readIf(join(root, AGENTOS, "kb-receipts.jsonl")),
  };
  const draftsDir = join(root, AGENTOS, "kb-drafts");
  const drafts = listFiles(draftsDir, ".md").map((name) => ({ name, content: readFileSync(join(draftsDir, name), "utf8") }));

  const bundle: DataBundle = {
    "agentos.bundle": "data-1",
    exportedAtMs: Date.now(),
    note: "Session transcripts are NOT in this bundle; export them per session via GET /api/sessions/:id/export.",
    sessions,
    logs,
    drafts,
  };
  writeFileSync(resolve(out), JSON.stringify(bundle, null, 2) + "\n", "utf8");
  return {
    exitCode: 0,
    lines: [
      `✓ exported ${sessions.length} session row(s), ${drafts.length} draft(s) → ${out}`,
      `  logs: ${Object.entries(logs).filter(([, v]) => v !== null).map(([k]) => k).join(", ") || "none"}`,
    ],
  };
}

export function runDataImport(argv: readonly string[]): CliResult {
  const input = argv[0];
  if (!input || input.startsWith("-")) return { exitCode: 2, lines: ["✗ data import requires <file.json>"] };
  if (!existsSync(input)) return { exitCode: 1, lines: [`✗ bundle not found: ${input}`] };
  let bundle: DataBundle;
  try {
    bundle = JSON.parse(readFileSync(input, "utf8")) as DataBundle;
  } catch {
    return { exitCode: 1, lines: [`✗ bundle is not valid JSON: ${input}`] };
  }
  if (bundle?.["agentos.bundle"] !== "data-1") return { exitCode: 1, lines: ["✗ not a data-1 bundle"] };

  const ledger = openLedger(ledgerPathFromEnv());
  let imported = 0;
  try {
    for (const s of bundle.sessions ?? []) {
      const existing = ledger.getByExternalKey(s.externalKey);
      if (existing) {
        if (s.title !== null && s.title !== undefined) ledger.setTitle(existing.id, s.title);
        continue; // idempotent: external keys are unique, import never duplicates
      }
      const row = ledger.createSession({ entry: s.entry, externalKey: s.externalKey, preset: s.preset, status: s.status });
      if (s.title !== undefined && s.title !== null) ledger.setTitle(row.id, s.title);
      imported += 1;
    }
  } finally {
    ledger.close();
  }

  const root = resolve(".");
  mkdirSync(join(root, AGENTOS, "kb-drafts"), { recursive: true });
  for (const draft of bundle.drafts ?? []) {
    const target = join(root, AGENTOS, "kb-drafts", draft.name.replace(/[^A-Za-z0-9._-]+/g, "_"));
    if (!existsSync(target)) writeFileSync(target, draft.content, "utf8");
  }
  for (const [name, content] of Object.entries(bundle.logs ?? {})) {
    if (content === null || content === undefined) continue;
    const target = join(root, AGENTOS, name);
    if (!existsSync(target)) writeFileSync(target, content, "utf8");
  }
  return { exitCode: 0, lines: [`✓ imported ${imported} new session row(s); existing keys left untouched`] };
}

export function runDataGc(argv: readonly string[], now: () => number = Date.now): CliResult {
  let keepDays = 30;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--keep-days") {
      const v = Number(argv[i + 1]);
      if (!Number.isFinite(v) || v < 0) return { exitCode: 2, lines: ["✗ --keep-days requires a non-negative number"] };
      keepDays = v;
      i += 1;
    } else return { exitCode: 2, lines: [`✗ unknown data gc flag ${JSON.stringify(a)}`] };
  }
  const cutoff = now() - keepDays * DAY;
  const root = resolve(".");
  const removed: string[] = [];

  const sweepDir = (dir: string, recursive = false): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (recursive) sweepDir(p, true);
        continue;
      }
      if (st.mtimeMs < cutoff) {
        removed.push(p);
        if (!dryRun) rmSync(p, { force: true });
      }
    }
  };

  // Committed drafts are already consumed by #214; anything left in kb-drafts
  // older than the window is an abandoned draft. Workspaces and logs age out.
  // Completed todos older than the window are swept by the SAME command
  // (spec #327); open/parked todos are never touched by gc.
  // Root-derived path: gc cleans the directory it was run in, not an env lease.
  const ledger = openLedger(join(root, AGENTOS, "sessions.db"));
  try {
    for (const todo of ledger.todoList({ status: "done" })) {
      if (todo.updatedAt < cutoff) {
        ledger.todoDelete(todo.id);
        removed.push(`todo:${todo.id}`);
      }
    }
  } finally {
    ledger.close();
  }

  sweepDir(join(root, AGENTOS, "kb-drafts"));
  sweepDir(join(root, AGENTOS, "logs"));
  sweepDir(join(root, AGENTOS, "workspaces"), true);

  return {
    exitCode: 0,
    lines: [
      removed.length === 0
        ? `○ gc: nothing older than ${keepDays}d`
        : `${dryRun ? "○ would remove" : "✓ removed"} ${removed.length} path(s) older than ${keepDays}d:`,
      ...removed.map((p) => `  · ${p.replace(root + "/", "")}`),
      `  (policy: done todos / kb-drafts / logs / workspaces older than ${keepDays}d; open todos, sessions.db and receipts are never deleted)`,
    ],
  };
}
