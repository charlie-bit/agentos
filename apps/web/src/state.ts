/**
 * Single reducer for the console: one message timeline (user/assistant/tool/
 * note blocks), per-turn streaming state, the confirm modal slot, usage
 * accumulation, and the drift banner. No store library — by whitelist.
 */
export type Block =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming: boolean }
  | { kind: "tool"; name: string; input: string; status: "running" | "ok" | "error" }
  | { kind: "note"; tone: "info" | "warn" | "error"; text: string };

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
}

export interface ConsoleState {
  blocks: Block[];
  busy: boolean;
  noise: number;
  drift: { missing: string[]; undeclared: string[] } | null;
  usage: Usage;
  confirm: PendingConfirm | null;
  resumed: boolean;
}

export const initial: ConsoleState = {
  blocks: [],
  busy: false,
  noise: 0,
  drift: null,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  confirm: null,
  resumed: false,
};

export type Action =
  | { type: "send"; text: string }
  | { type: "frame"; frame: RawFrame }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "confirm_answered" };

export interface RawFrame {
  type: string;
  payload?: Record<string, unknown> & {
    text?: string;
    tool?: string;
    input?: unknown;
    isError?: boolean;
    message?: string;
    missing?: string[];
    undeclared?: string[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    } | null;
    totalCostUsd?: number | null;
    subtype?: string;
    agentSessionId?: string;
    resumed?: boolean;
    requestId?: string;
    prompt?: string;
    subject?: unknown;
  };
}

const lastAssistant = (blocks: Block[]): number => {
  for (let i = blocks.length - 1; i >= 0; i -= 1) if (blocks[i]?.kind === "assistant") return i;
  return -1;
};
const lastRunningTool = (blocks: Block[]): number => {
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i];
    if (b?.kind === "tool" && b.status === "running") return i;
  }
  return -1;
};

export function reducer(s: ConsoleState, a: Action): ConsoleState {
  switch (a.type) {
    case "send":
      return { ...s, busy: true, resumed: false, blocks: [...s.blocks, { kind: "user", text: a.text }] };
    case "turn_start":
      return { ...s, busy: true };
    case "turn_end":
      return { ...s, busy: false };
    case "confirm_answered":
      return { ...s, confirm: null };
    case "frame": {
      const f = a.frame;
      switch (f.type) {
        case "session.meta":
          return { ...s, resumed: f.payload?.resumed === true };
        case "assistant.text": {
          const idx = lastAssistant(s.blocks);
          const streamIdx = idx >= 0 && (s.blocks[idx] as { streaming?: boolean }).streaming === true ? idx : -1;
          if (streamIdx >= 0) {
            const blocks = [...s.blocks];
            const b = blocks[streamIdx];
            if (b?.kind === "assistant") blocks[streamIdx] = { ...b, text: b.text + String(f.payload?.text ?? "") };
            return { ...s, blocks };
          }
          return { ...s, blocks: [...s.blocks, { kind: "assistant", text: String(f.payload?.text ?? ""), streaming: true }] };
        }
        case "tool.call":
          return {
            ...s,
            blocks: [
              ...s.blocks.map((b) => (b.kind === "assistant" && b.streaming ? { ...b, streaming: false } : b)),
              { kind: "tool", name: String(f.payload?.tool ?? "?"), input: JSON.stringify(f.payload?.input ?? null).slice(0, 160), status: "running" },
            ],
          };
        case "tool.result": {
          const idx = lastRunningTool(s.blocks);
          if (idx < 0) return s;
          const blocks = [...s.blocks];
          const t = blocks[idx];
          if (t?.kind === "tool") blocks[idx] = { ...t, status: f.payload?.isError ? "error" : "ok" };
          return { ...s, blocks };
        }
        case "kernel.system.drift":
          return { ...s, drift: { missing: f.payload?.missing ?? [], undeclared: f.payload?.undeclared ?? [] } };
        case "confirm.request":
          return { ...s, confirm: { requestId: String(f.payload?.requestId ?? ""), prompt: String(f.payload?.prompt ?? ""), subject: f.payload?.subject ?? null } };
        case "result": {
          const u = f.payload?.usage;
          const usage: Usage = {
            input: s.usage.input + (u?.input_tokens ?? 0),
            output: s.usage.output + (u?.output_tokens ?? 0),
            cacheRead: s.usage.cacheRead + (u?.cache_read_input_tokens ?? 0),
            cacheWrite: s.usage.cacheWrite + (u?.cache_creation_input_tokens ?? 0),
            cost: s.usage.cost + (typeof f.payload?.totalCostUsd === "number" ? f.payload.totalCostUsd : 0),
          };
          const note =
            f.payload?.isError === true
              ? { kind: "note" as const, tone: "error" as const, text: `turn failed: ${String(f.payload?.subtype ?? "error")}` }
              : null;
          return { ...s, usage, busy: false, blocks: note ? [...s.blocks, note] : s.blocks };
        }
        default:
          return { ...s, noise: s.noise + 1 };
      }
    }
  }
}
