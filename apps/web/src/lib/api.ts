/**
 * Same-origin REST + SSE client, hand-rolled over fetch/ReadableStream.
 * The vocabulary is defined by @agentos/entry-rest (contract layer — this UI
 * is a shell swap, endpoints and frames are byte-identical to P5).
 */
import type { Frame, HistoryItem } from "./chat-reducer";

/** localStorage key for the local access token (spec #287). */
export const TOKEN_KEY = "agentos.web.token";

/**
 * The local access token, if the browser has one. `?token=` on the console
 * URL is captured once and stored; afterwards the header is attached to every
 * request. All storage access is guarded — a private window without site data
 * must still render (the server will simply answer 403).
 */
export function accessToken(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Persist a token the user typed into the gate. */
export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    /* storage blocked: the next request simply asks again */
  }
}

function authHeaders(base: Record<string, string>): Record<string, string> {
  const token = accessToken();
  return token ? { ...base, "x-agentos-token": token } : base;
}

/**
 * Non-2xx is a FAILURE, not a payload (spec #219): a 500 must reach the caller
 * as a reject so error cards / retry paths can act on it. The body is kept for
 * the caller's own display; it never contains conversation content (server
 * error bodies are generic).
 */
export class HttpError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${path} answered ${status}`);
    this.name = "HttpError";
  }
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: authHeaders((init?.headers as Record<string, string>) ?? {}) });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* unreadable body: the status is the fact */
    }
    throw new HttpError(path, res.status, detail);
  }
  return res.json() as Promise<T>;
}

const jget = <T>(path: string): Promise<T> => jsonFetch<T>(path);
const jpost = <T>(path: string, body: unknown): Promise<T> =>
  jsonFetch<T>(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

export interface StatusResponse {
  preset: string;
  /** baseUrlEnv/credentialsEnv are env-var NAMES — entry-rest never puts values on the wire. */
  model: { provider: string; baseUrlEnv?: string | null; credentialsEnv?: string | null };
  mounts: Array<{ key: string; transport: string; degraded?: boolean; manifestPath?: string }>;
  knowledge?: { name: string; manifestPath?: string | null; mountType?: string | null } | null;
  entry?: { name: string; confirm: boolean } | null;
  dialect?: string | null;
  lastDrift: { missing: string[]; undeclared: string[] } | null;
  waitingConfirms: number;
  systemPrompt: string | null;
}
export interface SessionRow {
  id: string;
  external_key: string;
  status: string;
  preset: string;
  last_active_ms: number;
  title: string | null;
}

/** Drift is per-session server-side (#218): name the session being viewed. */
export const getStatus = (browserSessionId?: string) =>
  jget<StatusResponse>(`/api/status${browserSessionId ? `?session=${encodeURIComponent(browserSessionId)}` : ""}`);
export const getSessions = () => jget<{ sessions: SessionRow[] }>("/api/sessions");
export interface EscalationEntry { ts: number | null; sessionId: string | null; reason: string | null }
export const getEscalations = (limit?: number) =>
  jget<{ count: number; recent?: EscalationEntry[] }>(`/api/escalations${limit ? `?limit=${limit}` : ""}`);
export interface ToolDescriptor {
  key: string;
  transport: string;
  manifestPath: string | null;
  allowedTools: string[] | null;
  idempotent: { default: boolean; overrides?: Record<string, boolean> } | null;
  mounted: boolean;
}
export const getTools = () => jget<{ tools: ToolDescriptor[] }>("/api/tools");
export const escalate = (sessionId: string, reason?: string) => jpost<{ ok: boolean }>("/api/escalate", { sessionId, reason });
export const answerConfirm = (requestId: string, approved: boolean) => jpost<{ ok: boolean }>("/api/confirm", { requestId, approved });

/** Rename (or, with title=null/"", clear) a session's ledger-side label. */
export const renameSession = (id: string, title: string | null): Promise<{ ok: boolean; title: string | null }> =>
  jsonFetch<{ ok: boolean; title: string | null }>(`/api/sessions/${encodeURIComponent(id)}/title`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
    headers: { "content-type": "application/json" },
  });

/** Stop the in-flight turn for this session (spec #255). */
export const abortSession = (sessionId: string): Promise<{ ok: boolean; aborted: number }> =>
  jpost<{ ok: boolean; aborted: number }>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {});

/** Immediate, no-undo removal of a ledger row (does not touch kernel transcripts). */
export const deleteSession = (id: string): Promise<{ ok: boolean }> =>
  jsonFetch<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });

/**
 * Past turns for a session (read-only). The server answers 200 + [] for every
 * "nothing to show" case — no pointer, no stored transcript, unreadable store —
 * so a caller never has to distinguish "empty history" from "failed request".
 */
export const getMessages = (sessionId: string) =>
  jget<{ entries: HistoryItem[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);

/** One chat turn: consume the SSE response frame by frame. */
export async function chat(
  sessionId: string,
  message: string,
  onFrame: (frame: Frame) => void,
  opts?: { agent?: string; project?: string },
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, message, ...(opts ?? {}) }),
    headers: authHeaders({ "content-type": "application/json" }),
  });
  if (!res.ok) throw new HttpError("/api/chat", res.status, (await res.text()).slice(0, 500));
  if (!res.body) throw new Error("no response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let split: number;
    while ((split = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, split);
      buf = buf.slice(split + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        try {
          onFrame(JSON.parse(line.slice(6)) as Frame);
        } catch {
          /* undecodable frame: skip, stream survives (entry-rest renders the same rule) */
        }
      }
    }
  }
}

/** KB draft inbox (spec #270–#272). */
export interface KbDraft { receiptId: string; pageId: string; title: string; preview: string; createdAtMs: number | null }
export const getKbDrafts = (sessionId: string) =>
  jget<{ drafts: KbDraft[] }>(`/api/kb/drafts?session=${encodeURIComponent(sessionId)}`);
export const commitKbDraft = (receiptId: string) =>
  jpost<{ ok: boolean; reason?: string }>(`/api/kb/drafts/${encodeURIComponent(receiptId)}/commit`, {});
export const discardKbDraft = (receiptId: string) =>
  jpost<{ ok: boolean }>(`/api/kb/drafts/${encodeURIComponent(receiptId)}/discard`, {});

/** Projects (spec #398–#405). */
export interface ProjectTemplate { name: string; description?: string; agents?: string[]; workflows?: string[]; tools?: string[]; knowledge?: string[]; manifestPath: string | null }
export interface ProjectInstance { id: string; template: string; title: string; createdAtMs: number; updatedAtMs: number }
export interface ProjectDashboard {
  instance: ProjectInstance;
  template: { name: string; agents: string[]; workflows: string[] } | null;
  todos: { total: number; todo: number; doing: number; blocked: number; done: number };
  sessions: Array<{ id: string; externalKey: string; agent: string | null; status: string; lastActiveMs: number; title: string | null }>;
  runs: Array<{ id: string; workflow: string; status: string; startedAtMs: number; endedAtMs: number | null }>;
}
export const getProjectTemplates = () => jget<{ templates: ProjectTemplate[] }>("/api/project-templates");
export const getProjectInstances = () => jget<{ instances: ProjectInstance[] }>("/api/project-instances");
export const createProjectInstance = (template: string, title: string) =>
  jpost<{ instance: ProjectInstance }>("/api/project-instances", { template, title });
export const deleteProjectInstance = (id: string) =>
  jsonFetch<{ ok: boolean }>(`/api/project-instances/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getProjectDashboard = (id: string) =>
  jget<ProjectDashboard>(`/api/project-instances/${encodeURIComponent(id)}/dashboard`);

/** Notification feed (spec #386/#427): metadata only. */
export interface Notification { kind: string; title: string; ref?: string; ts?: number }
export const getNotifications = () => jget<{ notifications: Notification[] }>("/api/notifications");

/** Workflow surfaces (spec #372–#381). */
export interface WorkflowSummary {
  name: string;
  description?: string;
  trigger: "manual" | "schedule" | "webhook";
  stepCount: number;
  steps?: string[];
  manifestPath: string | null;
  nextRun?: string | null;
  missed?: number;
}
export interface WorkflowRun {
  id: string;
  workflow: string;
  status: "pending" | "running" | "done" | "error" | "aborted";
  trigger: string;
  project?: string | null;
  startedAtMs: number;
  endedAtMs?: number | null;
  resumeFrom?: number | null;
  error?: string | null;
  sessionKey?: string | null;
}
export const getWorkflows = () => jget<{ workflows: WorkflowSummary[] }>("/api/workflows");
export const getWorkflowRuns = (name: string) => jget<{ runs: WorkflowRun[] }>(`/api/workflows/${encodeURIComponent(name)}/runs`);
export interface WorkflowStepOutcome { index: number; type: string; status: "ok" | "error" | "denied" | "skipped"; durationMs: number; error?: string }
export const getWorkflowRun = (id: string) =>
  jget<{ run: WorkflowRun; steps: WorkflowStepOutcome[] }>(`/api/workflows/runs/${encodeURIComponent(id)}`);
export const runWorkflow = (name: string, resumeFrom?: number, project?: string) =>
  jpost<{ ok: boolean; runId?: string; reason?: string }>(`/api/workflows/${encodeURIComponent(name)}/run`, {
    ...(resumeFrom !== undefined ? { resumeFrom } : {}),
    ...(project !== undefined ? { project } : {}),
  });

/** Usage aggregate (spec #291/#349): metadata only, grouped per provider/model/agent. */
export interface UsageRow { provider: string; model: string; agent?: string; turns: number; input: number; output: number; costUsd: number }
export const getUsage = (sessionId?: string) =>
  jget<{ rows: UsageRow[]; totals: { turns: number; input: number; output: number; costUsd: number } }>(
    `/api/usage${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`,
  );

/** Role catalogue (spec #342/#343). */
export interface AgentInfo {
  name: string;
  baseAgent?: string;
  chain: string[];
  promptPreview: string;
  tools: string[];
  knowledge?: string;
  model?: string;
  manifestPath: string | null;
}
export const getAgents = () => jget<{ agents: AgentInfo[] }>("/api/agents");

/** Todo data plane (spec #319/#320). */
export interface Todo {
  id: string;
  project?: string;
  title: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority?: "P0" | "P1" | "P2";
  dueAt?: number;
  sourceKind: "chat" | "mcp" | "manual";
  sourceRef?: string;
  createdAt: number;
  updatedAt: number;
}
export const getTodos = (q?: { status?: string; q?: string }) => {
  const p = new URLSearchParams();
  if (q?.status) p.set("status", q.status);
  if (q?.q) p.set("q", q.q);
  const s = p.toString();
  return jget<{ todos: Todo[]; count: number }>(`/api/todos${s ? `?${s}` : ""}`);
};
export const addTodo = (title: string) => jpost<{ todo: Todo }>("/api/todos", { title });
export const patchTodo = (id: string, patch: Partial<Pick<Todo, "title" | "status" | "priority" | "dueAt" | "project">>) =>
  jsonFetch<{ todo: Todo }>(`/api/todos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "content-type": "application/json" },
  });
export const deleteTodo = (id: string) => jsonFetch<{ ok: boolean }>(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Operational log tail (spec #124/#292). */
export interface LogFile { name: string; lines: string[] }
export const getLogs = (lines = 100) => jget<{ files: LogFile[] }>(`/api/logs?lines=${lines}`);

/** Session workspace listing/reading (spec #105/#256/#257/#275). */
export interface WorkspaceFile { path: string; size: number; mtimeMs: number }
export const getWorkspaceFiles = (sessionId: string) =>
  jget<{ files: WorkspaceFile[]; limit: number }>(`/api/workspace/files?session=${encodeURIComponent(sessionId)}`);
export const readWorkspaceFile = (sessionId: string, path: string) =>
  jget<{ path: string; size: number; content: string; truncated: boolean }>(
    `/api/workspace/file?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`,
  );

/** Download URLs (browser-native navigation, token included) — spec #106/#107/#261. */
export const exportUrl = (sessionId: string, format: "jsonl" | "md") =>
  `/api/sessions/${encodeURIComponent(sessionId)}/export?format=${format}${accessToken() ? `&token=${encodeURIComponent(accessToken() as string)}` : ""}`;

export const exportSessions = async (ids: string[]): Promise<Blob> => {
  const res = await fetch("/api/sessions/export", {
    method: "POST",
    body: JSON.stringify({ ids }),
    headers: authHeaders({ "content-type": "application/json" }),
  });
  if (!res.ok) throw new HttpError("/api/sessions/export", res.status, (await res.text()).slice(0, 300));
  return res.blob();
};

/** Attachment upload (spec #276): raw body + filename header, size-capped server-side. */
export const uploadAttachment = async (sessionId: string, file: File): Promise<{ path: string; size: number }> => {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/attachments`, {
    method: "POST",
    body: file,
    headers: authHeaders({ "x-filename": encodeURIComponent(file.name), "content-type": "application/octet-stream" }),
  });
  if (!res.ok) throw new HttpError("/api/sessions/attachments", res.status, (await res.text()).slice(0, 300));
  return (await res.json()) as { path: string; size: number };
};

/** localStorage key for the browser identity (shared, never re-spelled elsewhere). */
export const SESSION_KEY = "agentos.web.session";

/** Browser identity: uuid persisted in localStorage (server maps it to the ledger row). */
export function sessionId(): string {
  const KEY = SESSION_KEY;
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* private mode: ephemeral identity per tab load */
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* best effort */
    }
  }
  return id;
}
