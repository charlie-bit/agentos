/**
 * The console's state machine — a pure reducer over the entry-rest SSE
 * vocabulary (session.meta / assistant.text / tool.call / tool.result /
 * kernel.system.* noise / kernel.system.drift / confirm.request / result).
 *
 * Invariants asserted by chat-reducer.spec:
 * - streaming assistant text APPENDS to one entry (no list rebuild per frame)
 * - kernel.system.* frames never create chat entries: they bump a single
 *   open "thinking" aggregate line (closed when real content arrives)
 * - tool blocks are lifecycle entries: running -> ok | error
 * - result frames fold usage into the running total and close open blocks;
 *   an errored result marks the open assistant message as error
 * - confirm.request occupies the single pending-confirm slot; any result
 *   (turn over) releases it
 * The reducer knows nothing about fetch, localStorage, or React.
 */

export type Conn = "idle" | "connecting" | "streaming";

export type Entry =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; status: "streaming" | "done" | "error" }
  | { kind: "tool"; id: string; name: string; input: string; status: "running" | "ok" | "error" }
  | { kind: "thinking"; id: string; count: number; open: boolean }
  | { kind: "drift"; id: string; missing: string[]; undeclared: string[] };

/**
 * One history item as served by GET /api/sessions/:id/messages — the wire form
 * of the neutral TranscriptEntry. Declared here rather than imported so the
 * reducer keeps its "knows nothing about fetch" property.
 */
export interface HistoryItem {
  role: "user" | "assistant" | "tool";
  text: string;
  toolName?: string;
  isError?: boolean;
  timestampMs?: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface PendingConfirm {
  requestId: string;
  prompt: string;
  subject: unknown;
  openedAtMs: number;
}

export interface Frame {
  type: string;
  payload?: {
    text?: string;
    tool?: string;
    input?: unknown;
    isError?: boolean;
    message?: string;
    missing?: string[];
    undeclared?: string[];
    subtype?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    } | null;
    totalCostUsd?: number | null;
    agentSessionId?: string;
    resumed?: boolean;
    requestId?: string;
    prompt?: string;
    subject?: unknown;
    /** session.init / session.meta attribution fields (④a display layer). */
    model?: string;
    /** tool.denied frame (④a execution gate): why the call was refused. */
    reason?: string;
  } | null;
}

export interface State {
  entries: Entry[];
  conn: Conn;
  usage: Usage;
  turns: number;
  pending: PendingConfirm | null;
  resumed: boolean;
  seq: number;
  /**
   * Short model name from the session.init frame (D-0910-6 tier-2: events
   * carry the short name only). Attribution display (④a): the user may see
   * WHAT answered, never the gateway/route/window suffix of the full id.
   * Absent until the first init frame of a live turn arrives.
   */
  modelShort: string | null;
}

export type Action =
  | { t: "send"; text: string }
  | { t: "stream_start" }
  | { t: "stream_end" }
  | { t: "frame"; frame: Frame }
  | { t: "confirm_resolved" }
  | { t: "session_switched" }
  | { t: "hydrate"; items: HistoryItem[] };

export const initialState: State = {
  entries: [],
  conn: "idle",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  turns: 0,
  pending: null,
  resumed: false,
  seq: 0,
  modelShort: null,
};

/* helpers ------------------------------------------------------------------ */

const isNoise = (type: string): boolean => type.startsWith("kernel.system.") && type !== "kernel.system.drift";

function closeOpen(s: State): Entry[] {
  return s.entries.map((e) =>
    e.kind === "thinking" && e.open
      ? { ...e, open: false }
      : e.kind === "assistant" && e.status === "streaming"
        ? { ...e, status: "done" as const }
        : e,
  );
}

/* reducer ------------------------------------------------------------------ */

export function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "send": {
      const id = `e${s.seq}`;
      return { ...s, seq: s.seq + 1, entries: [...s.entries, { kind: "user", id, text: a.text }] };
    }
    case "stream_start":
      return { ...s, conn: "connecting" };
    case "stream_end": {
      // server closed the stream without a result frame (transport error):
      // don't strand open blocks.
      const entries = s.entries.map((e) =>
        e.kind === "assistant" && e.status === "streaming" ? { ...e, status: "error" as const } : e.kind === "thinking" ? { ...e, open: false } : e,
      );
      return { ...s, conn: "idle", entries };
    }
    case "confirm_resolved":
      return { ...s, pending: null };
    case "session_switched":
      return { ...initialState };
    /**
     * Replay past turns after a reload or a session switch (P5.1). Every
     * hydrated entry lands in a TERMINAL state — history is finished by
     * definition, so nothing may render as streaming or running. Ids carry an
     * "h" prefix so they can never collide with the live "e" sequence, which is
     * why seq is left untouched. Two guards: an in-flight turn is never
     * clobbered (a late history response must not eat live text), and an empty
     * history is a no-op rather than a state reset.
     */
    case "hydrate": {
      if (s.conn !== "idle" || a.items.length === 0) return s;
      const entries: Entry[] = a.items.map((h, i) => {
        const id = `h${i}`;
        if (h.role === "tool") {
          return { kind: "tool", id, name: h.toolName ?? "?", input: h.text, status: h.isError === true ? "error" : "ok" };
        }
        if (h.role === "assistant") return { kind: "assistant", id, text: h.text, status: "done" };
        return { kind: "user", id, text: h.text };
      });
      return { ...s, entries };
    }
    case "frame": {
      const f = a.frame;
      const p = f.payload ?? {};
      switch (f.type) {
        case "session.meta":
          return { ...s, conn: "streaming", resumed: p.resumed === true };
        /**
         * Attribution capture (④a): the init frame already carries the SHORT
         * model name (D-0910-6 tier-2 — the adapter reduces the id before it
         * ever reaches the stream). We only store it; the full id never exists
         * on this side of the wire, so the display layer cannot leak it.
         */
        case "session.init": {
          const modelShort = typeof p.model === "string" && p.model.length > 0 ? p.model : s.modelShort;
          return { ...s, conn: "streaming", modelShort };
        }
        case "assistant.text": {
          const last = s.entries[s.entries.length - 1];
          if (last?.kind === "assistant" && last.status === "streaming") {
            const merged = { ...last, text: last.text + String(p.text ?? "") };
            return { ...s, conn: "streaming", entries: [...s.entries.slice(0, -1), merged] };
          }
          const closed = closeOpen(s);
          const id = `e${s.seq}`;
          return {
            ...s,
            seq: s.seq + 1,
            conn: "streaming",
            entries: [...closed, { kind: "assistant", id, text: String(p.text ?? ""), status: "streaming" }],
          };
        }
        case "tool.call": {
          const closed = closeOpen(s);
          const id = `e${s.seq}`;
          return {
            ...s,
            seq: s.seq + 1,
            conn: "streaming",
            entries: [
              ...closed,
              {
                kind: "tool",
                id,
                name: String(p.tool ?? "?"),
                input: JSON.stringify(p.input ?? null).slice(0, 400),
                status: "running",
              },
            ],
          };
        }
        case "tool.result": {
          for (let i = s.entries.length - 1; i >= 0; i -= 1) {
            const e = s.entries[i];
            if (e?.kind === "tool" && e.status === "running") {
              const entries = [...s.entries];
              entries[i] = { ...e, status: p.isError ? "error" : "ok" };
              return { ...s, entries };
            }
          }
          return s; // result for nothing running: ignore, never corrupt
        }
        /**
         * Execution-side hard gate (④a): the kernel DENIED a call outside the
         * mounted menu. Rendered as a failed tool block so the refusal is
         * visible in the conversation, not swallowed.
         */
        case "tool.denied": {
          const closed = closeOpen(s);
          const id = `e${s.seq}`;
          return {
            ...s,
            seq: s.seq + 1,
            entries: [
              ...closed,
              { kind: "tool", id, name: String(p.tool ?? "?"), input: String(p.reason ?? "denied"), status: "error" as const },
            ],
          };
        }
        case "kernel.system.drift": {
          const closed = closeOpen(s);
          const id = `e${s.seq}`;
          return {
            ...s,
            seq: s.seq + 1,
            entries: [...closed, { kind: "drift", id, missing: p.missing ?? [], undeclared: p.undeclared ?? [] }],
          };
        }
        case "confirm.request": {
          const id = String(p.requestId ?? "");
          if (id === "") return s;
          return { ...s, pending: { requestId: id, prompt: String(p.prompt ?? ""), subject: p.subject ?? null, openedAtMs: Date.now() } };
        }
        case "result": {
          let entries = closeOpen(s);
          if (p.isError === true) {
            const last = entries[entries.length - 1];
            entries =
              last?.kind === "assistant"
                ? [...entries.slice(0, -1), { ...last, status: "error" as const }]
                : entries;
          }
          const u = p.usage;
          return {
            ...s,
            entries,
            conn: "idle",
            turns: s.turns + 1,
            pending: null, // turn over: nothing left to confirm
            usage: {
              input: s.usage.input + (u?.input_tokens ?? 0),
              output: s.usage.output + (u?.output_tokens ?? 0),
              cacheRead: s.usage.cacheRead + (u?.cache_read_input_tokens ?? 0),
              cacheWrite: s.usage.cacheWrite + (u?.cache_creation_input_tokens ?? 0),
              cost: s.usage.cost + (typeof p.totalCostUsd === "number" ? p.totalCostUsd : 0),
            },
          };
        }
        default: {
          if (!isNoise(f.type)) return s; // truly unknown vocabulary: ignore, visible via --future work
          const last = s.entries[s.entries.length - 1];
          if (last?.kind === "thinking" && last.open) {
            const merged = { ...last, count: last.count + 1 };
            return { ...s, entries: [...s.entries.slice(0, -1), merged] };
          }
          const closed = closeOpen(s);
          const id = `e${s.seq}`;
          return { ...s, seq: s.seq + 1, entries: [...closed, { kind: "thinking", id, count: 1, open: true }] };
        }
      }
    }
  }
}
