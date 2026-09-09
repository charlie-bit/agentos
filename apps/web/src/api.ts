/**
 * Hand-rolled API client: same-origin REST + SSE over fetch ReadableStream.
 * No eventsource lib, no axios — whitelist discipline.
 */
import type { RawFrame } from "./state";

const jget = async <T>(path: string): Promise<T> => (await fetch(path)).json() as Promise<T>;
const jpost = async <T>(path: string, body: unknown): Promise<T> =>
  (
    await fetch(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })
  ).json() as Promise<T>;

export interface StatusResponse {
  preset: string;
  model: { provider: string };
  mounts: Array<{ key: string; transport: string; degraded?: boolean }>;
  lastDrift: { missing: string[]; undeclared: string[] } | null;
  waitingConfirms: number;
}
export interface SessionsResponse {
  sessions: Array<{ id: string; external_key: string; status: string; preset: string; last_active_ms: number }>;
}

export const getStatus = () => jget<StatusResponse>("/api/status");
export const getSessions = () => jget<SessionsResponse>("/api/sessions");
export const getEscalations = () => jget<{ count: number }>("/api/escalations");
export const escalate = (sessionId: string, reason?: string) => jpost<{ ok: boolean }>("/api/escalate", { sessionId, reason });
export const answerConfirm = (requestId: string, approved: boolean) => jpost<{ ok: boolean }>("/api/confirm", { requestId, approved });

/** Stream one chat turn; onFrame receives every parsed SSE frame. */
export async function chat(sessionId: string, message: string, onFrame: (frame: RawFrame) => void): Promise<void> {
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
          onFrame(JSON.parse(line.slice(6)) as RawFrame);
        } catch {
          /* undecodable frame: skip, the stream survives */
        }
      }
    }
  }
}

/** Stable per-browser identity: uuid persisted in localStorage. */
export function sessionId(): string {
  const KEY = "agentos.web.session";
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable (private mode): fall through to a fresh uuid */
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
