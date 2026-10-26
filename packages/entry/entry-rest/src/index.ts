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
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { userInfo } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  ConfirmRequest,
  ConfirmResult,
  EntryAdapter,
  RenderEvent,
  SessionBinding,
  TenantRef,
  TranscriptEntry,
} from "@agentos/contracts";
import { isWebExternalKey, webExternalKey } from "@agentos/contracts/session-key";
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
  /** Ledger externalKey for this browser session ("web-<id>"). */
  externalKey: string;
  resumeSdkSessionId?: string;
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
  mounts: Array<{ key: string; transport: string; degraded?: boolean }>;
  runner: TurnRunner;
  ledger: Ledger;
  /** 0 = ephemeral port (tests). */
  port: number;
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

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    if (req.method === "GET" && path === "/healthz") return sendJson(res, 200, { ok: true });
    if (req.method === "GET" && path === "/api/status") {
      return sendJson(res, 200, {
        preset: o.presetName,
        model: { provider: o.model.provider, baseUrlEnv: o.model.baseUrlEnv ?? null, credentialsEnv: o.model.credentialsEnv ?? null },
        mounts: o.mounts,
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
      if (!existsSync(o.dbPath)) return sendJson(res, 200, { sessions: [], limit, offset, total: 0, hasMore: false });
      const db = new DatabaseSync(o.dbPath, { readOnly: true });
      try {
        const rows = db
          .prepare(
            "SELECT id, external_key, status, preset, last_active_ms, title FROM sessions ORDER BY last_active_ms DESC, id DESC LIMIT ? OFFSET ?",
          )
          .all(limit, offset) as Array<Record<string, unknown>>;
        const totalRow = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number | bigint } | undefined;
        const total = Number(totalRow?.n ?? 0);
        return sendJson(res, 200, { sessions: rows, limit, offset, total, hasMore: offset + rows.length < total });
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
    const deleteMatch = /^\/api\/sessions\/([^/]+)$/.exec(path);
    if (req.method === "DELETE" && deleteMatch) {
      const id = decodeURIComponent(deleteMatch[1] ?? "");
      try {
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
      let count = 0;
      if (existsSync(escalatePath)) count = readFileSync(escalatePath, "utf8").split("\n").filter(Boolean).length;
      return sendJson(res, 200, { count });
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
      const binding = await entry.sessionFor(externalKey);
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
        o.ledger.touch(row.id);
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
        const frame = JSON.stringify({
          type: "result",
          payload: { subtype: "error", isError: true, message: err instanceof Error ? err.message : String(err) },
          timestampMs: Date.now(),
        });
        res.write(`data: ${frame}\n\n`);
        if (row) o.ledger.markStatus(row.id, "error");
      }
      stopHeartbeat();
      res.end(); // stream closes after the result frame (runner's last emit or the error frame)
      return;
    }
    if (req.method === "GET") return serveStatic(res, path);
    return sendJson(res, 404, { error: "no such route" });
  }

  await new Promise<void>((r) => server.listen(o.port, "127.0.0.1", r));
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
