/**
 * Same-origin REST + SSE client, hand-rolled over fetch/ReadableStream.
 * The vocabulary is defined by @agentos/entry-rest (contract layer — this UI
 * is a shell swap, endpoints and frames are byte-identical to P5).
 */
import type { Frame, HistoryItem } from "./chat-reducer";

const jget = async <T>(path: string): Promise<T> => (await fetch(path)).json() as Promise<T>;
const jpost = async <T>(path: string, body: unknown): Promise<T> =>
  (await fetch(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })).json() as Promise<T>;

export interface StatusResponse {
  preset: string;
  /** baseUrlEnv/credentialsEnv are env-var NAMES — entry-rest never puts values on the wire. */
  model: { provider: string; baseUrlEnv?: string | null; credentialsEnv?: string | null };
  mounts: Array<{ key: string; transport: string; degraded?: boolean }>;
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
export const renameSession = async (id: string, title: string | null): Promise<{ ok: boolean; title: string | null }> =>
  (
    await fetch(`/api/sessions/${encodeURIComponent(id)}/title`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
      headers: { "content-type": "application/json" },
    })
  ).json() as Promise<{ ok: boolean; title: string | null }>;

/** Immediate, no-undo removal of a ledger row (does not touch kernel transcripts). */
export const deleteSession = async (id: string): Promise<{ ok: boolean }> =>
  (await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })).json() as Promise<{ ok: boolean }>;

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
    headers: { "content-type": "application/json" },
  });
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
