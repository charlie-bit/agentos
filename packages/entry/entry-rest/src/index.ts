/**
 * EntryRest — the second EntryAdapter: HTTP + hand-rolled SSE (P5).
 * The browser console (apps/web) is this entry's consumer, NOT another
 * adapter. Dependency discipline identical to entry-cli: contracts + core +
 * node builtins only; zero kernel imports, zero adapters imports; the runner
 * is INJECTED so this package never even references the adapter package.
 *
 * Contract mapping (four verbs, REST semantics):
 *   identity()  os user + tenant = preset name (same shape as entry-cli)
 *   session()   browser sessionId (uuid) -> ledger externalKey "web-<id>",
 *               get-or-create, idempotent per the contract clause
 *   render()    RenderEvents -> SSE frames `data: <json>\n\n` on the
 *               session's live streams; client disconnect is silent cleanup;
 *               render NEVER throws
 *   confirm()   out-of-band: pending store keyed by requestId -> push
 *               confirm.request frame -> resolve via POST /api/confirm, or
 *               deny on timeoutMs / when no live stream exists
 *
 * Security posture: binds 127.0.0.1 ONLY (local tool, not a public service);
 * status payloads expose env-var NAMES, never values; static file serving is
 * whitelisted under the built dist with traversal rejection.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { userInfo } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type {
  ConfirmRequest,
  ConfirmResult,
  EntryAdapter,
  RenderEvent,
  SessionBinding,
  TenantRef,
  TranscriptEntry,
} from "@agentos/contracts";
import { browserSessionId, isWebExternalKey, webExternalKey } from "@agentos/contracts/session-key";
import { todoItemSchema, type TodoItem } from "@agentos/contracts";
import type { Ledger, SessionRow } from "@agentos/core";

/** Registration name presets may reference in the entry slot. */
export const ENTRY_NAME = "rest";

/**
 * The adapter's declared capabilities, exported as the SAME object the class
 * uses. The composition root reads confirm here instead of assuming it: an
 * entry that cannot ask a human must not get kb_write/kb_commit registered.
 */
export const CAPABILITIES: EntryAdapter["capabilities"] = { confirm: true };

export interface ChatTurnContext {
  prompt: string;
  /** Role name for this turn (spec #335); absent = the preset's own kernel. */
  agent?: string;
  /** Project instance this turn belongs to (#392/#393); absent = unfiled. */
  project?: string;
  /** Cancellation for THIS turn (spec #254): abort => the runner stops; partial output already delivered stays. */
  signal?: AbortSignal;
  /** Ledger externalKey for this browser session ("web-<id>"). */
  externalKey: string;
  resumeSdkSessionId?: string;
  /** Request-level model override (#115): manifest name or alias, beats presets. */
  modelOverride?: string;
  /** Incremental event delivery onto the live SSE stream. */
  emit: (event: RenderEvent) => void;
  /** Out-of-band human gate routed through the browser. */
  confirm: (req: Omit<ConfirmRequest, "requestId">) => Promise<ConfirmResult>;
}

export interface ChatTurnOutcome {
  sdkSessionId?: string;
}

/** Injected at the composition root: production = kernel runTurn; tests = script. */
export type TurnRunner = (ctx: ChatTurnContext) => Promise<ChatTurnOutcome>;

/**
 * History supplier, INJECTED for the same reason the runner is: the transcript
 * lives in the kernel's private store, and this package must not learn that
 * format (or import an adapter) to serve it. The composition root passes the
 * adapter function; conformance passes a script. Contract: return neutral
 * entries oldest-first, and never throw — an unreadable history is an empty
 * history, not a failed request.
 */
export type TranscriptReader = (args: {
  sdkSessionId: string;
  externalKey: string;
}) => TranscriptEntry[] | Promise<TranscriptEntry[]>;

export interface StartServerOptions {
  presetName: string;
  /** Names only — values must never be reachable from this data. */
  model: { provider: string; baseUrlEnv?: string; credentialsEnv?: string };
  mounts: Array<{ key: string; transport: string; degraded?: boolean; manifestPath?: string }>;
  /**
   * Read-only four-layer disclosure (spec #262): which manifest each slot
   * resolved to. Names and paths only — never contents, never env values.
   */
  knowledge?: { name: string; manifestPath?: string | null; mountType?: string | null };
  entry?: { name: string; confirm: boolean };
  /** Runtime dialect of the active model channel (spec #213). */
  dialect?: string;
  /** Scheduler liveness + active instances (spec #428). */
  scheduler?: { alive: boolean; activeRuns: number };
  runner: TurnRunner;
  ledger: Ledger;
  /** 0 = ephemeral port (tests). */
  port: number;
  /** Bind interface; default 127.0.0.1 (local-only). Containers pass 0.0.0.0. */
  host?: string;
  /** sqlite file backing /api/sessions (read-only mirror query). */
  dbPath: string;
  /** Built web console dir (apps/web/dist). Absent -> static routes 503. */
  staticDir?: string;
  /** Escalation JSONL sink. Default .agentos/escalations.log. */
  escalatePath?: string;
  /** History supplier for GET /api/sessions/:id/messages. Absent = no replay. */
  readTranscript?: TranscriptReader;
  /** The base system prompt actually sent to the model — surfaced read-only on
   * GET /api/status for the config-inspection dialog. Absent = field omitted. */
  systemPrompt?: string;
  /**
   * Local access token (spec #287). When set, every /api route requires it as
   * `x-agentos-token` or `?token=`; static assets and /healthz stay open so
   * the console can load and show "token required". Absent = no gate (tests,
   * embedders). The token is local-only and printed by the composition root.
   */
  token?: string;
  /**
   * Resolve a session's workspace directory (spec #256/#257). Absent = the
   * workspace endpoints answer 501; null = this session has no workspace.
   */
  workspaceDirFor?: (externalKey: string) => string | null;
  /**
   * Per-mount health (spec #125/#220/#292): answered on /healthz, which stays
   * 200 even when something is unhealthy — the body carries the verdict.
   */
  health?: () => ServerHealth | Promise<ServerHealth>;
  /**
   * Operational log tail (spec #124/#292). Redaction is the supplier's duty;
   * this route only bounds and forwards.
   */
  logs?: (q: { lines?: number }) => Array<{ name: string; lines: string[] }> | Promise<Array<{ name: string; lines: string[] }>>;
  /**
   * Workflow trigger surface (spec #370/#371): manual runs and webhook runs.
   * The engine is injected; this package only routes and authenticates.
   */
  runWorkflow?: (name: string, trigger: "manual" | "webhook", opts?: { project?: string; resumeFrom?: number }) => Promise<{ ok: boolean; runId?: string; reason?: string }>;
  /** Scheduler heartbeat supplier (#428); absent = field omitted. */
  schedulerStatus?: () => { alive: boolean; activeRuns: number } | Promise<{ alive: boolean; activeRuns: number }>;
  /** Project templates (config, read-only) and instances (data, writable) — #389/#390. */
  projectTemplates?: () => ProjectTemplateSummary[] | Promise<ProjectTemplateSummary[]>;
  projectInstances?: {
    list: (template?: string) => ProjectInstanceSummary[] | Promise<ProjectInstanceSummary[]>;
    create: (template: string, title: string) => ProjectInstanceSummary | null | Promise<ProjectInstanceSummary | null>;
    rename: (id: string, title: string) => ProjectInstanceSummary | null | Promise<ProjectInstanceSummary | null>;
    remove: (id: string) => boolean | Promise<boolean>;
  };
  /** Project dashboard aggregate (#395). Absent = 501. */
  projectDashboard?: (instanceId: string) => unknown | Promise<unknown>;
  /** Full project bundle for export (#396): instance + all todos/sessions/runs. */
  projectExport?: (instanceId: string) => { instance: unknown; template: unknown; todos: unknown[]; sessions: unknown[]; runs: unknown[] } | undefined | Promise<{ instance: unknown; template: unknown; todos: unknown[]; sessions: unknown[]; runs: unknown[] } | undefined>;
  /** Notification feed (#386/#427): todo due, workflow done/error — metadata only. */
  notifications?: () => Array<{ kind: string; title: string; ref?: string; ts?: number }> | Promise<Array<{ kind: string; title: string; ref?: string; ts?: number }>>;
  /** Read-only workflow catalogue / runs (#372–#374). Absent = 501. */
  workflows?: () => WorkflowSummary[] | Promise<WorkflowSummary[]>;
  workflowRuns?: (name?: string) => WorkflowRunSummary[] | Promise<WorkflowRunSummary[]>;
  workflowRunDetail?: (id: string) => { run: WorkflowRunSummary; steps: unknown[] } | undefined | Promise<{ run: WorkflowRunSummary; steps: unknown[] } | undefined>;
  /** Webhook secret VALUE for a workflow, resolved from its env-var name (#12). */
  hookSecretFor?: (name: string) => string | undefined;
  /** Read-only role catalogue (spec #342). Absent = 501. */
  agents?: () => AgentInfo[] | Promise<AgentInfo[]>;
  /**
   * Todo data plane (spec #319/#320): user data, web-writable (ruling A).
   * Absent = 501. The entry never invents a todo shape — contracts validates.
   */
  todos?: {
    list: (filter: { status?: string; project?: string; dueBefore?: number; q?: string; source?: string }) => TodoItem[] | Promise<TodoItem[]>;
    write: (item: TodoItem) => TodoItem | Promise<TodoItem>;
    remove: (id: string) => boolean | Promise<boolean>;
  };
  /** Audit sink for todo mutations (spec #326); metadata only, best effort. */
  auditPath?: string;
  /**
   * KB draft inbox (spec #270–#272): list pending drafts, commit or discard.
   * Absent = 501. The human gate is the local token + the click itself.
   */
  kbDrafts?: {
    list: () => KbDraftSummary[] | Promise<KbDraftSummary[]>;
    commit: (receiptId: string) => { ok: boolean; reason?: string } | Promise<{ ok: boolean; reason?: string }>;
    discard: (receiptId: string) => { ok: boolean } | Promise<{ ok: boolean }>;
  };
  /**
   * Usage aggregate supplier (spec #291). Metadata only — usage.log has no
   * message content. Absent = 501.
   */
  usage?: (q: { session?: string; sinceMs?: number }) => unknown | Promise<unknown>;
  /**
   * Tool diagnostics supplier (spec #290). Absent = the endpoint answers 501.
   */
  listTools?: () => ToolDescriptor[] | Promise<ToolDescriptor[]>;
  /**
   * Preset validator (spec #289): the data-only runner, injected. Same
   * contract as the CLI: { exitCode, lines }; absent = 501.
   */
  validatePreset?: (target: string) => { exitCode: number; lines: string[] } | Promise<{ exitCode: number; lines: string[] }>;
  /**
   * Preset listing supplier (spec #288). Injected for the same reason the
   * runner is: config lives on disk, this package must not learn the layout.
   * Absent = the endpoint answers 501.
   */
  listPresets?: () => PresetSummary[] | Promise<PresetSummary[]>;
  /**
   * SSE keepalive cadence (spec #252). Long turns can sit silent for minutes
   * (model thinking, slow tool); an idle proxy/browser kills the connection.
   * Absent = 15000 ms, per the product promise.
   */
  heartbeatMs?: number;
}

/** One available preset as revealed read-only (name + file, never contents). */
export interface PresetSummary {
  /** Preset manifest name or file stem. */
  name: string;
  /** Repo-relative path of the yml. */
  path: string;
}

/**
 * One mounted tool provider as the diagnostics endpoint reveals it (spec
 * #290): declaration source, retry split, and the allowlist — structure and
 * metadata only, never tool I/O.
 */
export interface ToolDescriptor {
  key: string;
  transport: string;
  /** Repo-relative manifest path the mount came from; null when synthesized. */
  manifestPath: string | null;
  /** Declared allowlist; null = no declaration (drift-unverified). */
  allowedTools: string[] | null;
  /** Idempotency declaration (the retry split); null = undeclared = never retried. */
  idempotent: { default: boolean; overrides?: Record<string, boolean> } | null;
  /** False for declared-but-unmounted / env-degraded providers. */
  mounted: boolean;
}

/** Project template summary (#398): config, read-only. */
export interface ProjectTemplateSummary {
  name: string;
  description?: string;
  agents?: string[];
  workflows?: string[];
  tools?: string[];
  knowledge?: string[];
  manifestPath: string | null;
}

/** Project instance (#389): data, web-writable — title only. */
export interface ProjectInstanceSummary {
  id: string;
  template: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
}

/** One mounted workflow as the panels see it (#372). */
export interface WorkflowSummary {
  name: string;
  description?: string;
  trigger: "manual" | "schedule" | "webhook";
  stepCount: number;
  manifestPath: string | null;
  /** Step type sequence for the read-only flow view (#376). */
  steps?: string[];
  /** Schedule only: next boundary and skipped windows (#380/#381). */
  nextRun?: string | null;
  missed?: number;
}

/** One workflow instance, run-list shaped (#373). */
export interface WorkflowRunSummary {
  id: string;
  workflow: string;
  status: "pending" | "running" | "done" | "error" | "aborted";
  trigger: string;
  project?: string | null;
  startedAtMs: number;
  endedAtMs?: number | null;
  resumeFrom?: number | null;
  error?: string | null;
  /** Session that ran this instance's agent steps (#387). */
  sessionKey?: string | null;
}

/** One pending kb_write draft as the inbox shows it (metadata + preview, no full body). */
export interface KbDraftSummary {
  receiptId: string;
  pageId: string;
  title: string;
  preview: string;
  createdAtMs: number | null;
}

/** One mounted role as management surfaces reveal it (#342): read-only disclosure. */
export interface AgentInfo {
  name: string;
  baseAgent?: string;
  /** Root → leaf inheritance chain (#343 visualization). */
  chain: string[];
  /** First 200 chars of the role's own prompt — never the full text on the wire. */
  promptPreview: string;
  tools: string[];
  knowledge?: string;
  model?: string;
  manifestPath: string | null;
}

export interface ServerHealth {
  model?: { key: string; healthy: boolean; reason?: string };
  mounts: Array<{ key: string; healthy: boolean; version?: string; reason?: string }>;
}

export interface RunningServer {
  port: number;
  /** Bound interface address — always 127.0.0.1; exposed so tests can assert it. */
  address: string;
  url: string;
  close: () => Promise<void>;
}

interface Pending extends Omit<ConfirmRequest, "requestId"> {
  requestId: string;
  resolve: (r: ConfirmResult) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const JSON_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/**
 * Concurrency law (spec #216): the HTTP surface addresses a session by an
 * EXPLICIT externalKey on every call (`sessionFor` / `renderFor` /
 * `confirmFor`). There is no mutable "current request" slot for the server to
 * race on — two tabs streaming at once each write only their own key.
 * `bind()` survives solely to satisfy the four-verb EntryAdapter shape for
 * single-request embedders; the server never calls it.
 */
export class EntryRest implements EntryAdapter {
  readonly capabilities = CAPABILITIES;

  /** externalKey -> abort controllers of in-flight turns (spec #254). */
  private readonly running = new Map<string, Set<AbortController>>();
  /** externalKey -> live SSE responses (multi-tab). */
  private readonly streams = new Map<string, ServerResponse[]>();
  private readonly pending = new Map<string, Pending>();
  /** Drift observed in a session's turn, keyed by externalKey — never one shared slot. */
  private readonly lastDriftByKey = new Map<string, { missing: string[]; undeclared: string[] }>();
  private boundKey?: string;

  constructor(
    private readonly opts: { presetName: string; ledger: Ledger },
  ) {}

  async identity(): Promise<{ userId: string; tenant: TenantRef }> {
    return { userId: userInfo().username, tenant: { tenantId: this.opts.presetName } };
  }

  /** Server binds the request's session before invoking session(). */
  bind(externalKey: string): void {
    this.boundKey = externalKey;
  }

  /** Same browser sessionId => same ledger row => same binding (idempotent). */
  async session(): Promise<SessionBinding> {
    return this.sessionFor(this.requireBound());
  }

  /** Explicit-key session binding — the only form the HTTP surface uses. */
  async sessionFor(externalKey: string): Promise<SessionBinding> {
    const row =
      this.opts.ledger.getByExternalKey(externalKey) ??
      this.opts.ledger.createSession({ entry: ENTRY_NAME, externalKey, preset: this.opts.presetName });
    return { clientSessionId: externalKey, agentSessionId: row.id };
  }

  /** SSE delivery; malformed events / dead sockets must never propagate. */
  render(events: RenderEvent[]): void {
    this.renderFor(this.boundKey ?? "", events);
  }

  /** Explicit-key SSE delivery (see the concurrency law above). */
  renderFor(externalKey: string, events: RenderEvent[]): void {
    const key = externalKey;
    if (!key) return;
    for (const res of this.streams.get(key) ?? []) {
      for (const event of events ?? []) {
        try {
          if (!event || typeof event.type !== "string") continue;
          if (event.type === "kernel.system.drift") {
            const p = (event.payload ?? {}) as { missing?: string[]; undeclared?: string[] };
            this.lastDriftByKey.set(key, { missing: p.missing ?? [], undeclared: p.undeclared ?? [] });
          }
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          /* one bad frame must not kill the stream */
        }
      }
    }
  }

  /** Out-of-band gate: push confirm.request, await POST /api/confirm or deny. */
  confirm(req: ConfirmRequest): Promise<ConfirmResult> {
    return this.confirmFor(this.boundKey ?? "", req);
  }

  /** Explicit-key human gate (see the concurrency law above). */
  confirmFor(externalKey: string, req: ConfirmRequest): Promise<ConfirmResult> {
    const key = externalKey;
    const sockets = this.streams.get(key) ?? [];
    if (sockets.length === 0) {
      return Promise.resolve({ approved: false, decidedBy: "no-channel", timestampMs: Date.now() });
    }
    const requestId = req.requestId ?? randomUUID();
    return new Promise<ConfirmResult>((resolveFn) => {
      const entry: Pending = { ...req, requestId, resolve: resolveFn };
      if (req.timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          this.settle(requestId, { approved: false, decidedBy: "timeout", timestampMs: Date.now() });
        }, req.timeoutMs);
      }
      this.pending.set(requestId, entry);
      try {
        const frame = JSON.stringify({
          type: "confirm.request",
          payload: { requestId, prompt: req.prompt, subject: req.subject ?? null },
          timestampMs: Date.now(),
        });
        for (const s of sockets) s.write(`data: ${frame}\n\n`);
      } catch {
        this.settle(requestId, { approved: false, decidedBy: "channel-error", timestampMs: Date.now() });
      }
    });
  }

  settle(requestId: string, result: ConfirmResult): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    if (p.timer) clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(result);
    return true;
  }

  addStream(externalKey: string, res: ServerResponse): void {
    const list = this.streams.get(externalKey) ?? [];
    list.push(res);
    this.streams.set(externalKey, list);
    res.on("close", () => {
      const current = this.streams.get(externalKey) ?? [];
      this.streams.set(externalKey, current.filter((x) => x !== res));
    });
  }

  /**
   * Status for ONE session (spec #218): the caller names the externalKey, so
   * session A's drift can never be reported as session B's. Absent key or no
   * drift observed = null, never another session's record.
   */
  statusSnapshot(externalKey?: string): { lastDrift: { missing: string[]; undeclared: string[] } | null; waitingConfirms: number } {
    return {
      lastDrift: externalKey === undefined ? null : (this.lastDriftByKey.get(externalKey) ?? null),
      waitingConfirms: this.pending.size,
    };
  }

  /**
   * Push one neutral event to EVERY live SSE stream (spec #323): todo changes
   * are user data, not session-private, so a second tab sees them at once.
   * Malformed/dead sockets are skipped; this never throws.
   */
  broadcast(event: RenderEvent): void {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const sockets of this.streams.values()) {
      for (const res of sockets) {
        try {
          res.write(frame);
        } catch {
          /* dead socket: cleaned up on close */
        }
      }
    }
  }

  /** Register a turn's cancellation handle; returns the unregister. */
  registerTurn(externalKey: string, controller: AbortController): () => void {
    const set = this.running.get(externalKey) ?? new Set<AbortController>();
    set.add(controller);
    this.running.set(externalKey, set);
    return () => {
      const current = this.running.get(externalKey);
      current?.delete(controller);
      if (current && current.size === 0) this.running.delete(externalKey);
    };
  }

  /** Abort every in-flight turn for one session; returns how many were signalled. */
  abort(externalKey: string): number {
    const set = this.running.get(externalKey);
    if (!set) return 0;
    let count = 0;
    for (const c of [...set]) {
      try {
        c.abort();
        count += 1;
      } catch {
        /* already settled */
      }
    }
    this.running.delete(externalKey);
    return count;
  }

  /** Deny every outstanding confirm (shutdown path). */
  settleAll(reason: string): void {
    for (const id of [...this.pending.keys()]) {
      this.settle(id, { approved: false, decidedBy: reason, timestampMs: Date.now() });
    }
  }

  private requireBound(): string {
    if (!this.boundKey) throw new Error("no request session bound");
    return this.boundKey;
  }
}

/** JSON body reader with a hard size cap; malformed input -> null, never throws. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) return null;
    chunks.push(c as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}


/** Failure classes the console can act on (spec #264, additive vocabulary). */
export type TurnErrorKind = "aborted" | "tool-missing" | "gate-denied" | "model-fallback" | "network" | "error";

/**
 * Classify a turn failure into an actionable kind. Deliberately conservative:
 * a message that matches nothing stays "error" rather than guessing. The
 * vocabulary is additive — consumers must tolerate unknown subtypes.
 */
export function classifyTurnError(err: unknown, aborted = false): TurnErrorKind {
  if (aborted) return "aborted";
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (/econnrefused|enotfound|etimedout|fetch failed|network|socket hang up|econnreset/.test(message)) return "network";
  if (/not part of this deployment|denied by policy|gate|not allowed/.test(message)) return "gate-denied";
  if (/unknown tool|tool not found|no such tool|tool .* missing/.test(message)) return "tool-missing";
  if (/fallback|no healthy alias|degrad/.test(message)) return "model-fallback";
  return "error";
}

/** Neutral transcript entries -> the two download formats (spec #259). */
function serializeTranscript(entries: readonly TranscriptEntry[], format: "jsonl" | "md", title?: string | null): string {
  if (format === "jsonl") return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
  const lines: string[] = [`# ${title ?? "Session transcript"}`, ""];
  for (const e of entries) {
    const when = e.timestampMs === undefined ? "" : ` · ${new Date(e.timestampMs).toISOString()}`;
    if (e.role === "tool") {
      lines.push(`**tool${e.isError ? " (error)" : ""}** \`${e.toolName ?? "?"}\`${when}`, "", "```", e.text, "```", "");
    } else {
      lines.push(`**${e.role}**${when}`, "", e.text, "");
    }
  }
  return lines.join("\n");
}

/** Download file name: browser-side identity only, never a user title (R9). */
function exportFileName(browserKey: string, ext: string): string {
  const safe = browserKey.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  return `agentos-session-${safe || "session"}.${ext}`;
}


/** Todo mutations land in the audit log as id+action only (spec #326, R2/R8). */
function auditTodo(o: { auditPath?: string }, action: string, id: string): void {
  try {
    const path = o.auditPath ?? join(".agentos", "audit.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ ts: Date.now(), event: action, id }) + "\n", "utf8");
  } catch {
    /* audit is best-effort and never blocks the write */
  }
}

/** One file in a session workspace, as /api/workspace/files reveals it (spec #256). */
export interface WorkspaceFileEntry {
  /** Workspace-relative path with "/" separators. */
  path: string;
  size: number;
  mtimeMs: number;
}

/** Hard cap: a workspace is a working directory, not an archive. */
export const WORKSPACE_LIST_LIMIT = 500;

/**
 * Recursive listing under ONE session workspace, bounded and deterministic.
 * Symlinked FILES are listed (they are workspace content); symlinked
 * DIRECTORIES are not followed, so the walk can never leave the tree.
 */
export function listWorkspaceFiles(root: string, limit = WORKSPACE_LIST_LIMIT): WorkspaceFileEntry[] {
  const out: WorkspaceFileEntry[] = [];
  const walk = (dir: string, prefix: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subtree: report what is readable
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= limit) return;
      const rel = prefix.length === 0 ? e.name : `${prefix}/${e.name}`;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.isSymbolicLink()) continue; // never follow links out of the tree
        walk(abs, rel);
        continue;
      }
      try {
        const st = statSync(abs);
        out.push({ path: rel, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        /* vanished between readdir and stat: skip */
      }
    }
  };
  if (existsSync(root)) walk(root, "");
  return out;
}

/** Inline read cap for one workspace file (spec #257). */
export const WORKSPACE_READ_MAX_BYTES = 1_000_000;

export type WorkspaceRead =
  | { ok: true; path: string; size: number; content: string; truncated: boolean }
  | { ok: false; reason: "invalid-path" | "not-found" | "not-a-file" | "unreadable" };

/**
 * Read ONE file under a session workspace. The fence is two-layered:
 * lexical (resolve + prefix, so "../" and absolute paths fail) and physical
 * (realpath of the target must stay under realpath(root), so a symlink that
 * points outside is refused even though it lives inside). Reads are bounded
 * by WORKSPACE_READ_MAX_BYTES; the response says when it truncated.
 */
export function readWorkspaceFile(root: string, relPath: string, maxBytes = WORKSPACE_READ_MAX_BYTES): WorkspaceRead {
  if (relPath.length === 0 || relPath.length > 500 || relPath.includes("\0") || isAbsolute(relPath)) {
    return { ok: false, reason: "invalid-path" };
  }
  if (relPath.split(/[/\\]/).some((part) => part === "..")) return { ok: false, reason: "invalid-path" };

  const rootAbs = resolve(root);
  const target = resolve(join(rootAbs, normalize(relPath)));
  if (target !== rootAbs && !target.startsWith(rootAbs + sep)) return { ok: false, reason: "invalid-path" };
  if (!existsSync(target)) return { ok: false, reason: "not-found" };

  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = realpathSync(rootAbs);
    realTarget = realpathSync(target);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!realTarget.startsWith(realRoot + sep)) return { ok: false, reason: "invalid-path" };
  try {
    if (!statSync(realTarget).isFile()) return { ok: false, reason: "not-a-file" };
    const fd = openSync(realTarget, "r");
    try {
      const size = Number(fstatSync(fd).size);
      const take = Math.min(size, maxBytes);
      const buf = Buffer.alloc(take);
      const readTotal = readSync(fd, buf, 0, take, 0);
      return {
        ok: true,
        path: relPath,
        size,
        content: buf.subarray(0, readTotal).toString("utf8"),
        truncated: size > maxBytes,
      };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export async function startServer(o: StartServerOptions): Promise<RunningServer> {
  const entry = new EntryRest({ presetName: o.presetName, ledger: o.ledger });
  const escalatePath = o.escalatePath ?? join(".agentos", "escalations.log");

  const sendJson = (res: ServerResponse, code: number, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
    res.end(payload);
  };

  const serveStatic = (res: ServerResponse, urlPath: string): void => {
    if (!o.staticDir || !existsSync(o.staticDir)) {
      sendJson(res, 503, { error: 'web console not built — run: pnpm --filter @agentos/web build' });
      return;
    }
    const staticRoot = resolve(o.staticDir);
    const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
    const target = resolve(join(staticRoot, normalize(rel)));
    if (target !== staticRoot && !target.startsWith(staticRoot + sep)) {
      sendJson(res, 403, { error: "forbidden" }); // traversal attempt — outside the whitelisted root
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    const ext = target.slice(target.lastIndexOf("."));
    res.writeHead(200, { "content-type": JSON_TYPES[ext] ?? "application/octet-stream" });
    res.end(readFileSync(target));
  };

  const server: Server = createServer((req, res) => {
    void route(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
      else res.end();
    });
  });

  const tokenOk = (req: IncomingMessage, url: URL): boolean => {
    if (o.token === undefined) return true;
    const header = req.headers["x-agentos-token"];
    const supplied = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get("token") ?? "";
    const a = Buffer.from(supplied);
    const b = Buffer.from(o.token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    // Token gate (spec #287): the console's static shell and healthz stay
    // reachable so a browser can be told it needs a token; everything else
    // that answers about sessions/config/content requires it.
    if (o.token !== undefined && path.startsWith("/api/") && !tokenOk(req, url)) {
      return sendJson(res, 403, { error: "token required (x-agentos-token header or ?token=)" });
    }
    if (req.method === "GET" && path === "/healthz") {
      // Liveness is the process; health is the body. A dead mount/channel is
      // reported unhealthy while the endpoint itself stays 200 (spec #220).
      let health: ServerHealth = { mounts: [] };
      if (o.health) {
        try {
          health = await o.health();
        } catch {
          health = { mounts: [], model: { key: "unknown", healthy: false, reason: "health probe failed" } };
        }
      }
      return sendJson(res, 200, { ok: true, ...health });
    }
    if (req.method === "GET" && path === "/api/status") {
      return sendJson(res, 200, {
        preset: o.presetName,
        model: { provider: o.model.provider, baseUrlEnv: o.model.baseUrlEnv ?? null, credentialsEnv: o.model.credentialsEnv ?? null },
        mounts: o.mounts,
        knowledge: o.knowledge ?? null,
        entry: o.entry ?? null,
        dialect: o.dialect ?? null,
        scheduler: o.schedulerStatus ? await o.schedulerStatus() : null,
        systemPrompt: o.systemPrompt ?? null,
        ...entry.statusSnapshot(
          url.searchParams.get("session") === null ? undefined : webExternalKey(url.searchParams.get("session") as string),
        ),
      });
    }
    if (req.method === "GET" && path === "/api/sessions") {
      // Pagination, not a silent truncation (spec #221): the list is ordered
      // by recency and the caller pages through it. Bounds are hard caps, so
      // a hostile query cannot ask for the whole table.
      const intParam = (name: string, fallback: number, min: number, max: number): number => {
        const raw = url.searchParams.get(name);
        const n = raw === null ? fallback : Number(raw);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
      };
      const limit = intParam("limit", 100, 1, 500);
      const offset = intParam("offset", 0, 0, Number.MAX_SAFE_INTEGER);
      // Server-side search (spec #267): a bounded substring match over the
      // user-visible labels only (title / external key) — never transcripts.
      const agentFilter = url.searchParams.get("agent");
      const projectFilter = url.searchParams.get("project");
      if (agentFilter !== null && agentFilter.length > 120) return sendJson(res, 400, { error: "agent must be at most 120 chars" });
      const rawQ = url.searchParams.get("q");
      if (rawQ !== null && rawQ.length > 200) return sendJson(res, 400, { error: "q must be at most 200 chars" });
      const q = rawQ === null ? null : rawQ.trim();
      if (!existsSync(o.dbPath)) return sendJson(res, 200, { sessions: [], limit, offset, total: 0, hasMore: false, q });
      const db = new DatabaseSync(o.dbPath, { readOnly: true });
      try {
        const clauses: string[] = [];
        const filters: Array<string> = [];
        if (q !== null && q.length > 0) {
          clauses.push("(title LIKE ? ESCAPE '\\' OR external_key LIKE ? ESCAPE '\\')");
          const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
          filters.push(like, like);
        }
        if (agentFilter !== null && agentFilter.length > 0) {
          clauses.push("agent = ?");
          filters.push(agentFilter);
        }
        if (projectFilter !== null && projectFilter.length > 0) {
          clauses.push("project = ?");
          filters.push(projectFilter);
        }
        const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
        const params = [...filters, limit, offset];
        const rows = db
          .prepare(
            `SELECT id, external_key, status, preset, last_active_ms, title, agent, project FROM sessions${where} ORDER BY last_active_ms DESC, id DESC LIMIT ? OFFSET ?`,
          )
          .all(...params) as Array<Record<string, unknown>>;
        const countRow = db
          .prepare(`SELECT COUNT(*) AS n FROM sessions${where}`)
          .get(...filters) as { n: number | bigint } | undefined;
        const total = Number(countRow?.n ?? 0);
        return sendJson(res, 200, { sessions: rows, limit, offset, total, hasMore: offset + rows.length < total, q });
      } finally {
        db.close();
      }
    }
    // ---- title rename (WRITE; the only write route this GET-heavy list has) -
    // Keyed by ledger id (what GET /api/sessions already hands the sidebar),
    // not externalKey — no ambiguity, no forgiving-resolution rules needed.
    const titleMatch = /^\/api\/sessions\/([^/]+)\/title$/.exec(path);
    if (req.method === "PATCH" && titleMatch) {
      const id = decodeURIComponent(titleMatch[1] ?? "");
      const body = await readJson(req);
      const rawTitle = body?.title;
      if (rawTitle !== null && rawTitle !== undefined && typeof rawTitle !== "string") {
        return sendJson(res, 400, { error: "title must be a string or null" });
      }
      try {
        const title = o.ledger.setTitle(id, typeof rawTitle === "string" ? rawTitle : null);
        return sendJson(res, 200, { ok: true, title });
      } catch {
        return sendJson(res, 404, { error: "session not found" });
      }
    }
    // ---- delete (WRITE; immediate, no soft-delete/undo) --------------------
    // Removes the ledger row only — the kernel's own JSONL transcript, if any,
    // is untouched (the row is a pointer, not the content). This does NOT
    // cancel an in-flight turn on that session: no cancellation token exists
    // between here and the kernel today, so "delete while running" just makes
    // the eventual result/error write fail loudly (route-level catch → the SSE
    // stream, if still open, just ends) rather than silently resurrect the row.
    const abortMatch = /^\/api\/sessions\/([^/]+)\/abort$/.exec(path);
    if (req.method === "POST" && abortMatch) {
      let requested: string;
      try {
        requested = decodeURIComponent(abortMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable session id" });
      }
      if (requested.length === 0 || requested.length > 200) return sendJson(res, 400, { error: "invalid session id" });
      const key = isWebExternalKey(requested) ? requested : webExternalKey(requested);
      const aborted = entry.abort(key);
      const row = o.ledger.getByExternalKey(key);
      if (row) {
        try {
          o.ledger.markStatus(row.id, "aborted");
          o.ledger.touch(row.id);
        } catch {
          /* deleted concurrently: nothing to record */
        }
      }
      return sendJson(res, 200, { ok: true, aborted, sessionId: key });
    }
    const deleteMatch = /^\/api\/sessions\/([^/]+)$/.exec(path);
    if (req.method === "DELETE" && deleteMatch) {
      const id = decodeURIComponent(deleteMatch[1] ?? "");
      try {
        // Cancel first (spec #217): a deleted session's in-flight turn must not
        // keep the SSE stream alive or write a late row.
        const row = o.ledger.getById(id);
        if (row) entry.abort(row.externalKey);
        o.ledger.deleteSession(id);
        return sendJson(res, 200, { ok: true });
      } catch {
        return sendJson(res, 404, { error: "session not found" });
      }
    }
    // ---- history replay (READ-ONLY; this route never writes anything) ------
    // The ledger keeps state + a POINTER; the conversation itself lives in the
    // kernel's store, reachable only through the injected reader. Semantics are
    // deliberately forgiving because history is a nicety, never load-bearing:
    // unknown session, no pointer yet (session never took a turn), no reader
    // wired, or an unreadable/corrupt store ALL answer 200 with an empty list.
    // A 404/500 here would make a cosmetic gap look like a broken console.
    // `:id` is the browser session id (the same value POST /api/chat takes), or
    // a raw ledger externalKey — the sidebar has the latter, a reloading tab
    // only the former.
    if (req.method === "POST" && path === "/api/sessions/export") {
      // Batch export (spec #260): one bundle, no archive library needed — the
      // NDJSON stream is self-describing and streams well. R7: bounded ids,
      // exact lookup only (never a path built from user input).
      const body = await readJson(req);
      const ids = body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
        return sendJson(res, 400, { error: "ids must be a non-empty array of at most 100 session ids" });
      }
      if (!ids.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200)) {
        return sendJson(res, 400, { error: "every id must be a string of 1..200 chars" });
      }
      const lines: string[] = [JSON.stringify({ "agentos.bundle": "1", exportedAtMs: Date.now(), sessions: ids.length })];
      for (const requestedId of ids) {
        const row =
          o.ledger.getByExternalKey(isWebExternalKey(requestedId) ? requestedId : webExternalKey(requestedId)) ??
          o.ledger.getByExternalKey(requestedId);
        if (!row) {
          lines.push(JSON.stringify({ session: { externalKey: requestedId }, error: "not-found" }));
          continue;
        }
        let entries: TranscriptEntry[] = [];
        if (row.sdkSessionId !== null && o.readTranscript) {
          try {
            entries = await o.readTranscript({ sdkSessionId: row.sdkSessionId, externalKey: row.externalKey });
          } catch {
            entries = [];
          }
        }
        lines.push(
          JSON.stringify({
            session: { externalKey: row.externalKey, title: row.title, preset: row.preset, createdAtMs: row.createdAtMs },
          }),
        );
        for (const e of entries) lines.push(JSON.stringify({ entry: e }));
      }
      const bodyText = lines.join("\n") + "\n";
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="agentos-sessions-${new Date().toISOString().slice(0, 10)}.jsonl"`,
        "content-length": Buffer.byteLength(bodyText),
      });
      res.end(bodyText);
      return;
    }
    const exportMatch = /^\/api\/sessions\/([^/]+)\/export$/.exec(path);
    if (req.method === "GET" && exportMatch) {
      const rawId = exportMatch[1] ?? "";
      let requested: string;
      try {
        requested = decodeURIComponent(rawId);
      } catch {
        return sendJson(res, 400, { error: "undecodable session id" });
      }
      if (requested.length === 0 || requested.length > 200) return sendJson(res, 400, { error: "invalid session id" });
      const format = url.searchParams.get("format") ?? "jsonl";
      if (format !== "jsonl" && format !== "md") return sendJson(res, 400, { error: "format must be jsonl or md" });

      const row = o.ledger.getByExternalKey(isWebExternalKey(requested) ? requested : webExternalKey(requested)) ?? o.ledger.getByExternalKey(requested);
      if (!row) return sendJson(res, 404, { error: "session not found" });
      let entries: TranscriptEntry[] = [];
      if (row.sdkSessionId !== null && o.readTranscript) {
        try {
          entries = await o.readTranscript({ sdkSessionId: row.sdkSessionId, externalKey: row.externalKey });
        } catch {
          entries = []; // export of an unreadable store: the empty transcript, never a failed download
        }
      }
      const body = serializeTranscript(entries, format, row.title);
      const filename = exportFileName(browserSessionId(row.externalKey), format);
      res.writeHead(200, {
        "content-type": format === "md" ? "text/markdown; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    const messages = /^\/api\/sessions\/([^/]+)\/messages$/.exec(path);
    if (req.method === "GET" && messages) {
      let raw: string;
      try {
        raw = decodeURIComponent(messages[1] ?? "");
      } catch {
        return sendJson(res, 200, { entries: [] }); // undecodable id: nothing to replay
      }
      if (raw.length === 0 || raw.length > 200) return sendJson(res, 200, { entries: [] });
      const row = o.ledger.getByExternalKey(isWebExternalKey(raw) ? raw : webExternalKey(raw)) ?? o.ledger.getByExternalKey(raw);
      const pointer = row?.sdkSessionId ?? null;
      if (!row || pointer === null || !o.readTranscript) return sendJson(res, 200, { entries: [] });
      try {
        const entries = await o.readTranscript({ sdkSessionId: pointer, externalKey: row.externalKey });
        return sendJson(res, 200, { entries: Array.isArray(entries) ? entries : [] });
      } catch {
        return sendJson(res, 200, { entries: [] }); // reader blew up: degrade, never 500
      }
    }
    const attachMatch = /^\/api\/sessions\/([^/]+)\/attachments$/.exec(path);
    if (req.method === "POST" && attachMatch) {
      // Attachment upload (spec #276): raw body + encoded filename header.
      // Bounded (5MB) and written only inside the session workspace.
      if (!o.workspaceDirFor) return sendJson(res, 501, { error: "workspace access not wired by this deployment" });
      let requested: string;
      try {
        requested = decodeURIComponent(attachMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable session id" });
      }
      if (requested.length === 0 || requested.length > 200) return sendJson(res, 400, { error: "invalid session id" });
      const key = isWebExternalKey(requested) ? requested : webExternalKey(requested);
      const dir = o.workspaceDirFor(key);
      if (dir === null) return sendJson(res, 404, { error: "session has no workspace" });
      const rawName = req.headers["x-filename"];
      let filename: string;
      try {
        filename = decodeURIComponent((Array.isArray(rawName) ? rawName[0] : rawName) ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable filename" });
      }
      const safe = filename.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/^\.+/, "").slice(0, 120);
      if (safe.length === 0) return sendJson(res, 400, { error: "filename required (x-filename header)" });
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;
      for await (const c of req) {
        size += (c as Buffer).length;
        if (size > 5_000_000) {
          tooLarge = true;
          break;
        }
        chunks.push(c as Buffer);
      }
      if (tooLarge) return sendJson(res, 413, { error: "attachment exceeds 5MB" });
      const rel = `attachments/${safe}`;
      const target = resolve(join(dir, rel));
      if (!target.startsWith(resolve(dir) + sep)) return sendJson(res, 400, { error: "invalid filename" });
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.concat(chunks));
      return sendJson(res, 200, { path: rel, size });
    }
    if (req.method === "GET" && path === "/api/workspace/file") {
      if (!o.workspaceDirFor) return sendJson(res, 501, { error: "workspace access not wired by this deployment" });
      const requestedSession = url.searchParams.get("session");
      const requestedPath = url.searchParams.get("path");
      if (requestedSession === null || requestedSession.length === 0 || requestedSession.length > 200) {
        return sendJson(res, 400, { error: "session is required (<= 200 chars)" });
      }
      if (requestedPath === null || requestedPath.length === 0) return sendJson(res, 400, { error: "path is required" });
      const key = isWebExternalKey(requestedSession) ? requestedSession : webExternalKey(requestedSession);
      const dir = o.workspaceDirFor(key);
      if (dir === null) return sendJson(res, 404, { error: "session has no workspace" });
      const result = readWorkspaceFile(dir, requestedPath);
      if (!result.ok) {
        const status = result.reason === "not-found" ? 404 : result.reason === "invalid-path" ? 403 : 400;
        return sendJson(res, status, { error: result.reason });
      }
      return sendJson(res, 200, result);
    }
    if (req.method === "GET" && path === "/api/workspace/files") {
      if (!o.workspaceDirFor) return sendJson(res, 501, { error: "workspace access not wired by this deployment" });
      const requested = url.searchParams.get("session");
      if (requested === null || requested.length === 0 || requested.length > 200) {
        return sendJson(res, 400, { error: "session is required (<= 200 chars)" });
      }
      const key = isWebExternalKey(requested) ? requested : webExternalKey(requested);
      const dir = o.workspaceDirFor(key);
      if (dir === null) return sendJson(res, 200, { files: [], limit: WORKSPACE_LIST_LIMIT });
      return sendJson(res, 200, { files: listWorkspaceFiles(dir), limit: WORKSPACE_LIST_LIMIT });
    }
    if (req.method === "GET" && path === "/api/usage") {
      if (!o.usage) return sendJson(res, 501, { error: "usage querying not wired by this deployment" });
      const sessionParam = url.searchParams.get("session");
      const sinceParam = url.searchParams.get("since");
      let sinceMs: number | undefined;
      if (sinceParam !== null) {
        // Accept epoch ms or an ISO timestamp; anything else is a client error.
        const asNumber = Number(sinceParam);
        sinceMs = Number.isFinite(asNumber) && sinceParam.trim() !== "" ? asNumber : Date.parse(sinceParam);
        if (Number.isNaN(sinceMs)) return sendJson(res, 400, { error: "since must be epoch ms or an ISO timestamp" });
      }
      try {
        const aggregate = await o.usage({
          ...(sessionParam !== null && sessionParam.length <= 200 ? { session: sessionParam } : {}),
          ...(sinceMs !== undefined ? { sinceMs } : {}),
        });
        return sendJson(res, 200, aggregate);
      } catch {
        return sendJson(res, 200, { rows: [], totals: null, error: "usage log unreadable" });
      }
    }
    if (req.method === "GET" && path === "/api/logs") {
      if (!o.logs) return sendJson(res, 200, { files: [] });
      const rawLines = url.searchParams.get("lines");
      const lines = rawLines === null ? 100 : Number(rawLines);
      if (!Number.isFinite(lines)) return sendJson(res, 400, { error: "lines must be a number" });
      try {
        const files = await o.logs({ lines: Math.min(500, Math.max(1, Math.trunc(lines))) });
        return sendJson(res, 200, { files: Array.isArray(files) ? files : [] });
      } catch {
        return sendJson(res, 200, { files: [] });
      }
    }

    if (req.method === "GET" && path === "/api/project-templates") {
      if (!o.projectTemplates) return sendJson(res, 501, { error: "project templates not wired by this deployment" });
      try {
        return sendJson(res, 200, { templates: await o.projectTemplates() });
      } catch {
        return sendJson(res, 200, { templates: [] });
      }
    }
    if (req.method === "GET" && path === "/api/project-instances") {
      if (!o.projectInstances) return sendJson(res, 501, { error: "project instances not wired by this deployment" });
      const template = url.searchParams.get("template") ?? undefined;
      try {
        return sendJson(res, 200, { instances: await o.projectInstances.list(template) });
      } catch {
        return sendJson(res, 200, { instances: [] });
      }
    }
    if (req.method === "POST" && path === "/api/project-instances") {
      if (!o.projectInstances) return sendJson(res, 501, { error: "project instances not wired by this deployment" });
      const body = await readJson(req);
      const template = body?.template;
      const title = body?.title;
      if (typeof template !== "string" || template.length === 0 || template.length > 120) {
        return sendJson(res, 400, { error: "template is required" });
      }
      if (typeof title !== "string" || title.trim().length === 0 || title.length > 300) {
        return sendJson(res, 400, { error: "title is required (<=300 chars)" });
      }
      const created = await o.projectInstances.create(template, title.trim());
      if (created === null) return sendJson(res, 400, { error: `unknown project template: ${template}` });
      return sendJson(res, 201, { instance: created });
    }
    const projectExportMatch = /^\/api\/project-instances\/([^/]+)\/export$/.exec(path);
    if (req.method === "GET" && projectExportMatch) {
      if (!o.projectExport) return sendJson(res, 501, { error: "project export not wired by this deployment" });
      let id: string;
      try {
        id = decodeURIComponent(projectExportMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable id" });
      }
      const format = url.searchParams.get("format") ?? "jsonl";
      if (format !== "jsonl" && format !== "md") return sendJson(res, 400, { error: "format must be jsonl or md" });
      const bundle = await o.projectExport(id);
      if (!bundle) return sendJson(res, 404, { error: "project instance not found" });
      const body =
        format === "jsonl"
          ? [
              JSON.stringify({ type: "instance", value: bundle.instance }),
              JSON.stringify({ type: "template", value: bundle.template }),
              ...bundle.todos.map((t) => JSON.stringify({ type: "todo", value: t })),
              ...bundle.sessions.map((s) => JSON.stringify({ type: "session", value: s })),
              ...bundle.runs.map((r) => JSON.stringify({ type: "run", value: r })),
            ].join("\n") + "\n"
          : [
              `# Project export`,
              "",
              `- todos: ${bundle.todos.length}`,
              `- sessions: ${bundle.sessions.length}`,
              `- runs: ${bundle.runs.length}`,
              "",
              "```json",
              JSON.stringify(bundle.instance, null, 2),
              "```",
              "",
            ].join("\n");
      res.writeHead(200, {
        "content-type": format === "md" ? "text/markdown; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="agentos-project-${id}.${format}"`,
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    const dashboardMatch = /^\/api\/project-instances\/([^/]+)\/dashboard$/.exec(path);
    if (req.method === "GET" && dashboardMatch) {
      if (!o.projectDashboard) return sendJson(res, 501, { error: "project dashboard not wired by this deployment" });
      let id: string;
      try {
        id = decodeURIComponent(dashboardMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable id" });
      }
      const dashboard = await o.projectDashboard(id);
      if (!dashboard) return sendJson(res, 404, { error: "project instance not found" });
      return sendJson(res, 200, dashboard);
    }
    const instanceMatch = /^\/api\/project-instances\/([^/]+)$/.exec(path);
    if (instanceMatch && (req.method === "PATCH" || req.method === "DELETE")) {
      if (!o.projectInstances) return sendJson(res, 501, { error: "project instances not wired by this deployment" });
      let id: string;
      try {
        id = decodeURIComponent(instanceMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable id" });
      }
      if (req.method === "DELETE") {
        const removed = await o.projectInstances.remove(id);
        return sendJson(res, removed ? 200 : 404, { ok: removed });
      }
      const body = await readJson(req);
      if (!body) return sendJson(res, 400, { error: "body required" });
      // THE boundary (#390): instances may change their title only. Template
      // definition fields are config — attempting to set one is a 4xx, not a
      // silent ignore.
      const templateFields = ["template", "agents", "workflows", "tools", "knowledge", "description"];
      const attempted = templateFields.filter((f) => f in body);
      if (attempted.length > 0) {
        return sendJson(res, 400, {
          error: "template fields are configuration (edit the yml + git); an instance may only change its title",
          fields: attempted,
        });
      }
      if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 300) {
        return sendJson(res, 400, { error: "title is required (<=300 chars)" });
      }
      const renamed = await o.projectInstances.rename(id, body.title.trim());
      if (renamed === null) return sendJson(res, 404, { error: "project instance not found" });
      return sendJson(res, 200, { instance: renamed });
    }
    if (req.method === "GET" && path === "/api/notifications") {
      if (!o.notifications) return sendJson(res, 200, { notifications: [] });
      try {
        const notifications = await o.notifications();
        return sendJson(res, 200, { notifications: Array.isArray(notifications) ? notifications : [] });
      } catch {
        return sendJson(res, 200, { notifications: [] });
      }
    }
    if (req.method === "GET" && path === "/api/workflows") {
      if (!o.workflows) return sendJson(res, 501, { error: "workflow catalogue not wired by this deployment" });
      try {
        const workflows = await o.workflows();
        return sendJson(res, 200, { workflows: Array.isArray(workflows) ? workflows : [] });
      } catch {
        return sendJson(res, 200, { workflows: [] });
      }
    }
    const runsListMatch = /^\/api\/workflows\/([^/]+)\/runs$/.exec(path);
    if (req.method === "GET" && runsListMatch) {
      if (!o.workflowRuns) return sendJson(res, 501, { error: "workflow runs not wired by this deployment" });
      let name: string;
      try {
        name = decodeURIComponent(runsListMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable workflow name" });
      }
      try {
        const runs = await o.workflowRuns(name);
        return sendJson(res, 200, { runs: Array.isArray(runs) ? runs : [] });
      } catch {
        return sendJson(res, 200, { runs: [] });
      }
    }
    const runDetailMatch = /^\/api\/workflows\/runs\/([^/]+)$/.exec(path);
    if (req.method === "GET" && runDetailMatch) {
      if (!o.workflowRunDetail) return sendJson(res, 501, { error: "workflow run details not wired by this deployment" });
      let id: string;
      try {
        id = decodeURIComponent(runDetailMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable run id" });
      }
      const detail = await o.workflowRunDetail(id);
      if (!detail) return sendJson(res, 404, { error: "run not found" });
      return sendJson(res, 200, detail);
    }
    const runExportMatch = /^\/api\/workflows\/runs\/([^/]+)\/export$/.exec(path);
    if (req.method === "GET" && runExportMatch) {
      if (!o.workflowRunDetail) return sendJson(res, 501, { error: "workflow run details not wired by this deployment" });
      let id: string;
      try {
        id = decodeURIComponent(runExportMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable run id" });
      }
      const format = url.searchParams.get("format") ?? "jsonl";
      if (format !== "jsonl" && format !== "md") return sendJson(res, 400, { error: "format must be jsonl or md" });
      const detail = await o.workflowRunDetail(id);
      if (!detail) return sendJson(res, 404, { error: "run not found" });
      const steps = Array.isArray(detail.steps) ? detail.steps : [];
      const body =
        format === "jsonl"
          ? [JSON.stringify({ run: detail.run }), ...steps.map((s) => JSON.stringify({ step: s }))].join("\n") + "\n"
          : [
              `# Run ${detail.run.id} — ${detail.run.workflow}`,
              "",
              `- status: ${detail.run.status}`,
              `- trigger: ${detail.run.trigger}`,
              `- started: ${new Date(detail.run.startedAtMs).toISOString()}`,
              ...(detail.run.error ? [`- error: ${detail.run.error}`] : []),
              "",
              "| # | step | status | duration |",
              "|---|------|--------|----------|",
              ...steps.map((raw, i) => {
                const s = raw as { type?: string; status?: string; durationMs?: number; error?: string };
                return `| ${i + 1} | ${s.type ?? "?"} | ${s.status ?? "?"} | ${s.durationMs ?? 0}ms |`;
              }),
              "",
            ].join("\n");
      res.writeHead(200, {
        "content-type": format === "md" ? "text/markdown; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="agentos-run-${id}.${format}"`,
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    const runMatch = /^\/api\/workflows\/([^/]+)\/run$/.exec(path);
    if (req.method === "POST" && runMatch) {
      if (!o.runWorkflow) return sendJson(res, 501, { error: "workflow engine not wired by this deployment" });
      let name: string;
      try {
        name = decodeURIComponent(runMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable workflow name" });
      }
      if (name.length === 0 || name.length > 120) return sendJson(res, 400, { error: "invalid workflow name" });
      const body = await readJson(req);
      let resumeFrom: number | undefined;
      if (body?.resumeFrom !== undefined) {
        if (typeof body.resumeFrom !== "number" || !Number.isInteger(body.resumeFrom) || body.resumeFrom < 0) {
          return sendJson(res, 400, { error: "resumeFrom must be a non-negative integer" });
        }
        resumeFrom = body.resumeFrom;
      }
      try {
        const result = await o.runWorkflow(name, "manual", {
          ...(typeof body?.project === "string" ? { project: body.project } : {}),
          ...(resumeFrom !== undefined ? { resumeFrom } : {}),
        });
        if (!result.ok) return sendJson(res, 404, result);
        return sendJson(res, 200, result);
      } catch {
        return sendJson(res, 500, { ok: false, reason: "engine failure" });
      }
    }
    const hookMatch = /^\/api\/hooks\/([^/]+)$/.exec(path);
    if (req.method === "POST" && hookMatch) {
      if (!o.runWorkflow || !o.hookSecretFor) return sendJson(res, 501, { error: "webhook triggers not wired by this deployment" });
      let name: string;
      try {
        name = decodeURIComponent(hookMatch[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable workflow name" });
      }
      const secret = o.hookSecretFor(name);
      if (secret === undefined || secret.length === 0) return sendJson(res, 503, { error: "workflow has no webhook secret configured (secretEnv)" });
      const header = req.headers.authorization ?? "";
      const supplied = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
      const a = Buffer.from(supplied);
      const b = Buffer.from(secret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return sendJson(res, 401, { error: "invalid webhook secret" });
      const result = await o.runWorkflow(name, "webhook");
      if (!result.ok) return sendJson(res, 404, result);
      return sendJson(res, 202, result);
    }
    if (req.method === "GET" && path === "/api/agents") {
      if (!o.agents) return sendJson(res, 501, { error: "agent catalogue not wired by this deployment" });
      try {
        const agents = await o.agents();
        return sendJson(res, 200, { agents: Array.isArray(agents) ? agents : [] });
      } catch {
        return sendJson(res, 200, { agents: [] });
      }
    }
    if (req.method === "GET" && path === "/api/todos") {
      if (!o.todos) return sendJson(res, 501, { error: "todos not wired by this deployment" });
      const status = url.searchParams.get("status") ?? undefined;
      const project = url.searchParams.get("project") ?? undefined;
      const source = url.searchParams.get("source") ?? undefined;
      const q = url.searchParams.get("q") ?? undefined;
      if (q !== undefined && q.length > 200) return sendJson(res, 400, { error: "q must be at most 200 chars" });
      const dueRaw = url.searchParams.get("dueBefore");
      const dueBefore = dueRaw === null ? undefined : Number(dueRaw);
      if (dueBefore !== undefined && !Number.isFinite(dueBefore)) return sendJson(res, 400, { error: "dueBefore must be epoch ms" });
      try {
        const todos = await o.todos.list({ ...(status ? { status } : {}), ...(project ? { project } : {}), ...(dueBefore !== undefined ? { dueBefore } : {}), ...(q ? { q } : {}), ...(source ? { source } : {}) });
        return sendJson(res, 200, { todos, count: todos.length });
      } catch {
        return sendJson(res, 200, { todos: [], count: 0 });
      }
    }
    const todoExport = /^\/api\/todos\/export$/.exec(path);
    if (req.method === "GET" && todoExport) {
      if (!o.todos) return sendJson(res, 501, { error: "todos not wired by this deployment" });
      const format = url.searchParams.get("format") ?? "jsonl";
      if (format !== "jsonl" && format !== "md") return sendJson(res, 400, { error: "format must be jsonl or md" });
      const todos = await o.todos.list({});
      const body =
        format === "jsonl"
          ? todos.map((t) => JSON.stringify(t)).join("\n") + (todos.length ? "\n" : "")
          : ["# Todos", "", ...todos.map((t) => `- [${t.status === "done" ? "x" : " "}] ${t.title}${t.priority ? ` (${t.priority})` : ""}${t.dueAt ? ` due ${new Date(t.dueAt).toISOString().slice(0, 10)}` : ""}`), ""].join("\n");
      res.writeHead(200, {
        "content-type": format === "md" ? "text/markdown; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="agentos-todos.${format}"`,
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    if (req.method === "POST" && path === "/api/todos") {
      if (!o.todos) return sendJson(res, 501, { error: "todos not wired by this deployment" });
      const body = await readJson(req);
      if (!body || typeof body.title !== "string" || body.title.trim().length === 0) {
        return sendJson(res, 400, { error: "title is required" });
      }
      const ts = Date.now();
      const item: TodoItem = {
        id: randomUUID(),
        title: body.title.trim().slice(0, 300),
        status: "todo",
        ...(typeof body.project === "string" ? { project: body.project } : {}),
        ...(typeof body.priority === "string" ? { priority: body.priority as TodoItem["priority"] } : {}),
        ...(typeof body.dueAt === "number" ? { dueAt: body.dueAt } : {}),
        sourceKind: (typeof body.sourceKind === "string" ? body.sourceKind : "manual") as TodoItem["sourceKind"],
        ...(typeof body.sourceRef === "string" ? { sourceRef: body.sourceRef.slice(0, 500) } : {}),
        createdAt: ts,
        updatedAt: ts,
      };
      const checked = todoItemSchema.safeParse(item);
      if (!checked.success) return sendJson(res, 400, { error: "invalid todo", issues: checked.error.issues.map((i) => i.message) });
      const saved = await o.todos.write(checked.data);
      auditTodo(o, "todo.add", saved.id);
      entry.broadcast({ type: "todo.changed", payload: { action: "add", id: saved.id }, timestampMs: Date.now() });
      return sendJson(res, 201, { todo: saved });
    }
    const todoOne = /^\/api\/todos\/([^/]+)$/.exec(path);
    if (todoOne && (req.method === "PATCH" || req.method === "DELETE")) {
      if (!o.todos) return sendJson(res, 501, { error: "todos not wired by this deployment" });
      let id: string;
      try {
        id = decodeURIComponent(todoOne[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable id" });
      }
      if (id.length === 0 || id.length > 200) return sendJson(res, 400, { error: "invalid id" });
      if (req.method === "DELETE") {
        const removed = await o.todos.remove(id);
        if (removed) {
          auditTodo(o, "todo.remove", id);
          entry.broadcast({ type: "todo.changed", payload: { action: "remove", id }, timestampMs: Date.now() });
        }
        return sendJson(res, removed ? 200 : 404, { ok: removed });
      }
      const existing = (await o.todos.list({})).find((t) => t.id === id);
      if (!existing) return sendJson(res, 404, { error: "todo not found" });
      const body = await readJson(req);
      if (!body) return sendJson(res, 400, { error: "body required" });
      const next: TodoItem = {
        ...existing,
        ...(typeof body.title === "string" && body.title.trim().length > 0 ? { title: body.title.trim().slice(0, 300) } : {}),
        ...(typeof body.status === "string" ? { status: body.status as TodoItem["status"] } : {}),
        ...(typeof body.priority === "string" ? { priority: body.priority as TodoItem["priority"] } : {}),
        ...(typeof body.dueAt === "number" ? { dueAt: body.dueAt } : {}),
        ...(typeof body.project === "string" ? { project: body.project } : {}),
        updatedAt: Date.now(),
      };
      const checked = todoItemSchema.safeParse(next);
      if (!checked.success) return sendJson(res, 400, { error: "invalid todo", issues: checked.error.issues.map((i) => i.message) });
      const saved = await o.todos.write(checked.data);
      auditTodo(o, "todo.update", saved.id);
      entry.broadcast({ type: "todo.changed", payload: { action: "update", id: saved.id }, timestampMs: Date.now() });
      return sendJson(res, 200, { todo: saved });
    }
    if (req.method === "GET" && path === "/api/kb/drafts") {
      if (!o.kbDrafts) return sendJson(res, 501, { error: "kb drafts not wired by this deployment" });
      try {
        const drafts = await o.kbDrafts.list();
        return sendJson(res, 200, { drafts: Array.isArray(drafts) ? drafts : [] });
      } catch {
        return sendJson(res, 200, { drafts: [] });
      }
    }
    const draftAction = /^\/api\/kb\/drafts\/([^/]+)\/(commit|discard)$/.exec(path);
    if (req.method === "POST" && draftAction) {
      if (!o.kbDrafts) return sendJson(res, 501, { error: "kb drafts not wired by this deployment" });
      let receiptId: string;
      try {
        receiptId = decodeURIComponent(draftAction[1] ?? "");
      } catch {
        return sendJson(res, 400, { error: "undecodable receipt id" });
      }
      if (!/^[A-Za-z0-9-]{1,80}$/.test(receiptId)) return sendJson(res, 400, { error: "invalid receipt id" });
      const action = draftAction[2];
      try {
        const result = action === "commit" ? await o.kbDrafts.commit(receiptId) : await o.kbDrafts.discard(receiptId);
        return sendJson(res, result.ok ? 200 : 409, result);
      } catch {
        return sendJson(res, 500, { ok: false, reason: "unavailable" });
      }
    }
    if (req.method === "GET" && path === "/api/tools") {
      if (!o.listTools) return sendJson(res, 501, { error: "tool diagnostics not wired by this deployment" });
      try {
        const tools = await o.listTools();
        return sendJson(res, 200, { tools: Array.isArray(tools) ? tools : [] });
      } catch {
        return sendJson(res, 200, { tools: [] });
      }
    }
    if (req.method === "POST" && path === "/api/presets/validate") {
      // Input is judged before capability: a malformed request is a 400 on
      // any deployment; only a well-formed one can discover the 501.
      const body = await readJson(req);
      const target = body?.name;
      if (typeof target !== "string" || target.trim().length === 0 || target.length > 300) {
        return sendJson(res, 400, { error: "name must be a non-empty preset name or path (<= 300 chars)" });
      }
      if (!o.validatePreset) return sendJson(res, 501, { error: "preset validation not wired by this deployment" });
      try {
        const result = await o.validatePreset(target.trim());
        return sendJson(res, 200, { exitCode: result.exitCode, lines: result.lines });
      } catch {
        return sendJson(res, 200, { exitCode: 1, lines: ["✗ validator failed to run (see server output)"] });
      }
    }
    if (req.method === "GET" && path === "/api/presets") {
      if (!o.listPresets) return sendJson(res, 501, { error: "preset listing not wired by this deployment" });
      try {
        const presets = await o.listPresets();
        return sendJson(res, 200, { presets: Array.isArray(presets) ? presets : [] });
      } catch {
        return sendJson(res, 200, { presets: [] }); // unreadable config dir: empty list, never 500
      }
    }
    if (req.method === "GET" && path === "/api/escalations") {
      // History, not just a counter (spec #127/#294): newest N entries with
      // timestamp + reason. Metadata only (session id, reason string) — the
      // reason is whatever the caller posted, never conversation content (R2).
      const rawLines = url.searchParams.get("limit");
      const limit = rawLines === null ? 20 : Math.min(200, Math.max(1, Number(rawLines) || 20));
      let lines: string[] = [];
      if (existsSync(escalatePath)) lines = readFileSync(escalatePath, "utf8").split("\n").filter(Boolean);
      const recent = lines.slice(-limit).reverse().flatMap((line) => {
        try {
          const rec = JSON.parse(line) as { ts?: number; sessionId?: string; reason?: string | null };
          return [{ ts: rec.ts ?? null, sessionId: rec.sessionId ?? null, reason: rec.reason ?? null }];
        } catch {
          return [];
        }
      });
      return sendJson(res, 200, { count: lines.length, recent });
    }
    if (req.method === "POST" && path === "/api/escalate") {
      const body = await readJson(req);
      if (!body || typeof body.sessionId !== "string") return sendJson(res, 400, { error: "sessionId required" });
      mkdirSync(dirname(escalatePath), { recursive: true });
      appendFileSync(escalatePath, JSON.stringify({ ts: Date.now(), sessionId: body.sessionId, reason: body.reason ?? null }) + "\n", "utf8");
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && path === "/api/confirm") {
      const body = await readJson(req);
      if (!body || typeof body.requestId !== "string") return sendJson(res, 400, { error: "requestId required" });
      const ok = entry.settle(body.requestId, {
        approved: body.approved === true,
        decidedBy: `web-user:${body.approved === true ? "yes" : "no"}`,
        timestampMs: Date.now(),
      });
      return sendJson(res, ok ? 200 : 404, { ok });
    }
    if (req.method === "POST" && path === "/api/chat") {
      const body = await readJson(req);
      const sessionId = body?.sessionId;
      const message = body?.message;
      if (typeof sessionId !== "string" || sessionId.length === 0 || typeof message !== "string" || message.length === 0) {
        return sendJson(res, 400, { error: "sessionId and message are required strings" });
      }
      const externalKey = webExternalKey(sessionId);
      const modelOverride = typeof body?.model === "string" && body.model.length > 0 && body.model.length <= 120 ? body.model : undefined;
      const agent = typeof body?.agent === "string" && body.agent.length > 0 && body.agent.length <= 120 ? body.agent : undefined;
      const project = typeof body?.project === "string" && body.project.length > 0 && body.project.length <= 200 ? body.project : undefined;
      const binding = await entry.sessionFor(externalKey);
      const controller = new AbortController();
      const unregister = entry.registerTurn(externalKey, controller);
      const row: SessionRow | undefined = o.ledger.getByExternalKey(externalKey);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      // Turn lifecycle is ledger state, not memory state (spec #215): every
      // turn starts running and the sidebar reads the DB, so turns 2..N must
      // flip it back on — otherwise the row shows idle while work is happening.
      if (row) {
        o.ledger.markStatus(row.id, "running");
        if (project) {
          try {
            o.ledger.setProject(row.id, project);
          } catch {
            /* concurrent delete: the turn still runs */
          }
        }
        o.ledger.touch(row.id);
        // Role tag is session state (#340): hydrate and filtering both read it.
        if (agent) {
          try {
            o.ledger.setAgent(row.id, agent);
          } catch {
            /* concurrent delete: the turn still runs */
          }
        }
      }
      entry.addStream(externalKey, res);
      // Keepalive (spec #252): an SSE comment line keeps the socket warm
      // without inventing an event the reducer must understand.
      const heartbeat = setInterval(() => {
        try {
          res.write(`: keepalive ${Date.now()}\n\n`);
        } catch {
          /* dead socket: cleanup happens on close */
        }
      }, o.heartbeatMs ?? 15_000);
      heartbeat.unref?.();
      const stopHeartbeat = () => clearInterval(heartbeat);
      res.on("close", stopHeartbeat);
      const meta = JSON.stringify({
        type: "session.meta",
        payload: { agentSessionId: binding.agentSessionId, resumed: Boolean(row?.sdkSessionId) },
        timestampMs: Date.now(),
      });
      res.write(`data: ${meta}\n\n`);
      try {
        const out = await o.runner({
          prompt: message,
          signal: controller.signal,
          ...(modelOverride ? { modelOverride } : {}),
          ...(agent ? { agent } : {}),
          ...(project ? { project } : {}),
          externalKey,
          resumeSdkSessionId: row?.sdkSessionId ?? undefined,
          emit: (ev) => entry.renderFor(externalKey, [ev]),
          confirm: (partial) => entry.confirmFor(externalKey, { ...partial, requestId: randomUUID() }),
        });
        // Settle the row on EVERY completed turn, not only when the kernel
        // minted a session id — a turn without one still finished.
        if (row) {
          if (out.sdkSessionId) o.ledger.setSdkSessionId(row.id, out.sdkSessionId);
          o.ledger.markStatus(row.id, "idle");
          o.ledger.touch(row.id);
        }
      } catch (err) {
        const aborted = controller.signal.aborted;
        const kind = classifyTurnError(err, aborted);
        const frame = JSON.stringify({
          type: "result",
          payload: {
            subtype: kind,
            isError: true,
            message: aborted ? "aborted by user" : err instanceof Error ? err.message : String(err),
          },
          timestampMs: Date.now(),
        });
        try {
          res.write(`data: ${frame}\n\n`);
        } catch {
          /* client already gone */
        }
        if (row) {
          try {
            o.ledger.markStatus(row.id, aborted ? "aborted" : "error");
          } catch {
            /* deleted mid-turn (spec #217): the stream still terminates cleanly */
          }
        }
      } finally {
        unregister();
      }
      stopHeartbeat();
      res.end(); // stream closes after the result frame (runner's last emit or the error frame)
      return;
    }
    if (req.method === "GET") return serveStatic(res, path);
    return sendJson(res, 404, { error: "no such route" });
  }

  const bindHost = o.host ?? "127.0.0.1";
  await new Promise<void>((r) => server.listen(o.port, bindHost, r));
  const listened = server.address();
  const port = typeof listened === "object" && listened !== null ? listened.port : o.port;
  return {
    port,
    address: typeof listened === "object" && listened !== null ? listened.address : "127.0.0.1",
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((r, j) => {
        entry.settleAll("server-close");
        server.close((err) => (err ? j(err) : r()));
      }),
  };
}
