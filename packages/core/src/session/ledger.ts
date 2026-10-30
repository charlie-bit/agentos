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
  /** Project instance this session belongs to (#393); null = unfiled. */
  project: string | null;
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
  /** Recent sessions, optionally narrowed by agent/project (#393/#395). */
  sessionList(filter?: { agent?: string; project?: string; limit?: number }): SessionRow[];
  /** Status transition; unknown ids and values are rejected. */
  markStatus(id: string, status: SessionStatus): void;
  setSdkSessionId(id: string, sdkSessionId: string): void;
  /** User-given label. Empty/whitespace-only or null clears it back to unset.
   * Returns the normalized value actually stored, so callers never need a
   * second read-back just to echo what was saved. */
  setTitle(id: string, title: string | null): string | null;
  /** Record the role tag for hydrate/filter (#340); null clears it. */
  setAgent(id: string, agent: string | null): void;
  setProject(id: string, project: string | null): void;
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
  /** Workflow instance verbs (#364) — additive table, DB truth. */
  workflowRunCreate(run: WorkflowRunRow): WorkflowRunRow;
  workflowRunUpdate(id: string, patch: Partial<Pick<WorkflowRunRow, "status" | "endedAtMs" | "steps" | "resumeFrom" | "error" | "sessionKey">>): WorkflowRunRow;
  workflowRunGet(id: string): WorkflowRunRow | undefined;
  workflowRunList(filter?: { workflow?: string; project?: string; status?: WorkflowRunStatus }): WorkflowRunRow[];
  /** lastRun persistence (#368): a restart never re-fires an already-fired window. */
  schedulerGetLastRun(workflow: string): { lastRunMs: number; missed: number } | undefined;
  schedulerSetLastRun(workflow: string, lastRunMs: number, missed: number): void;
  /** Project instance verbs (#389); template fields are NOT stored here (#390). */
  projectInstanceCreate(row: ProjectInstanceRow): ProjectInstanceRow;
  projectInstanceList(filter?: { template?: string }): ProjectInstanceRow[];
  projectInstanceGet(id: string): ProjectInstanceRow | undefined;
  projectInstanceRename(id: string, title: string): ProjectInstanceRow;
  projectInstanceDelete(id: string): boolean;
  close(): void;
}

/** Workflow instance state (#364): DB state, survives restarts. */
export type WorkflowRunStatus = "pending" | "running" | "done" | "error" | "aborted";
export interface WorkflowRunRow {
  id: string;
  workflow: string;
  status: WorkflowRunStatus;
  trigger: string;
  project: string | null;
  startedAtMs: number;
  endedAtMs: number | null;
  /** Persisted StepOutcome[] (bounded; pointers for large outputs). */
  steps: unknown;
  resumeFrom: number | null;
  error: string | null;
  /** Session created by this run's agent steps (#387), for replay/backlink. */
  sessionKey: string | null;
}

/** Project INSTANCE (data plane, ruling A): template name + user title only. */
export interface ProjectInstanceRow {
  id: string;
  template: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
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

function toProjectRow(r: Record<string, unknown>): ProjectInstanceRow {
  return {
    id: String(r.id),
    template: String(r.template),
    title: String(r.title),
    createdAtMs: Number(r.created_at_ms),
    updatedAtMs: Number(r.updated_at_ms),
  };
}

function toRunRow(r: Record<string, unknown>): WorkflowRunRow {
  let steps: unknown = [];
  try {
    steps = JSON.parse(String(r.steps ?? "[]"));
  } catch {
    steps = [];
  }
  return {
    id: String(r.id),
    workflow: String(r.workflow),
    status: String(r.status) as WorkflowRunStatus,
    trigger: String(r.trigger),
    project: (r.project as string | null) ?? null,
    startedAtMs: Number(r.started_at_ms),
    endedAtMs: r.ended_at_ms === null || r.ended_at_ms === undefined ? null : Number(r.ended_at_ms),
    steps,
    resumeFrom: r.resume_from === null || r.resume_from === undefined ? null : Number(r.resume_from),
    error: (r.error as string | null) ?? null,
    sessionKey: (r.session_key as string | null) ?? null,
  };
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
    project: (r as { project?: string | null }).project ?? null,
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
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN project TEXT`);
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
  if (schemaVersion < 2) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','running','done','error','aborted')),
        trigger TEXT NOT NULL,
        project TEXT,
        started_at_ms INTEGER NOT NULL,
        ended_at_ms INTEGER,
        steps TEXT NOT NULL DEFAULT '[]',
        resume_from INTEGER,
        error TEXT
      )`,
    );
    db.exec("PRAGMA user_version = 2");
  }
  if (schemaVersion < 3) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS scheduler_state (
        workflow TEXT PRIMARY KEY,
        last_run_ms INTEGER NOT NULL,
        missed INTEGER NOT NULL DEFAULT 0
      )`,
    );
    db.exec("PRAGMA user_version = 3");
  }
  try {
    db.exec(`ALTER TABLE workflow_runs ADD COLUMN session_key TEXT`);
  } catch {
    /* column already present */
  }
  if (schemaVersion < 4) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS project_instances (
        id TEXT PRIMARY KEY,
        template TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )`,
    );
    db.exec("PRAGMA user_version = 4");
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
        project: (s as { project?: string | null }).project ?? null,
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
    sessionList(filter = {}) {
      const where: string[] = [];
      const params: Array<string | number> = [];
      if (filter.agent) { where.push("agent = ?"); params.push(filter.agent); }
      if (filter.project) { where.push("project = ?"); params.push(filter.project); }
      const limit = Math.min(200, Math.max(1, filter.limit ?? 20));
      const rows = db
        .prepare(`SELECT * FROM sessions${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY last_active_ms DESC LIMIT ?`)
        .all(...params, limit) as unknown as DbRow[];
      return rows.map(toRow);
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
    setProject(id: string, project: string | null) {
      mustExist(id, db.prepare("UPDATE sessions SET project = ? WHERE id = ?").run(project, id).changes);
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
    workflowRunCreate(run) {
      db.prepare(
        `INSERT INTO workflow_runs (id, workflow, status, trigger, project, started_at_ms, ended_at_ms, steps, resume_from, error, session_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(run.id, run.workflow, run.status, run.trigger, run.project, run.startedAtMs, run.endedAtMs, JSON.stringify(run.steps ?? []), run.resumeFrom, run.error, run.sessionKey);
      return run;
    },
    workflowRunUpdate(id, patch) {
      const existing = this.workflowRunGet(id);
      if (!existing) throw new Error(`workflow run not found: ${id}`);
      const next: WorkflowRunRow = {
        ...existing,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.endedAtMs !== undefined ? { endedAtMs: patch.endedAtMs } : {}),
        ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
        ...(patch.resumeFrom !== undefined ? { resumeFrom: patch.resumeFrom } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.sessionKey !== undefined ? { sessionKey: patch.sessionKey } : {}),
      };
      db.prepare(
        `UPDATE workflow_runs SET status = ?, ended_at_ms = ?, steps = ?, resume_from = ?, error = ?, session_key = ? WHERE id = ?`,
      ).run(next.status, next.endedAtMs, JSON.stringify(next.steps ?? []), next.resumeFrom, next.error, next.sessionKey, id);
      return next;
    },
    workflowRunGet(id) {
      const r = db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return r ? toRunRow(r) : undefined;
    },
    workflowRunList(filter = {}) {
      const where: string[] = [];
      const params: string[] = [];
      if (filter.workflow) { where.push("workflow = ?"); params.push(filter.workflow); }
      if (filter.project) { where.push("project = ?"); params.push(filter.project); }
      if (filter.status) { where.push("status = ?"); params.push(filter.status); }
      const rows = db
        .prepare(`SELECT * FROM workflow_runs${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY started_at_ms DESC`)
        .all(...params) as Array<Record<string, unknown>>;
      return rows.map(toRunRow);
    },
    schedulerGetLastRun(workflow) {
      const r = db.prepare("SELECT last_run_ms, missed FROM scheduler_state WHERE workflow = ?").get(workflow) as
        | { last_run_ms: number; missed: number }
        | undefined;
      return r ? { lastRunMs: Number(r.last_run_ms), missed: Number(r.missed) } : undefined;
    },
    schedulerSetLastRun(workflow, lastRunMs, missed) {
      db.prepare(
        `INSERT INTO scheduler_state (workflow, last_run_ms, missed) VALUES (?, ?, ?)
         ON CONFLICT(workflow) DO UPDATE SET last_run_ms = excluded.last_run_ms, missed = excluded.missed`,
      ).run(workflow, lastRunMs, missed);
    },
    projectInstanceCreate(row) {
      db.prepare(
        `INSERT INTO project_instances (id, template, title, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)`,
      ).run(row.id, row.template, row.title, row.createdAtMs, row.updatedAtMs);
      return row;
    },
    projectInstanceList(filter = {}) {
      const rows = db
        .prepare(
          `SELECT * FROM project_instances${filter.template ? " WHERE template = ?" : ""} ORDER BY updated_at_ms DESC`,
        )
        .all(...(filter.template ? [filter.template] : [])) as Array<Record<string, unknown>>;
      return rows.map(toProjectRow);
    },
    projectInstanceGet(id) {
      const r = db.prepare("SELECT * FROM project_instances WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return r ? toProjectRow(r) : undefined;
    },
    projectInstanceRename(id, title) {
      const changes = db.prepare("UPDATE project_instances SET title = ?, updated_at_ms = ? WHERE id = ?").run(title.slice(0, 300), Date.now(), id).changes;
      if (Number(changes) === 0) throw new Error(`project instance not found: ${id}`);
      return this.projectInstanceGet(id) as ProjectInstanceRow;
    },
    projectInstanceDelete(id) {
      return Number(db.prepare("DELETE FROM project_instances WHERE id = ?").run(id).changes) > 0;
    },
    close() {
      db.close();
    },
  };
}
