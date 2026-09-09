/**
 * Same-origin REST + SSE client, hand-rolled over fetch/ReadableStream.
 * The vocabulary is defined by @agentos/entry-rest (contract layer — this UI
 * is a shell swap, endpoints and frames are byte-identical to P5).
 */
import type { Frame } from "./chat-reducer";

const jget = async <T>(path: string): Promise<T> => (await fetch(path)).json() as Promise<T>;
const jpost = async <T>(path: string, body: unknown): Promise<T> =>
  (await fetch(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })).json() as Promise<T>;

export interface StatusResponse {
  preset: string;
  model: { provider: string };
  mounts: Array<{ key: string; transport: string; degraded?: boolean }>;
  lastDrift: { missing: string[]; undeclared: string[] } | null;
  waitingConfirms: number;
}
export interface SessionRow {
  id: string;
  external_key: string;
  status: string;
  preset: string;
  last_active_ms: number;
}

export const getStatus = () => jget<StatusResponse>("/api/status");
export const getSessions = () => jget<{ sessions: SessionRow[] }>("/api/sessions");
export const getEscalations = () => jget<{ count: number }>("/api/escalations");
export const escalate = (sessionId: string, reason?: string) => jpost<{ ok: boolean }>("/api/escalate", { sessionId, reason });
export const answerConfirm = (requestId: string, approved: boolean) => jpost<{ ok: boolean }>("/api/confirm", { requestId, approved });

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

/** Browser identity: uuid persisted in localStorage (server maps it to the ledger row). */
export function sessionId(): string {
  const KEY = "agentos.web.session";
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
