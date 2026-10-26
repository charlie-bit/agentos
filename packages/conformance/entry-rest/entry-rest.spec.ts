/**
 * ENTRY-REST SUITE — contract conformance over real HTTP, fully offline:
 * a stub TurnRunner scripts the event stream; no kernel, no network beyond
 * 127.0.0.1, no real credentials (sentinel env values prove non-leakage).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { openLedger } from "@agentos/core";
import { startServer, type RunningServer, type TranscriptReader, type TurnRunner } from "@agentos/entry-rest";

const tempDirs: string[] = [];
const servers: RunningServer[] = [];

/** Sentinel values that must NEVER appear in any HTTP response body. */
const FAKE_URL = "https://leak-canary.example/anthropic";
const FAKE_KEY = "sk-leak-canary-000";

function makeStaticDir(dir: string): string {
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>agentos web</title>");
  return dist;
}

async function boot(
  runner: TurnRunner,
  readTranscript?: TranscriptReader,
): Promise<{ srv: RunningServer; dbPath: string; escPath: string }> {
  const dir = mkdtempSync(join(tmpdir(), "agentos-rest-conf-"));
  tempDirs.push(dir);
  const dbPath = join(dir, "sessions.db");
  const escPath = join(dir, "escalations.log");
  const srv = await startServer({
    presetName: "conf-preset",
    model: { provider: "vendor-x", baseUrlEnv: "CONF_URL_ENV", credentialsEnv: "CONF_KEY_ENV" },
    mounts: [
      { key: "fs", transport: "stdio" },
      { key: "gw", transport: "http", degraded: true },
    ],
    runner,
    ledger: openLedger(dbPath),
    port: 0,
    dbPath,
    escalatePath: escPath,
    staticDir: makeStaticDir(dir),
    ...(readTranscript ? { readTranscript } : {}),
  });
  servers.push(srv);
  return { srv, dbPath, escPath };
}

/** Parse an SSE fetch response into its data frames. */
async function readFrames(res: Response): Promise<Array<Record<string, unknown>>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const frames: Array<Record<string, unknown>> = [];
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
      if (line) frames.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
    }
  }
  return frames;
}

const api = (srv: RunningServer, path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${srv.port}${path}`, init);
const postJson = (srv: RunningServer, path: string, body: unknown) =>
  api(srv, path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeAll(() => {
  process.env.CONF_URL_ENV = FAKE_URL;
  process.env.CONF_KEY_ENV = FAKE_KEY;
});
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});
afterAll(() => {
  delete process.env.CONF_URL_ENV;
  delete process.env.CONF_KEY_ENV;
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

describe("SSE chat stream", () => {
  it("delivers frames in injected order, closes after result", async () => {
    const { srv } = await boot(async ({ emit }) => {
      emit({ type: "assistant.text", payload: { text: "part one" }, timestampMs: 1 });
      emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: 2 });
      return {};
    });
    const res = await postJson(srv, "/api/chat", { sessionId: "s-1", message: "hi" });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const frames = await readFrames(res);
    expect(frames.map((f) => f.type)).toEqual(["session.meta", "assistant.text", "result"]);
    expect((frames[1]?.payload as { text: string }).text).toBe("part one");
  });

  it("malformed bodies answer 400 and a junk-emitting runner still closes cleanly", async () => {
    const { srv } = await boot(async ({ emit }) => {
      emit({} as never); // malformed frame
      emit({ type: "result", payload: null, timestampMs: 1 });
      return {};
    });
    expect((await postJson(srv, "/api/chat", { message: "no session" })).status).toBe(400);
    const res = await postJson(srv, "/api/chat", { sessionId: "ok", message: "go" });
    const types = (await readFrames(res)).map((f) => f.type);
    expect(types).toContain("session.meta"); // survived the junk frame, stream completed
  });
});

describe("session.init tool surface (D-0910-4 audit channel)", () => {
  /* The BLACKLIST itself is asserted where the kernel options are built
     (adapters/claude-sdk channel.spec: tools === ["Read"]), because this
     package is deliberately kernel-free — depending on the adapter would void
     its "swap the kernel and these still pass" property. What belongs HERE is
     the transport contract: the surface the kernel reported must reach the
     client verbatim, or no auditor and no drift check can ever see it. */
  it("the tools array reaches the browser verbatim, and carries no banned builtin", async () => {
    const surface = ["Read", "mcp__fs__read_file", "mcp__kb__kb_search"];
    const { srv } = await boot(async ({ emit }) => {
      emit({ type: "session.init", payload: { model: "m", cwd: "/ws", tools: surface }, timestampMs: 1 });
      emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: 2 });
      return {};
    });
    const frames = await readFrames(await postJson(srv, "/api/chat", { sessionId: "init-1", message: "hi" }));
    const init = frames.find((f) => f.type === "session.init");
    expect(init).toBeDefined();
    const tools = (init?.payload as { tools?: string[] }).tools;
    expect(tools).toEqual(surface);
    for (const banned of ["Bash", "Write", "Edit", "WebFetch", "WebSearch"]) {
      expect(JSON.stringify(tools)).not.toContain(banned);
    }
  });
});

describe("session ledger behavior", () => {
  it("same browser session -> one row, second turn resumes via the stored pointer", async () => {
    const observed: Array<string | undefined> = [];
    const { srv, dbPath } = await boot(async ({ resumeSdkSessionId }) => {
      observed.push(resumeSdkSessionId);
      return { sdkSessionId: `sdk-after-${observed.length}` };
    });
    await readFrames(await postJson(srv, "/api/chat", { sessionId: "same", message: "one" }));
    await readFrames(await postJson(srv, "/api/chat", { sessionId: "same", message: "two" }));
    expect(observed).toEqual([undefined, "sdk-after-1"]);
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<Record<string, unknown>> };
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]?.external_key).toBe("web-same");
    expect(list.sessions[0]?.status).toBe("idle");
    expect(readFileSync(dbPath).length).toBeGreaterThan(0);
  });

  it("runner failure records an error frame and marks the row", async () => {
    const { srv } = await boot(async () => {
      throw new Error("kernel exploded");
    });
    const frames = await readFrames(await postJson(srv, "/api/chat", { sessionId: "boom", message: "x" }));
    const last = frames.at(-1) as { type: string; payload: { isError: boolean } };
    expect(last.type).toBe("result");
    expect(last.payload.isError).toBe(true);
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ status: string }> };
    expect(list.sessions[0]?.status).toBe("error");
  });
});

describe("PATCH /api/sessions/:id/title", () => {
  const patch = (srv: RunningServer, id: string, body: unknown) =>
    api(srv, `/api/sessions/${id}/title`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  const seedRow = async (srv: RunningServer, sessionId: string): Promise<string> => {
    await readFrames(await postJson(srv, "/api/chat", { sessionId, message: "hi" }));
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ id: string; external_key: string }> };
    return list.sessions.find((s) => s.external_key === `web-${sessionId}`)!.id;
  };

  it("sets a title, which then comes back on GET /api/sessions", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const id = await seedRow(srv, "rename-me");
    const res = await patch(srv, id, { title: "Ledger outage 09-11" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { title: string }).toEqual({ ok: true, title: "Ledger outage 09-11" });
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ id: string; title: string | null }> };
    expect(list.sessions.find((s) => s.id === id)?.title).toBe("Ledger outage 09-11");
  });

  it("trims whitespace and normalizes empty/whitespace-only to null", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const id = await seedRow(srv, "clear-me");
    await patch(srv, id, { title: "  padded  " });
    expect(((await (await patch(srv, id, { title: "  padded  " })).json()) as { title: string }).title).toBe("padded");
    const cleared = await patch(srv, id, { title: "   " });
    expect(((await cleared.json()) as { title: string | null }).title).toBeNull();
  });

  it("null clears an existing title back to unset", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const id = await seedRow(srv, "null-me");
    await patch(srv, id, { title: "temporary" });
    const res = await patch(srv, id, { title: null });
    expect(((await res.json()) as { title: string | null }).title).toBeNull();
  });

  it("unknown id answers 404, malformed title answers 400", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const missing = await patch(srv, "no-such-row", { title: "x" });
    expect(missing.status).toBe(404);
    const id = await seedRow(srv, "bad-body");
    const badType = await patch(srv, id, { title: 42 });
    expect(badType.status).toBe(400);
  });
});

describe("DELETE /api/sessions/:id", () => {
  const seedRow = async (srv: RunningServer, sessionId: string): Promise<string> => {
    await readFrames(await postJson(srv, "/api/chat", { sessionId, message: "hi" }));
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ id: string; external_key: string }> };
    return list.sessions.find((s) => s.external_key === `web-${sessionId}`)!.id;
  };

  it("removes the row; it no longer appears on GET /api/sessions", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const id = await seedRow(srv, "delete-me");
    const res = await api(srv, `/api/sessions/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ id: string }> };
    expect(list.sessions.some((s) => s.id === id)).toBe(false);
  });

  it("unknown id answers 404, and a second delete of the same id also answers 404", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const missing = await api(srv, "/api/sessions/no-such-row", { method: "DELETE" });
    expect(missing.status).toBe(404);
    const id = await seedRow(srv, "twice");
    expect((await api(srv, `/api/sessions/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(srv, `/api/sessions/${id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("deleting one session leaves an unrelated one untouched", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const a = await seedRow(srv, "keep-a");
    const b = await seedRow(srv, "drop-b");
    await api(srv, `/api/sessions/${b}`, { method: "DELETE" });
    const list = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ id: string }> };
    expect(list.sessions.some((s) => s.id === a)).toBe(true);
    expect(list.sessions.some((s) => s.id === b)).toBe(false);
  });

  it("the route does not also answer GET or POST — those still resolve to their own routes", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    const id = await seedRow(srv, "method-check");
    // GET /api/sessions/:id is not a defined route at all (only /:id/title and
    // /:id/messages are) — this proves DELETE didn't accidentally widen it.
    expect((await api(srv, `/api/sessions/${id}`)).status).toBe(404);
  });
});

describe("out-of-band confirm", () => {
  it("pushes confirm.request, POST resolves it", async () => {
    let confirmResult = "";
    const { srv } = await boot(async ({ emit, confirm }) => {
      // 30s window: race against vitest's 5s default under load (semantics
      // unchanged — the POST still resolves well before any timeout)
      const r = await confirm({ prompt: "Commit the draft?", timeoutMs: 30_000 });
      confirmResult = `${r.approved}:${r.decidedBy}`;
      emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: 1 });
      return {};
    });
    const res = await postJson(srv, "/api/chat", { sessionId: "c-1", message: "write it" });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let requestId = "";
    // read until the confirm.request frame surfaces
    while (!requestId) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      buf += decoder.decode(value, { stream: true });
      const m = buf.match(/"requestId":"([^"]+)"/);
      if (m) requestId = m[1] as string;
    }
    expect(requestId).toBeTruthy();
    const settled = await postJson(srv, "/api/confirm", { requestId, approved: true });
    expect(settled.status).toBe(200);
    await settled.json(); // drain the body (undici discipline)
    // reader.closed only resolves once buffered frames are consumed — read to done
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(confirmResult).toBe("true:web-user:yes");
  });

  it("deny-on-timeout without any POST (adapter duty)", async () => {
    let timed = "";
    const { srv } = await boot(async ({ confirm }) => {
      const r = await confirm({ prompt: "Nobody answers", timeoutMs: 60 });
      timed = `${r.approved}:${r.decidedBy}`;
      return {};
    });
    await readFrames(await postJson(srv, "/api/chat", { sessionId: "t-1", message: "ask" }));
    expect(timed).toBe("false:timeout");
  });
});

describe("escalation + status hygiene", () => {
  it("three escalations -> count 3 and three JSONL lines", async () => {
    const { srv, escPath } = await boot(async () => ({}));
    for (let i = 0; i < 3; i += 1) {
      expect((await postJson(srv, "/api/escalate", { sessionId: "e-1", reason: `r${i}` })).status).toBe(200);
    }
    expect(((await (await api(srv, "/api/escalations")).json()) as { count: number }).count).toBe(3);
    expect(readFileSync(escPath, "utf8").trim().split("\n")).toHaveLength(3);
  });

  it("/api/status exposes NAMES never VALUES, keeps mount degradation + drift fields", async () => {
    const { srv } = await boot(async ({ emit }) => {
      emit({ type: "kernel.system.drift", payload: { missing: ["fs/x"], undeclared: [] }, timestampMs: 1 });
      return {};
    });
    const body = await (await api(srv, "/api/status")).text();
    const status = JSON.parse(body) as {
      preset: string;
      model: { provider: string; baseUrlEnv: string };
      mounts: Array<{ key: string; degraded?: boolean }>;
    };
    expect(status.preset).toBe("conf-preset");
    expect(status.model.provider).toBe("vendor-x");
    expect(status.model.baseUrlEnv).toBe("CONF_URL_ENV");
    expect(status.mounts.find((m) => m.key === "gw")?.degraded).toBe(true);
    expect(body).not.toContain(FAKE_URL); // leak-canary sentinels absent — grep-grade assertion
    expect(body).not.toContain(FAKE_KEY);
    await readFrames(await postJson(srv, "/api/chat", { sessionId: "d", message: "m" }));
    // Drift is per-session (spec #218): the caller names the session it asks about.
    const after = (await (await api(srv, "/api/status?session=d")).json()) as { lastDrift: unknown };
    expect(after.lastDrift).toEqual({ missing: ["fs/x"], undeclared: [] });
  });
});

describe("static serving + local binding", () => {
  it("GET / serves index.html; traversal is refused", async () => {
    const { srv } = await boot(async () => ({}));
    expect(await (await api(srv, "/")).text()).toContain("<!doctype html>");
    expect((await api(srv, "/../package.json")).status).toBeGreaterThanOrEqual(400);
    expect((await api(srv, "/%2e%2e%2f%2e%2e%2fsecret.txt")).status).toBeGreaterThanOrEqual(400);
    expect((await api(srv, "/nope.js")).status).toBe(404);
  });

  it("server listens on 127.0.0.1 only", async () => {
    const { srv } = await boot(async () => ({}));
    expect(srv.address).toBe("127.0.0.1"); // bound interface, asserted at the source of truth
    const res = await fetch(`http://127.0.0.1:${srv.port}/healthz`);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

/**
 * History replay endpoint. The reader is INJECTED here exactly as the
 * composition root injects the adapter's real one: this suite proves the
 * ROUTE's contract (shape + degradation) and never a file format, so
 * entry-rest stays unaware that a kernel store even exists.
 */
describe("GET /api/sessions/:id/messages", () => {
  const entries = [
    { role: "user" as const, text: "read the map" },
    { role: "tool" as const, text: '{"path":"a.md"}', toolName: "read_file", isError: false },
    { role: "assistant" as const, text: "here is the row" },
  ];

  /** Drive one turn so the ledger row exists AND carries an sdk pointer. */
  const seed = async (srv: RunningServer, id: string): Promise<void> => {
    const res = await fetch(srv.url + "/api/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: id, message: "hi" }),
      headers: { "content-type": "application/json" },
    });
    await res.text();
  };

  it("pointer plus a readable store returns the neutral entries, oldest first", async () => {
    const seen: Array<{ sdkSessionId: string; externalKey: string }> = [];
    const { srv } = await boot(
      async () => ({ sdkSessionId: "sdk-1" }),
      (args) => {
        seen.push(args);
        return entries;
      },
    );
    await seed(srv, "abc");
    const body = (await (await api(srv, "/api/sessions/abc/messages")).json()) as { entries: typeof entries };
    expect(body.entries).toEqual(entries);
    // the route hands the reader the LEDGER's pointer and key, nothing else
    expect(seen).toEqual([{ sdkSessionId: "sdk-1", externalKey: "web-abc" }]);
  });

  it("a raw externalKey resolves as well as a bare browser id", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }), () => entries);
    await seed(srv, "abc");
    const body = (await (await api(srv, "/api/sessions/web-abc/messages")).json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(3);
  });

  /* Degradation: history is cosmetic, so EVERY failure is 200 + []. A 404 or a
     500 here would dress a missing nicety up as a broken console. */

  it("a session that never took a turn (no pointer) answers 200 and an empty list", async () => {
    let called = 0;
    const { srv } = await boot(
      async () => ({}), // runner reports no sdkSessionId -> ledger pointer stays null
      () => {
        called += 1;
        return entries;
      },
    );
    await seed(srv, "no-pointer");
    const res = await api(srv, "/api/sessions/no-pointer/messages");
    expect(res.status).toBe(200);
    expect((await res.json()) as { entries: unknown[] }).toEqual({ entries: [] });
    expect(called).toBe(0); // no pointer -> the reader is never even consulted
  });

  it("an unknown session answers 200 and an empty list, not 404", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }), () => entries);
    const res = await api(srv, "/api/sessions/never-existed/messages");
    expect(res.status).toBe(200);
    expect((await res.json()) as { entries: unknown[] }).toEqual({ entries: [] });
  });

  it("a corrupt store (reader throws) answers 200 and an empty list, never 500", async () => {
    const { srv } = await boot(
      async () => ({ sdkSessionId: "sdk-1" }),
      () => {
        throw new Error("truncated jsonl");
      },
    );
    await seed(srv, "corrupt");
    const res = await api(srv, "/api/sessions/corrupt/messages");
    expect(res.status).toBe(200);
    expect((await res.json()) as { entries: unknown[] }).toEqual({ entries: [] });
  });

  it("a reader returning junk instead of an array is coerced to an empty list", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }), () => "not an array" as never);
    await seed(srv, "junk");
    expect((await (await api(srv, "/api/sessions/junk/messages")).json()) as { entries: unknown[] }).toEqual({ entries: [] });
  });

  it("no reader wired at all still answers 200 and an empty list", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }));
    await seed(srv, "no-reader");
    const res = await api(srv, "/api/sessions/no-reader/messages");
    expect(res.status).toBe(200);
    expect((await res.json()) as { entries: unknown[] }).toEqual({ entries: [] });
  });

  it("the route is read-only: a POST to it is not a route at all", async () => {
    const { srv } = await boot(async () => ({ sdkSessionId: "sdk-1" }), () => entries);
    await seed(srv, "abc");
    const res = await postJson(srv, "/api/sessions/abc/messages", { entries: [{ role: "user", text: "injected" }] });
    expect(res.status).toBe(404);
    // and the stored history is untouched by the attempt
    const after = (await (await api(srv, "/api/sessions/abc/messages")).json()) as { entries: unknown[] };
    expect(after.entries).toHaveLength(3);
  });
});

describe("concurrent tabs (spec #216)", () => {
  /** Consume an SSE response, invoking onFrame as frames arrive; resolves with all frames. */
  async function consumeStream(res: Response, onFrame: (f: Record<string, unknown>) => void): Promise<Array<Record<string, unknown>>> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const frames: Array<Record<string, unknown>> = [];
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
        if (!line) continue;
        const frame = JSON.parse(line.slice(6)) as Record<string, unknown>;
        frames.push(frame);
        onFrame(frame);
      }
    }
    return frames;
  }

  it("each tab's confirm arrives on its own stream and resolves its own turn", async () => {
    const verdicts: Record<string, boolean> = {};
    const { srv } = await boot(async (ctx) => {
      const answer = await ctx.confirm({ prompt: `approve ${ctx.externalKey}` });
      verdicts[ctx.externalKey] = answer.approved;
      ctx.emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: Date.now() });
      return {};
    });

    const firstConfirm = new Map<string, (requestId: string) => void>();
    const requestIds = new Map<string, string>();
    const waitForConfirm = (tab: string) =>
      new Promise<string>((resolve) => {
        firstConfirm.set(tab, resolve);
        if (requestIds.has(tab)) resolve(requestIds.get(tab) as string);
      });

    const runTab = async (tab: string) => {
      const res = await postJson(srv, "/api/chat", { sessionId: tab, message: "go" });
      return consumeStream(res, (frame) => {
        if (frame.type !== "confirm.request") return;
        const payload = frame.payload as { requestId?: string; prompt?: string };
        requestIds.set(tab, payload.requestId ?? "");
        // the prompt proves the frame belongs to this tab's turn
        expect(payload.prompt).toContain(`web-${tab}`);
        firstConfirm.get(tab)?.(payload.requestId ?? "");
      });
    };

    const tabA = runTab("a");
    const tabB = runTab("b");
    const [reqA, reqB] = await Promise.all([waitForConfirm("a"), waitForConfirm("b")]);
    expect(reqA).not.toBe(reqB);

    // Answer A yes and B no — interleaved order on purpose.
    await postJson(srv, "/api/confirm", { requestId: reqB, approved: false });
    await postJson(srv, "/api/confirm", { requestId: reqA, approved: true });

    const [framesA, framesB] = await Promise.all([tabA, tabB]);
    const confirmsA = framesA.filter((f) => f.type === "confirm.request");
    const confirmsB = framesB.filter((f) => f.type === "confirm.request");
    expect(confirmsA).toHaveLength(1);
    expect(confirmsB).toHaveLength(1);
    expect((confirmsA[0]?.payload as { requestId: string }).requestId).toBe(reqA);
    expect((confirmsB[0]?.payload as { requestId: string }).requestId).toBe(reqB);
    expect(verdicts["web-a"]).toBe(true);
    expect(verdicts["web-b"]).toBe(false);
  });
});

describe("per-session drift status (spec #218)", () => {
  it("session A's drift is not reported as session B's", async () => {
    const { srv } = await boot(async (ctx) => {
      if (ctx.externalKey === "web-a") {
        ctx.emit({ type: "kernel.system.drift", payload: { missing: ["fs/read_text_file"], undeclared: [] }, timestampMs: 1 });
      }
      ctx.emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: 2 });
      return {};
    });

    const run = async (sessionId: string) => {
      const res = await postJson(srv, "/api/chat", { sessionId, message: "go" });
      await res.text(); // drain
    };
    await run("a");
    await run("b");

    const statusOf = async (session?: string) =>
      (await (await api(srv, `/api/status${session === undefined ? "" : `?session=${session}`}`)).json()) as {
        lastDrift: { missing: string[]; undeclared: string[] } | null;
      };

    expect((await statusOf("a")).lastDrift).toEqual({ missing: ["fs/read_text_file"], undeclared: [] });
    expect((await statusOf("b")).lastDrift).toBeNull();
    expect((await statusOf()).lastDrift).toBeNull();
  });
});

describe("turn lifecycle in the ledger (spec #215)", () => {
  it("a turn is 'running' while it runs — including turns 2..N — and idle after", async () => {
    let release: (() => void) | undefined;
    let gate = Promise.resolve();
    const { srv } = await boot(async (ctx) => {
      await gate;
      ctx.emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: 1 });
      return {};
    });

    const statusOf = async (sessionId: string) => {
      const body = (await (await api(srv, "/api/sessions")).json()) as {
        sessions: Array<{ external_key: string; status: string }>;
      };
      return body.sessions.find((s) => s.external_key === `web-${sessionId}`)?.status;
    };

    for (const turn of [1, 2]) {
      gate = new Promise<void>((r) => {
        release = r;
      });
      const stream = postJson(srv, "/api/chat", { sessionId: "life", message: `turn ${turn}` });
      // Wait until the row exists and the turn has begun.
      await new Promise((r) => setTimeout(r, 20));
      expect(await statusOf("life"), `turn ${turn} in flight`).toBe("running");
      release?.();
      await (await stream).text();
      expect(await statusOf("life"), `turn ${turn} settled`).toBe("idle");
    }
  });
});

describe("session list pagination (spec #221)", () => {
  it("more than 100 sessions are pageable to the full set, recency-ordered", async () => {
    const { srv, dbPath } = await boot(async () => ({}));
    const ledger = openLedger(dbPath);
    for (let i = 0; i < 120; i += 1) {
      const row = ledger.createSession({ entry: "rest", externalKey: `bulk-${i}`, preset: "conf-preset" });
      ledger.touch(row.id);
      ledger.markStatus(row.id, "idle");
    }
    ledger.close();

    const page1 = (await (await api(srv, "/api/sessions?limit=100&offset=0")).json()) as {
      sessions: Array<{ external_key: string }>;
      total: number;
      hasMore: boolean;
    };
    const page2 = (await (await api(srv, "/api/sessions?limit=100&offset=100")).json()) as {
      sessions: Array<{ external_key: string }>;
      total: number;
      hasMore: boolean;
    };

    expect(page1.total).toBe(120);
    expect(page1.sessions).toHaveLength(100);
    expect(page1.hasMore).toBe(true);
    expect(page2.sessions).toHaveLength(20);
    expect(page2.hasMore).toBe(false);
    expect(new Set([...page1.sessions, ...page2.sessions].map((s) => s.external_key)).size).toBe(120);
  });

  it("pagination parameters are bounded (no whole-table dump, no negative offset)", async () => {
    const { srv } = await boot(async () => ({}));
    const body = (await (await api(srv, "/api/sessions?limit=99999&offset=-5")).json()) as { limit: number; offset: number };
    expect(body.limit).toBe(500);
    expect(body.offset).toBe(0);
  });
});
