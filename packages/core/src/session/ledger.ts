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
import type { TodoItem, TodoStatus } from "@agentos/contracts";
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
  /** User-given label; null means "no title set, display the key". */
  title: string | null;
  /** Role that last ran this session (spec #340); null = the preset's own kernel. */
  agent: string | null;
}

export interface NewSession {
  entry: string;
  externalKey: string;
  preset: string;
  status?: SessionStatus;
  agent?: string | null;
}

export interface Ledger {
  /** Insert with a fresh UUID id. Throws if externalKey is already taken. */
  createSession(s: NewSession): SessionRow;
  getByExternalKey(externalKey: string): SessionRow | undefined;
  /** Lookup by row id (routes that address a session by ledger id). */
  getById(id: string): SessionRow | undefined;
  /** Status transition; unknown ids and values are rejected. */
  markStatus(id: string, status: SessionStatus): void;
  setSdkSessionId(id: string, sdkSessionId: string): void;
  /** User-given label. Empty/whitespace-only or null clears it back to unset.
   * Returns the normalized value actually stored, so callers never need a
   * second read-back just to echo what was saved. */
  setTitle(id: string, title: string | null): string | null;
  /** Record the role tag for hydrate/filter (#340); null clears it. */
  setAgent(id: string, agent: string | null): void;
  /** Refresh last_active_ms to now. */
  touch(id: string): void;
  /**
   * Boot recovery (spec #253): a process that dies mid-turn leaves its row
   * "running" forever. At startup the previous process is gone by definition,
   * so every running row is a ghost — mark them aborted and report the count.
   */
  sweepRunning(): number;
  /** Hard delete — the ledger row only (the kernel's own transcript, if any,
   * is untouched: deleting a session removes it from the sidebar/resume list,
   * it does not shred history). Unknown id fails loudly, same as every other verb. */
  deleteSession(id: string): void;
  /**
   * Todo verbs (spec #310, DB state not memory): upsert by id, list with
   * filters, delete. The ledger owns storage; the domain vocabulary lives in
   * contracts (#308) and the kernel parses nothing.
   */
  todoWrite(item: TodoItem): TodoItem;
  todoList(filter?: { status?: TodoStatus; project?: string; dueBefore?: number }): TodoItem[];
  todoDelete(id: string): boolean;
  close(): void;
}

export interface TodoFilter {
  status?: TodoStatus;
  project?: string;
  dueBefore?: number;
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
  title: string | null;
  agent: string | null;
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
    title: r.title,
    agent: (r as { agent?: string | null }).agent ?? null,
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
  // Additive migration for DBs created before `title` existed (D-0910-7-ish:
  // pointer/status schema is a disk artifact, so new columns must ALTER, not
  // just appear in CREATE TABLE IF NOT EXISTS). Re-running this is a no-op.
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT`);
  } catch {
    /* column already present */
  }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN agent TEXT`);
  } catch {
    /* column already present */
  }

  // Additive migration discipline (#444): new tables only, user_version gated.
  const schemaVersion = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined)?.user_version ?? 0,
  );
  if (schemaVersion < 1) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        project TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('todo','doing','blocked','done')),
        priority TEXT,
        due_at_ms INTEGER,
        source_kind TEXT NOT NULL,
        source_ref TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )`,
    );
    db.exec("PRAGMA user_version = 1");
  }

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
        title: null,
        agent: s.agent ?? null,
      };
      db.prepare(
        `INSERT INTO sessions (id, entry, external_key, status, sdk_session_id, preset, created_at_ms, last_active_ms, agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.entry,
        row.externalKey,
        row.status,
        row.sdkSessionId,
        row.preset,
        row.createdAtMs,
        row.lastActiveMs,
        row.agent,
      );
      return row;
    },
    getByExternalKey(externalKey: string) {
      const r = db.prepare("SELECT * FROM sessions WHERE external_key = ?").get(externalKey) as DbRow | undefined;
      return r ? toRow(r) : undefined;
    },
    getById(id: string) {
      const r = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as DbRow | undefined;
      return r ? toRow(r) : undefined;
    },
    markStatus(id: string, status: SessionStatus) {
      if (!STATUSES.includes(status)) throw new Error(`unknown session status: ${status}`);
      mustExist(id, db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id).changes);
    },
    setSdkSessionId(id: string, sdkSessionId: string) {
      mustExist(id, db.prepare("UPDATE sessions SET sdk_session_id = ? WHERE id = ?").run(sdkSessionId, id).changes);
    },
    setAgent(id: string, agent: string | null) {
      mustExist(id, db.prepare("UPDATE sessions SET agent = ? WHERE id = ?").run(agent, id).changes);
    },
    setTitle(id: string, title: string | null) {
      const normalized = title !== null && title.trim().length > 0 ? title.trim().slice(0, 200) : null;
      mustExist(id, db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(normalized, id).changes);
      return normalized;
    },
    touch(id: string) {
      mustExist(id, db.prepare("UPDATE sessions SET last_active_ms = ? WHERE id = ?").run(Date.now(), id).changes);
    },
    sweepRunning() {
      return Number(db.prepare("UPDATE sessions SET status = 'aborted' WHERE status = 'running'").run().changes);
    },
    todoWrite(item: TodoItem) {
      db.prepare(
        `INSERT INTO todos (id, project, title, status, priority, due_at_ms, source_kind, source_ref, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project=excluded.project, title=excluded.title, status=excluded.status,
           priority=excluded.priority, due_at_ms=excluded.due_at_ms,
           source_kind=excluded.source_kind, source_ref=excluded.source_ref,
           updated_at_ms=excluded.updated_at_ms`,
      ).run(
        item.id,
        item.project ?? null,
        item.title,
        item.status,
        item.priority ?? null,
        item.dueAt ?? null,
        item.sourceKind,
        item.sourceRef ?? null,
        item.createdAt,
        item.updatedAt,
      );
      return item;
    },
    todoList(filter: TodoFilter = {}) {
      const where: string[] = [];
      const params: Array<string | number> = [];
      if (filter.status !== undefined) {
        where.push("status = ?");
        params.push(filter.status);
      }
      if (filter.project !== undefined) {
        where.push("project = ?");
        params.push(filter.project);
      }
      if (filter.dueBefore !== undefined) {
        where.push("due_at_ms IS NOT NULL AND due_at_ms <= ?");
        params.push(filter.dueBefore);
      }
      const rows = db
        .prepare(
          `SELECT * FROM todos${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY
             CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
             CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
             updated_at_ms DESC`,
        )
        .all(...params) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        ...(r.project !== null ? { project: String(r.project) } : {}),
        title: String(r.title),
        status: String(r.status) as TodoItem["status"],
        ...(r.priority !== null ? { priority: String(r.priority) as NonNullable<TodoItem["priority"]> } : {}),
        ...(r.due_at_ms !== null ? { dueAt: Number(r.due_at_ms) } : {}),
        sourceKind: String(r.source_kind) as TodoItem["sourceKind"],
        ...(r.source_ref !== null ? { sourceRef: String(r.source_ref) } : {}),
        createdAt: Number(r.created_at_ms),
        updatedAt: Number(r.updated_at_ms),
      }));
    },
    todoDelete(id: string) {
      return Number(db.prepare("DELETE FROM todos WHERE id = ?").run(id).changes) > 0;
    },
    deleteSession(id: string) {
      mustExist(id, db.prepare("DELETE FROM sessions WHERE id = ?").run(id).changes);
    },
    close() {
      db.close();
    },
  };
}
