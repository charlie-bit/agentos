/**
 * Session ledger — state and pointers only, one row per agent session.
 * The conversation CONTENT lives in the kernel's own JSONL transcripts; the
 * ledger deliberately does not copy it — only enough identity and status to
 * find and resume a conversation (sdk_session_id is a pointer, not a payload).
 * Store: node:sqlite (zero-dependency, requires Node >= 22.5; probed at
 * package boundary, see session/index.ts). Upgrade path: every consumer goes
 * through this module's five-function surface, so P5 can swap the driver for
 * Postgres behind identical signatures; the file location itself comes from
 * env (AGENTOS_SESSION_DB) so deployment decides persistence, not code.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SessionStatus = "running" | "idle" | "error" | "aborted";
const STATUSES: readonly SessionStatus[] = ["running", "idle", "error", "aborted"];

export interface SessionRow {
  id: string;
  entry: string;
  externalKey: string;
  status: SessionStatus;
  /** Pointer into the kernel's session store; null until first turn reports it. */
  sdkSessionId: string | null;
  preset: string;
  createdAtMs: number;
  lastActiveMs: number;
}

export interface NewSession {
  entry: string;
  externalKey: string;
  preset: string;
  status?: SessionStatus;
}

export interface Ledger {
  /** Insert with a fresh UUID id. Throws if externalKey is already taken. */
  createSession(s: NewSession): SessionRow;
  getByExternalKey(externalKey: string): SessionRow | undefined;
  /** Status transition; unknown ids and values are rejected. */
  markStatus(id: string, status: SessionStatus): void;
  setSdkSessionId(id: string, sdkSessionId: string): void;
  /** Refresh last_active_ms to now. */
  touch(id: string): void;
  close(): void;
}

/** Ledger DB location: AGENTOS_SESSION_DB, else .agentos/sessions.db (gitignored). */
export function ledgerPathFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.AGENTOS_SESSION_DB ?? ".agentos/sessions.db");
}

interface DbRow {
  id: string;
  entry: string;
  external_key: string;
  status: string;
  sdk_session_id: string | null;
  preset: string;
  created_at_ms: number;
  last_active_ms: number;
}

function toRow(r: DbRow): SessionRow {
  return {
    id: r.id,
    entry: r.entry,
    externalKey: r.external_key,
    status: r.status as SessionStatus,
    sdkSessionId: r.sdk_session_id,
    preset: r.preset,
    createdAtMs: r.created_at_ms,
    lastActiveMs: r.last_active_ms,
  };
}

export function openLedger(dbPath: string = ledgerPathFromEnv()): Ledger {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      entry TEXT NOT NULL,
      external_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(", ")})),
      sdk_session_id TEXT,
      preset TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      last_active_ms INTEGER NOT NULL
    )`,
  );

  const mustExist = (id: string, changes: number | bigint) => {
    if (Number(changes) === 0) throw new Error(`session not found: ${id}`);
  };

  return {
    createSession(s: NewSession): SessionRow {
      const now = Date.now();
      const row: SessionRow = {
        id: randomUUID(),
        entry: s.entry,
        externalKey: s.externalKey,
        status: s.status ?? "running",
        sdkSessionId: null,
        preset: s.preset,
        createdAtMs: now,
        lastActiveMs: now,
      };
      db.prepare(
        `INSERT INTO sessions (id, entry, external_key, status, sdk_session_id, preset, created_at_ms, last_active_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.entry,
        row.externalKey,
        row.status,
        row.sdkSessionId,
        row.preset,
        row.createdAtMs,
        row.lastActiveMs,
      );
      return row;
    },
    getByExternalKey(externalKey: string) {
      const r = db.prepare("SELECT * FROM sessions WHERE external_key = ?").get(externalKey) as DbRow | undefined;
      return r ? toRow(r) : undefined;
    },
    markStatus(id: string, status: SessionStatus) {
      if (!STATUSES.includes(status)) throw new Error(`unknown session status: ${status}`);
      mustExist(id, db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id).changes);
    },
    setSdkSessionId(id: string, sdkSessionId: string) {
      mustExist(id, db.prepare("UPDATE sessions SET sdk_session_id = ? WHERE id = ?").run(sdkSessionId, id).changes);
    },
    touch(id: string) {
      mustExist(id, db.prepare("UPDATE sessions SET last_active_ms = ? WHERE id = ?").run(Date.now(), id).changes);
    },
    close() {
      db.close();
    },
  };
}
