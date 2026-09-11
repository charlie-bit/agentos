/**
 * Reducer state-machine tests: mock the entry-rest SSE sequence, assert
 * every transition the console relies on. No DOM, no network — the reducer
 * is pure, so these are the contract's client-side mirror.
 */
import { describe, expect, it } from "vitest";
import { initialState, reduce, type Action, type Frame, type State } from "./chat-reducer";

const run = (s: State, actions: Action[]): State => actions.reduce((acc, a) => reduce(acc, a), s);
const frame = (type: string, payload?: Frame["payload"]): Action => ({ t: "frame", frame: { type, payload } });

const assistant = (s: State) => s.entries.filter((e) => e.kind === "assistant");
const tools = (s: State) => s.entries.filter((e) => e.kind === "tool");
const thinking = (s: State) => s.entries.filter((e) => e.kind === "thinking");

describe("turn lifecycle", () => {
  it("send appends exactly one user entry", () => {
    const s = reduce(initialState, { t: "send", text: "hello" });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]?.kind).toBe("user");
  });

  it("stream_start marks connecting; session.meta marks streaming", () => {
    const s = run(initialState, [{ t: "stream_start" }, frame("session.meta", { resumed: true })]);
    expect(s.conn).toBe("streaming");
    expect(s.resumed).toBe(true);
  });

  it("assistant.text frames APPEND to one streaming entry (no per-frame rebuild)", () => {
    const s = run(initialState, [
      frame("assistant.text", { text: "The " }),
      frame("assistant.text", { text: "answer " }),
      frame("assistant.text", { text: "is 42." }),
    ]);
    expect(assistant(s)).toHaveLength(1);
    expect(assistant(s)[0]).toMatchObject({ kind: "assistant", status: "streaming" });
    expect((assistant(s)[0] as { text: string }).text).toBe("The answer is 42.");
  });
});

describe("tool block lifecycle", () => {
  it("tool.call closes the open assistant and starts a running block; tool.result lands on it", () => {
    const s = run(initialState, [
      frame("assistant.text", { text: "reading now" }),
      frame("tool.call", { tool: "mcp__fs__read_file", input: { path: "/x" } }),
      frame("tool.result", { isError: false }),
    ]);
    expect(assistant(s)[0]).toMatchObject({ status: "done" });
    expect(tools(s)).toHaveLength(1);
    expect(tools(s)[0]).toMatchObject({ kind: "tool", status: "ok" });
  });

  it("error result flips the block to error; a result with no open block is ignored", () => {
    const s = run(initialState, [frame("tool.call", { tool: "t", input: null }), frame("tool.result", { isError: true })]);
    expect(tools(s)[0]).toMatchObject({ status: "error" });
    expect(reduce(s, frame("tool.result", { isError: false })).entries).toEqual(s.entries);
  });

  it("text after a tool opens a NEW assistant entry (turn segments are separate)", () => {
    const s = run(initialState, [
      frame("assistant.text", { text: "before" }),
      frame("tool.call", { tool: "t", input: {} }),
      frame("tool.result", { isError: false }),
      frame("assistant.text", { text: "after" }),
    ]);
    expect(assistant(s).map((a) => (a as { text: string }).text)).toEqual(["before", "after"]);
  });
});

describe("thinking aggregation", () => {
  it("N noise frames become ONE open thinking line, never N entries", () => {
    const frames: Action[] = Array.from({ length: 40 }, () => frame("kernel.system.thinking_tokens", {}));
    const s = run(initialState, frames);
    expect(s.entries).toHaveLength(1);
    expect(thinking(s)[0]).toMatchObject({ kind: "thinking", count: 40, open: true });
  });

  it("real content closes the line; later noise reopens a fresh one", () => {
    const s = run(initialState, [
      frame("kernel.system.thinking_tokens", {}),
      frame("assistant.text", { text: "hi" }),
      frame("kernel.system.hook_response", {}),
    ]);
    const closed = s.entries.find((e) => e.kind === "thinking" && e.open === false && e.count === 1);
    const open = thinking(s).filter((e) => e.open);
    expect(closed).toBeDefined();
    expect(open).toHaveLength(1);
  });
});

describe("drift, confirm, result", () => {
  it("drift frame becomes its own loud entry and closes open blocks", () => {
    const s = run(initialState, [frame("kernel.system.thinking_tokens", {}), frame("kernel.system.drift", { missing: ["a"], undeclared: ["b"] })]);
    const d = s.entries.at(-1);
    expect(d).toMatchObject({ kind: "drift", missing: ["a"], undeclared: ["b"] });
    expect(thinking(s)[0]).toMatchObject({ open: false });
  });

  it("confirm.request occupies the pending slot; result releases it and folds usage", () => {
    const s = run(initialState, [
      frame("confirm.request", { requestId: "r-9", prompt: "Commit?", subject: { page: "p" } }),
      frame("assistant.text", { text: "done: " }),
      frame("result", {
        subtype: "success",
        isError: false,
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 },
        totalCostUsd: 0.01,
      }),
    ]);
    expect(s.pending).toBeNull();
    expect(s.usage).toEqual({ input: 10, output: 5, cacheRead: 100, cacheWrite: 0, cost: 0.01 });
    expect(s.turns).toBe(1);
    expect(assistant(s)[0]).toMatchObject({ status: "done" });
  });

  it("confirm frames before resolution keep the pending; frame with empty requestId is dropped", () => {
    expect(reduce(initialState, frame("confirm.request", { requestId: "", prompt: "x" })).pending).toBeNull();
    const withPending = reduce(initialState, frame("confirm.request", { requestId: "r1", prompt: "go" }));
    expect(withPending.pending?.requestId).toBe("r1");
    expect(reduce(withPending, { t: "confirm_resolved" }).pending).toBeNull();
  });

  it("errored result marks the streaming assistant as error", () => {
    const s = run(initialState, [frame("assistant.text", { text: "half a thought" }), frame("result", { subtype: "error_during_execution", isError: true })]);
    expect(assistant(s)[0]).toMatchObject({ status: "error" });
  });

  it("stream_end without result (transport break) closes dangling streaming state", () => {
    const s = run(initialState, [frame("assistant.text", { text: "cut off" }), { t: "stream_end" }]);
    expect(assistant(s)[0]).toMatchObject({ status: "error" });
    expect(s.conn).toBe("idle");
  });

  it("session_switched resets to a pristine state", () => {
    const busy = run(initialState, [frame("assistant.text", { text: "old session" }), frame("result", { isError: false })]);
    expect(reduce(busy, { t: "session_switched" })).toEqual(initialState);
  });
});

describe("history hydration (P5.1 replay)", () => {
  const history: Action = {
    t: "hydrate",
    items: [
      { role: "user", text: "read the map" },
      { role: "tool", text: '{"path":"a.md"}', toolName: "read_file" },
      { role: "assistant", text: "here it is" },
    ],
  };

  it("replays items in order, every entry in a TERMINAL state", () => {
    const s = reduce(initialState, history);
    expect(s.entries.map((e) => e.kind)).toEqual(["user", "tool", "assistant"]);
    expect(assistant(s)[0]?.status).toBe("done");
    expect(tools(s)[0]?.status).toBe("ok");
    expect(tools(s)[0]?.name).toBe("read_file");
    expect(s.conn).toBe("idle");
  });

  it("a failed historical tool call replays as error, not ok", () => {
    const s = reduce(initialState, { t: "hydrate", items: [{ role: "tool", text: "{}", toolName: "kb_write", isError: true }] });
    expect(tools(s)[0]?.status).toBe("error");
  });

  it("an empty history is a no-op, not a reset", () => {
    const seeded = reduce(initialState, { t: "send", text: "typed before history arrived" });
    expect(reduce(seeded, { t: "hydrate", items: [] })).toEqual(seeded);
  });

  it("hydration NEVER clobbers a turn already in flight", () => {
    const live = run(initialState, [{ t: "send", text: "hi" }, { t: "stream_start" }, frame("assistant.text", { text: "partial" })]);
    expect(reduce(live, history)).toEqual(live);
  });

  it("hydrated ids cannot collide with ids minted by later live turns", () => {
    const s = run(initialState, [history, { t: "send", text: "next question" }]);
    expect(new Set(s.entries.map((e) => e.id)).size).toBe(s.entries.length);
  });

  it("switching sessions clears the old chat, then the new history replaces it", () => {
    const first = reduce(initialState, history);
    const cleared = reduce(first, { t: "session_switched" });
    expect(cleared.entries).toEqual([]);
    const second = reduce(cleared, { t: "hydrate", items: [{ role: "user", text: "other session" }] });
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]).toMatchObject({ kind: "user", text: "other session" });
  });
});

/* -------------------------------------------------------------------------- */
/* ④a migration: attribution capture + the execution-gate denied frame.       */
/* Every NEW frame type lands with its own migration asserts; the h/e id      */
/* non-collision guarantee is re-proven with the new vocabulary present.      */

describe("④a attribution (session.init → modelShort)", () => {
  it("session.init captures the SHORT model name; the full id never has a field to land in", () => {
    const s = reduce(initialState, frame("session.init", { model: "qwen3.8-flash" }));
    expect(s.modelShort).toBe("qwen3.8-flash");
  });

  it("a model-less init frame keeps the previous attribution (never nulls it)", () => {
    const seeded = reduce(initialState, frame("session.init", { model: "deepseek-chat" }));
    const s = reduce(seeded, frame("session.init", { model: "" }));
    expect(s.modelShort).toBe("deepseek-chat");
  });

  it("attribution survives the result frame and a full turn (cumulative, not per-turn)", () => {
    const s = run(initialState, [
      frame("session.init", { model: "qwen3.8-flash" }),
      frame("assistant.text", { text: "hi" }),
      frame("result", { subtype: "success", isError: false, usage: { input_tokens: 1, output_tokens: 2 } }),
    ]);
    expect(s.modelShort).toBe("qwen3.8-flash");
    expect(s.conn).toBe("idle");
  });
});

describe("④a tool.denied (execution-gate frame → visible refused block)", () => {
  it("a denied call renders as an ERROR tool block with the refusal reason, not a hang", () => {
    const s = reduce(initialState, frame("tool.denied", { tool: "Bash", reason: "outside the mounted menu" }));
    expect(tools(s)).toHaveLength(1);
    expect(tools(s)[0]).toMatchObject({ kind: "tool", name: "Bash", status: "error" });
    expect(tools(s)[0]?.input).toContain("outside the mounted menu");
  });

  it("denied frames coexist with hydrated history: new vocabulary, same h/e id guarantee", () => {
    const s = run(initialState, [
      { t: "hydrate", items: [{ role: "tool", text: "{}", toolName: "read_file" }] },
      frame("tool.denied", { tool: "Write", reason: "denied by policy" }),
      { t: "send", text: "after" },
    ]);
    const ids = s.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // no h/e collision with the new frame type
    expect(s.entries.filter((e) => e.kind === "tool").map((t) => t.name)).toEqual(["read_file", "Write"]);
  });
});
