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
export const getEscalations = () => jget<{ count: number }>("/api/escalations");
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
export async function chat(sessionId: string, message: string, onFrame: (frame: Frame) => void): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, message }),
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
