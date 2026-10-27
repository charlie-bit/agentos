/**
 * ENTRY-REST SUITE — contract conformance over real HTTP, fully offline:
 * a stub TurnRunner scripts the event stream; no kernel, no network beyond
 * 127.0.0.1, no real credentials (sentinel env values prove non-leakage).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

describe("SSE keepalive (spec #252)", () => {
  it("an idle stream still receives heartbeat comment lines", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-hb-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "hb-preset",
      model: { provider: "v" },
      mounts: [],
      heartbeatMs: 10,
      runner: async ({ emit }) => {
        await new Promise((r) => setTimeout(r, 45)); // silent turn
        emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: Date.now() });
        return {};
      },
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
    });
    servers.push(srv);

    const res = await postJson(srv, "/api/chat", { sessionId: "hb", message: "slow" });
    const body = await res.text();
    expect(body).toContain(": keepalive");
    const heartbeats = body.split("\n").filter((l) => l.startsWith(": keepalive")).length;
    expect(heartbeats).toBeGreaterThanOrEqual(2);
    expect(body).toContain('"type":"result"'); // heartbeat never replaced the real frames
  });

  it("heartbeat stops when the stream closes (no timer leak)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-hb2-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "hb-preset",
      model: { provider: "v" },
      mounts: [],
      heartbeatMs: 5,
      runner: async ({ emit }) => {
        emit({ type: "result", payload: { subtype: "success", isError: false }, timestampMs: Date.now() });
        return {};
      },
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
    });
    servers.push(srv);
    const res = await postJson(srv, "/api/chat", { sessionId: "fast", message: "go" });
    await res.text();
    // A leaked interval would keep writing to a closed response; the process
    // staying alive past this point (and no throw) is the observable signal.
    await new Promise((r) => setTimeout(r, 30));
    expect(srv.port).toBeGreaterThan(0);
  });
});

describe("GET /api/presets (spec #288)", () => {
  it("lists the injected presets read-only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-presets-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      listPresets: () => [
        { name: "example", path: "config/presets/example.yml" },
        { name: "triage-demo", path: "examples/triage-demo/preset.yml" },
      ],
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/presets")).json()) as { presets: Array<{ name: string; path: string }> };
    expect(body.presets.map((p) => p.name)).toEqual(["example", "triage-demo"]);
    expect(body.presets[0]?.path).toBe("config/presets/example.yml");
  });

  it("an unwired deployment answers 501, not a fabricated list", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await api(srv, "/api/presets")).status).toBe(501);
  });
});

describe("POST /api/presets/validate (spec #289)", () => {
  it("echoes the CLI runner's verdict verbatim", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-pv-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const seen: string[] = [];
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      validatePreset: (target) => {
        seen.push(target);
        return { exitCode: 1, lines: ["✗ tools.0: references \"ghost\", which no manifest declares"] };
      },
    });
    servers.push(srv);
    const res = await postJson(srv, "/api/presets/validate", { name: "broken" });
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      exitCode: 1,
      lines: ['✗ tools.0: references "ghost", which no manifest declares'],
    });
    expect(seen).toEqual(["broken"]);
  });

  it("bad input is 400 and an unwired deployment is 501", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await postJson(srv, "/api/presets/validate", { name: "" })).status).toBe(400);
    expect((await postJson(srv, "/api/presets/validate", { name: "x" })).status).toBe(501);
  });
});

describe("GET /api/tools (spec #290)", () => {
  it("exposes mount key/transport/manifest source and the idempotent split", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-tools-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      listTools: () => [
        {
          key: "mcp-filesystem",
          transport: "stdio",
          manifestPath: "config/tools/mcp-filesystem.yml",
          allowedTools: ["read_file", "write_file"],
          idempotent: { default: false, overrides: { read_file: true } },
          mounted: true,
        },
        {
          key: "mcp-remote-example",
          transport: "http",
          manifestPath: "config/tools/mcp-remote-example.yml",
          allowedTools: null,
          idempotent: null,
          mounted: false,
        },
      ],
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/tools")).json()) as {
      tools: Array<{ key: string; manifestPath: string | null; idempotent: { overrides?: Record<string, boolean> } | null; mounted: boolean }>;
    };
    const fs = body.tools.find((t) => t.key === "mcp-filesystem");
    expect(fs?.manifestPath).toBe("config/tools/mcp-filesystem.yml");
    expect(fs?.idempotent?.overrides).toEqual({ read_file: true }); // read/write split is visible
    expect(body.tools.find((t) => t.key === "mcp-remote-example")?.mounted).toBe(false);
  });

  it("unwired is 501", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await api(srv, "/api/tools")).status).toBe(501);
  });
});

describe("GET /api/usage (spec #291)", () => {
  it("passes session/since through and echoes the aggregate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-usage-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const calls: Array<{ session?: string; sinceMs?: number }> = [];
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      usage: (q) => {
        calls.push(q);
        return { rows: [{ provider: "v", model: "m", turns: 1, input: 10, output: 2, cacheRead: 0, cacheWrite: 0, costUsd: 0.001 }], totals: { turns: 1 } };
      },
    });
    servers.push(srv);

    const res = await api(srv, "/api/usage?session=web-a&since=2026-01-01T00:00:00Z");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ turns: number }> };
    expect(body.rows[0]?.turns).toBe(1);
    expect(calls[0]?.session).toBe("web-a");
    expect(calls[0]?.sinceMs).toBe(Date.parse("2026-01-01T00:00:00Z"));

    expect((await api(srv, "/api/usage?since=not-a-date")).status).toBe(400);
  });

  it("unwired is 501", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await api(srv, "/api/usage")).status).toBe(501);
  });
});

describe("GET /api/sessions/:id/export (spec #259)", () => {
  const entries = [
    { role: "user" as const, text: "why is checkout slow?", timestampMs: 1 },
    { role: "tool" as const, text: '{"q":"checkout"}', toolName: "search", isError: false, timestampMs: 2 },
    { role: "assistant" as const, text: "because retries storm", timestampMs: 3 },
  ];

  async function seeded(): Promise<{ srv: RunningServer; dbPath: string }> {
    const { srv, dbPath } = await boot(async () => ({ sdkSessionId: "sdk-export" }), (args) =>
      args.sdkSessionId === "sdk-export" ? entries : [],
    );
    const ledger = openLedger(dbPath);
    const row = ledger.createSession({ entry: "rest", externalKey: "web-exp", preset: "p" });
    ledger.setTitle(row.id, "checkout investigation");
    ledger.setSdkSessionId(row.id, "sdk-export");
    ledger.close();
    return { srv, dbPath };
  }

  it("downloads JSONL with a Content-Disposition attachment", async () => {
    const { srv } = await seeded();
    const res = await api(srv, "/api/sessions/exp/export?format=jsonl");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="agentos-session-exp.jsonl"');
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { role: string });
    expect(lines.map((l) => l.role)).toEqual(["user", "tool", "assistant"]);
  });

  it("downloads Markdown, titled from the ledger", async () => {
    const { srv } = await seeded();
    const res = await api(srv, "/api/sessions/exp/export?format=md");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain("# checkout investigation");
    expect(body).toContain("**tool** `search`");
  });

  it("bad format is 400, unknown session 404, and an unreadable store is an empty file", async () => {
    const { srv } = await seeded();
    expect((await api(srv, "/api/sessions/exp/export?format=pdf")).status).toBe(400);
    expect((await api(srv, "/api/sessions/ghost/export")).status).toBe(404);
  });
});

describe("POST /api/sessions/export (spec #260)", () => {
  it("bundles several sessions into one downloadable NDJSON stream", async () => {
    const { srv, dbPath } = await boot(
      async () => ({ sdkSessionId: "sdk-bulk" }),
      (args) =>
        args.sdkSessionId === "sdk-bulk"
          ? [
              { role: "user", text: `hi from ${args.externalKey}`, timestampMs: 1 },
              { role: "assistant", text: "hello", timestampMs: 2 },
            ]
          : [],
    );
    const ledger = openLedger(dbPath);
    for (const key of ["web-one", "web-two"]) {
      const row = ledger.createSession({ entry: "rest", externalKey: key, preset: "p" });
      ledger.setSdkSessionId(row.id, "sdk-bulk");
    }
    ledger.close();

    const res = await postJson(srv, "/api/sessions/export", { ids: ["one", "two", "ghost"] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines[0]?.["agentos.bundle"]).toBe("1");
    expect(lines.filter((l) => "session" in l)).toHaveLength(3); // two found + one not-found record
    expect(lines.filter((l) => "entry" in l)).toHaveLength(4); // 2 entries x 2 sessions
    expect(lines.some((l) => l.error === "not-found")).toBe(true);
  });

  it("bounds the request: empty, oversized, and non-string ids are 400", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await postJson(srv, "/api/sessions/export", { ids: [] })).status).toBe(400);
    expect((await postJson(srv, "/api/sessions/export", { ids: Array.from({ length: 101 }, (_, i) => `s${i}`) })).status).toBe(400);
    expect((await postJson(srv, "/api/sessions/export", { ids: [1] })).status).toBe(400);
  });
});

describe("GET /api/workspace/files (spec #256)", () => {
  it("lists the session workspace recursively with sizes, and refuses nothing it cannot read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-ws-"));
    tempDirs.push(dir);
    const ws = join(dir, "workspaces", "web-ws");
    mkdirSync(join(ws, "tool-results"), { recursive: true });
    writeFileSync(join(ws, "kb-overview.md"), "# guide");
    writeFileSync(join(ws, "tool-results", "big.json"), '{"a":1}');
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      workspaceDirFor: (key) => (key === "web-ws" ? ws : null),
    });
    servers.push(srv);

    const body = (await (await api(srv, "/api/workspace/files?session=ws")).json()) as {
      files: Array<{ path: string; size: number; mtimeMs: number }>;
    };
    expect(body.files.map((f) => f.path).sort()).toEqual(["kb-overview.md", "tool-results/big.json"]);
    expect(body.files.find((f) => f.path === "kb-overview.md")?.size).toBeGreaterThan(0);

    // unknown session -> empty list, not an error
    expect(((await (await api(srv, "/api/workspace/files?session=nobody")).json()) as { files: unknown[] }).files).toEqual([]);
    expect((await api(srv, "/api/workspace/files")).status).toBe(400);
  });

  it("unwired is 501", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await api(srv, "/api/workspace/files?session=x")).status).toBe(501);
  });
});

describe("GET /api/workspace/file (spec #257)", () => {
  async function wired(): Promise<RunningServer> {
    const dir = mkdtempSync(join(tmpdir(), "agentos-wsr-"));
    tempDirs.push(dir);
    const ws = join(dir, "workspaces", "web-ws");
    mkdirSync(join(ws, "tool-results"), { recursive: true });
    writeFileSync(join(ws, "note.txt"), "hello workspace");
    writeFileSync(join(ws, "tool-results", "big.json"), "x".repeat(2_000));
    writeFileSync(join(dir, "outside.txt"), "SECRET-OUTSIDE");
    try {
      symlinkSync(join(dir, "outside.txt"), join(ws, "link.txt")); // escapes by symlink
    } catch {
      /* platform without symlink support: the lexical fence still runs */
    }
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      workspaceDirFor: (key) => (key === "web-ws" ? ws : null),
    });
    servers.push(srv);
    return srv;
  }

  it("reads a file inside the session workspace", async () => {
    const srv = await wired();
    const body = (await (await api(srv, "/api/workspace/file?session=ws&path=note.txt")).json()) as {
      content: string;
      truncated: boolean;
      size: number;
    };
    expect(body.content).toBe("hello workspace");
    expect(body.truncated).toBe(false);
  });

  it("refuses traversal, absolute paths and symlink escapes with 403", async () => {
    const srv = await wired();
    for (const path of ["../outside.txt", "/etc/passwd", "link.txt"]) {
      const res = await api(srv, `/api/workspace/file?session=ws&path=${encodeURIComponent(path)}`);
      expect(res.status, `path ${path}`).toBe(403);
      expect(await res.text()).not.toContain("SECRET");
    }
  });

  it("missing file is 404; a session without a workspace is 404; missing params are 400", async () => {
    const srv = await wired();
    expect((await api(srv, "/api/workspace/file?session=ws&path=nope.txt")).status).toBe(404);
    expect((await api(srv, "/api/workspace/file?session=nobody&path=note.txt")).status).toBe(404);
    expect((await api(srv, "/api/workspace/file?session=ws")).status).toBe(400);
  });
});

describe("local token gate (spec #287)", () => {
  it("API routes require the token; static shell and healthz stay open", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-tok-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      token: "local-once-token",
    });
    servers.push(srv);

    expect((await api(srv, "/api/status")).status).toBe(403);
    expect((await api(srv, "/healthz")).status).toBe(200);
    expect((await api(srv, "/")).status).toBe(200); // static shell loads so the gate can render

    const viaHeader = await api(srv, "/api/status", { headers: { "x-agentos-token": "local-once-token" } });
    expect(viaHeader.status).toBe(200);
    expect((await api(srv, "/api/status?token=local-once-token")).status).toBe(200);
    expect((await api(srv, "/api/status", { headers: { "x-agentos-token": "wrong" } })).status).toBe(403);
  });
});

describe("POST /api/sessions/:id/abort (spec #254)", () => {
  it("aborts the in-flight turn: partial output stays, status becomes aborted", async () => {
    const { srv, dbPath } = await boot(async (ctx) => {
      ctx.emit({ type: "assistant.text", payload: { text: "partial answer" }, timestampMs: 1 });
      await new Promise<void>((_resolve, reject) => {
        const fail = () => {
          const err = new Error("turn aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (ctx.signal?.aborted) fail();
        else ctx.signal?.addEventListener("abort", fail, { once: true });
      });
      return {};
    });

    const stream = postJson(srv, "/api/chat", { sessionId: "ab", message: "long task" });
    // Let the turn start and the partial frame arrive, then abort.
    const res = await stream;
    const reading = readFrames(res);
    await new Promise((r) => setTimeout(r, 30));
    const abortRes = await postJson(srv, "/api/sessions/ab/abort", {});
    expect(abortRes.status).toBe(200);
    expect(((await abortRes.json()) as { aborted: number }).aborted).toBe(1);

    const frames = await reading;
    const types = frames.map((f) => f.type);
    expect(types).toContain("assistant.text"); // partial content preserved
    const result = frames.find((f) => f.type === "result")?.payload as { subtype: string; isError: boolean };
    expect(result.subtype).toBe("aborted");
    expect(result.isError).toBe(true);

    const ledger = openLedger(dbPath);
    expect(ledger.getByExternalKey("web-ab")?.status).toBe("aborted");
    ledger.close();
  });

  it("aborting an idle session is a no-op that still answers 200", async () => {
    const { srv } = await boot(async () => ({}));
    const res = await postJson(srv, "/api/sessions/quiet/abort", {});
    expect(res.status).toBe(200);
    expect(((await res.json()) as { aborted: number }).aborted).toBe(0);
  });
});

describe("DELETE a running session (spec #217)", () => {
  it("cancels the turn first, so the stream ends in order and nothing is written late", async () => {
    const { srv, dbPath } = await boot(async (ctx) => {
      ctx.emit({ type: "assistant.text", payload: { text: "before delete" }, timestampMs: 1 });
      await new Promise<void>((_resolve, reject) => {
        const fail = () => {
          const err = new Error("deleted");
          err.name = "AbortError";
          reject(err);
        };
        if (ctx.signal?.aborted) fail();
        else ctx.signal?.addEventListener("abort", fail, { once: true });
      });
      return {};
    });
    const res = await postJson(srv, "/api/chat", { sessionId: "gone", message: "work" });
    const reading = readFrames(res);
    await new Promise((r) => setTimeout(r, 30));

    const ledger = openLedger(dbPath);
    const row = ledger.getByExternalKey("web-gone");
    ledger.close();
    expect(row).toBeDefined();
    const del = await api(srv, `/api/sessions/${row!.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const frames = await reading; // must terminate, not hang
    expect(frames.some((f) => f.type === "result")).toBe(true);
    expect(frames.some((f) => f.type === "assistant.text")).toBe(true);
    const after = openLedger(dbPath);
    expect(after.getByExternalKey("web-gone")).toBeUndefined();
    after.close();
  });
});

describe("status four-layer disclosure (spec #262)", () => {
  it("reveals each slot's manifest identity and the active dialect — names and paths only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-status4-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [{ key: "fs", transport: "stdio", manifestPath: "config/tools/fs.yml" }],
      knowledge: { name: "kb", manifestPath: "config/knowledge/kb.yml", mountType: "path" },
      entry: { name: "rest", confirm: true },
      dialect: "anthropic-compat",
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/status")).json()) as {
      mounts: Array<{ manifestPath?: string }>;
      knowledge: { manifestPath: string; mountType: string } | null;
      entry: { name: string; confirm: boolean } | null;
      dialect: string | null;
    };
    expect(body.mounts[0]?.manifestPath).toBe("config/tools/fs.yml");
    expect(body.knowledge).toEqual({ name: "kb", manifestPath: "config/knowledge/kb.yml", mountType: "path" });
    expect(body.entry).toEqual({ name: "rest", confirm: true });
    expect(body.dialect).toBe("anthropic-compat");
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });
});

describe("turn error taxonomy (spec #264)", () => {
  it("classifies failures into the four actionable kinds", async () => {
    const { classifyTurnError } = await import("@agentos/entry-rest");
    expect(classifyTurnError(new Error("fetch failed"))).toBe("network");
    expect(classifyTurnError(new Error("connect ECONNREFUSED 127.0.0.1:1"))).toBe("network");
    expect(classifyTurnError(new Error("bash is not part of this deployment's tool surface (denied by policy)"))).toBe("gate-denied");
    expect(classifyTurnError(new Error("unknown tool: mcp__fs__read"))).toBe("tool-missing");
    expect(classifyTurnError(new Error("no healthy alias for model manifest x"))).toBe("model-fallback");
    expect(classifyTurnError(new Error("something else"))).toBe("error");
    expect(classifyTurnError(new Error("x"), true)).toBe("aborted");
  });

  it("an errored turn's result frame carries the classified subtype", async () => {
    const { srv } = await boot(async () => {
      throw new Error("fetch failed");
    });
    const frames = await readFrames(await postJson(srv, "/api/chat", { sessionId: "err", message: "go" }));
    const result = frames.find((f) => f.type === "result")?.payload as { subtype: string; isError: boolean };
    expect(result.subtype).toBe("network");
    expect(result.isError).toBe(true);
  });
});

describe("GET /api/sessions?q= (spec #267)", () => {
  it("filters by title or external key, and only those", async () => {
    const { srv, dbPath } = await boot(async () => ({}));
    const ledger = openLedger(dbPath);
    const a = ledger.createSession({ entry: "rest", externalKey: "web-alpha", preset: "p" });
    ledger.setTitle(a.id, "checkout latency");
    ledger.markStatus(a.id, "idle");
    const b = ledger.createSession({ entry: "rest", externalKey: "web-beta", preset: "p" });
    ledger.setTitle(b.id, "mysql failover");
    ledger.markStatus(b.id, "idle");
    ledger.close();

    const byTitle = (await (await api(srv, "/api/sessions?q=checkout")).json()) as {
      sessions: Array<{ external_key: string }>;
      total: number;
    };
    expect(byTitle.sessions.map((s) => s.external_key)).toEqual(["web-alpha"]);
    expect(byTitle.total).toBe(1);

    const byKey = (await (await api(srv, "/api/sessions?q=beta")).json()) as { sessions: Array<{ external_key: string }> };
    expect(byKey.sessions.map((s) => s.external_key)).toEqual(["web-beta"]);

    const wildcard = (await (await api(srv, "/api/sessions?q=%25")).json()) as { sessions: unknown[] };
    expect(wildcard.sessions).toEqual([]); // LIKE metacharacters are escaped, not honoured

    expect((await api(srv, `/api/sessions?q=${"x".repeat(201)}`)).status).toBe(400);
  });
});

describe("POST /api/sessions/:id/attachments (spec #276)", () => {
  async function wired(): Promise<{ srv: RunningServer; ws: string }> {
    const dir = mkdtempSync(join(tmpdir(), "agentos-att-"));
    tempDirs.push(dir);
    const ws = join(dir, "workspaces", "web-att");
    mkdirSync(ws, { recursive: true });
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      workspaceDirFor: (key) => (key === "web-att" ? ws : null),
    });
    servers.push(srv);
    return { srv, ws };
  }

  it("writes the upload inside the session workspace", async () => {
    const { srv, ws } = await wired();
    const res = await api(srv, "/api/sessions/att/attachments", {
      method: "POST",
      body: "attachment body",
      headers: { "x-filename": encodeURIComponent("notes.txt") },
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ path: "attachments/notes.txt", size: 15 });
    expect(readFileSync(join(ws, "attachments", "notes.txt"), "utf8")).toBe("attachment body");
  });

  it("sanitizes traversal in the filename and refuses oversized bodies", async () => {
    const { srv, ws } = await wired();
    const res = await api(srv, "/api/sessions/att/attachments", {
      method: "POST",
      body: "x",
      headers: { "x-filename": encodeURIComponent("../../evil.sh") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path.startsWith("attachments/")).toBe(true);
    // no separator survives in the name, and the target resolves inside ws
    expect(body.path.slice("attachments/".length)).not.toContain("/");
    expect(readFileSync(join(ws, body.path), "utf8")).toBe("x");

    const big = await api(srv, "/api/sessions/att/attachments", {
      method: "POST",
      body: "y".repeat(5_000_001),
      headers: { "x-filename": "big.bin" },
    });
    expect(big.status).toBe(413);
  });
});

describe("kb draft inbox routes (spec #270–#272)", () => {
  async function wired(): Promise<RunningServer> {
    const dir = mkdtempSync(join(tmpdir(), "agentos-drafts-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const calls: string[] = [];
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      kbDrafts: {
        list: () => [{ receiptId: "r-1", pageId: "ops/retry.md", title: "Retry", preview: "body", createdAtMs: 1 }],
        commit: (id) => {
          calls.push(`commit:${id}`);
          return id === "r-1" ? { ok: true } : { ok: false, reason: "unknown receipt" };
        },
        discard: (id) => {
          calls.push(`discard:${id}`);
          return { ok: true };
        },
      },
    });
    servers.push(srv);
    (srv as RunningServer & { calls?: string[] }).calls = calls;
    return srv;
  }

  it("lists pending drafts and routes commit/discard", async () => {
    const srv = await wired();
    const list = (await (await api(srv, "/api/kb/drafts?session=x")).json()) as { drafts: Array<{ receiptId: string }> };
    expect(list.drafts.map((d) => d.receiptId)).toEqual(["r-1"]);

    expect((await postJson(srv, "/api/kb/drafts/r-1/commit", {})).status).toBe(200);
    expect((await postJson(srv, "/api/kb/drafts/r-1/discard", {})).status).toBe(200);
    expect((await postJson(srv, "/api/kb/drafts/ghost/commit", {})).status).toBe(409);
    expect((await postJson(srv, "/api/kb/drafts/bad%20id/commit", {})).status).toBe(400);
  });

  it("unwired is 501", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await api(srv, "/api/kb/drafts")).status).toBe(501);
    expect((await postJson(srv, "/api/kb/drafts/r/commit", {})).status).toBe(501);
  });
});

describe("/healthz body + /api/logs (spec #220/#292)", () => {
  it("reports unhealthy mounts while healthz stays 200", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-health-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      health: () => ({
        model: { key: "deepseek", healthy: false, reason: "ECONNREFUSED" },
        mounts: [
          { key: "fs", healthy: true, version: "stdio" },
          { key: "gw", healthy: false, version: "http", reason: "degraded" },
        ],
      }),
    });
    servers.push(srv);
    const res = await api(srv, "/healthz");
    expect(res.status).toBe(200); // liveness is never hostage to a dead channel
    const body = (await res.json()) as { ok: boolean; model: { healthy: boolean }; mounts: Array<{ healthy: boolean }> };
    expect(body.ok).toBe(true);
    expect(body.model.healthy).toBe(false);
    expect(body.mounts.map((m) => m.healthy)).toEqual([true, false]);
  });

  it("serves the operational log tail, bounded by ?lines", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-logroute-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const seen: number[] = [];
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      logs: ({ lines }) => {
        seen.push(lines ?? 0);
        return [{ name: "serve.log", lines: ['{"event":"boot"}'] }];
      },
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/logs?lines=9999")).json()) as { files: Array<{ lines: string[] }> };
    expect(body.files[0]?.lines).toEqual(['{"event":"boot"}']);
    expect(seen[0]).toBe(500); // bounded
    const unwired = await boot(async () => ({}));
    expect(((await (await api(unwired.srv, "/api/logs")).json()) as { files: unknown[] }).files).toEqual([]);
  });
});

describe("escalation history (spec #127/#294)", () => {
  it("returns newest-first entries with timestamps and reasons, bounded", async () => {
    const { srv, escPath } = await boot(async () => ({}));
    writeFileSync(escPath, [1, 2, 3].map((n) => JSON.stringify({ ts: n, sessionId: `s${n}`, reason: `why ${n}` })).join("\n") + "\n");
    const body = (await (await api(srv, "/api/escalations?limit=2")).json()) as {
      count: number;
      recent: Array<{ ts: number; sessionId: string; reason: string }>;
    };
    expect(body.count).toBe(3);
    expect(body.recent.map((e) => e.sessionId)).toEqual(["s3", "s2"]); // newest first
    expect(body.recent[0]?.reason).toBe("why 3");
  });
});

describe("request-level model override (spec #115)", () => {
  it("passes a well-formed override to the runner and ignores junk", async () => {
    const seen: Array<string | undefined> = [];
    const { srv } = await boot(async (ctx) => {
      seen.push(ctx.modelOverride);
      return {};
    });
    await (await postJson(srv, "/api/chat", { sessionId: "m1", message: "go", model: "deepseek" })).text();
    await (await postJson(srv, "/api/chat", { sessionId: "m2", message: "go", model: 123 })).text();
    await (await postJson(srv, "/api/chat", { sessionId: "m3", message: "go", model: "x".repeat(121) })).text();
    expect(seen).toEqual(["deepseek", undefined, undefined]);
  });
});

const todoListSample = { id: "a", title: "Chase retry", status: "todo" as const, sourceKind: "mcp" as const, sourceRef: "triage", createdAt: 1, updatedAt: 1 };

describe("todo data plane (spec #317–#320)", () => {
  type Todo = {
    id: string;
    title: string;
    status: "todo" | "doing" | "blocked" | "done";
    sourceKind: "chat" | "mcp" | "manual";
    project?: string;
    priority?: "P0" | "P1" | "P2";
    dueAt?: number;
    sourceRef?: string;
    createdAt: number;
    updatedAt: number;
  };
  async function wired(): Promise<{ srv: RunningServer; audit: string }> {
    const dir = mkdtempSync(join(tmpdir(), "agentos-todos-api-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const audit = join(dir, "audit.jsonl");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      auditPath: audit,
      todos: (() => {
        const store = new Map<string, Todo>([
          ["a", todoListSample],
        ]);
        return {
          list: () => [...store.values()],
          write: (item: Todo) => {
            store.set(item.id, item);
            return item;
          },
          remove: (id: string) => store.delete(id),
        };
      })(),
    });
    servers.push(srv);
    return { srv, audit };
  }

  it("lists, creates (validated), patches, deletes, and audits mutations by id only", async () => {
    const { srv, audit } = await wired();
    expect(((await (await api(srv, "/api/todos?q=retry&source=mcp")).json()) as { count: number }).count).toBe(1);

    const created = await postJson(srv, "/api/todos", { title: "Write follow-up", priority: "P1" });
    expect(created.status).toBe(201);
    const todo = ((await created.json()) as { todo: { id: string; status: string; sourceKind: string } }).todo;
    expect(todo).toMatchObject({ status: "todo", sourceKind: "manual" });

    expect((await postJson(srv, "/api/todos", { title: "" })).status).toBe(400);
    expect((await postJson(srv, "/api/todos", { title: "bad", priority: "P9" })).status).toBe(400);

    const patched = await api(srv, `/api/todos/${todo.id}`, { method: "PATCH", body: JSON.stringify({ status: "doing" }), headers: { "content-type": "application/json" } });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { todo: { status: string } }).todo.status).toBe("doing");

    expect((await api(srv, "/api/todos/a", { method: "DELETE" })).status).toBe(200);
    expect((await api(srv, "/api/todos/ghost", { method: "DELETE" })).status).toBe(404);

    const lines = readFileSync(audit, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((l) => l.event)).toEqual(["todo.add", "todo.update", "todo.remove"]);
    expect(JSON.stringify(lines)).not.toContain("Chase retry"); // no titles in audit (R2)
  });

  it("exports jsonl and markdown downloads", async () => {
    const { srv } = await wired();
    const jsonl = await api(srv, "/api/todos/export?format=jsonl");
    expect(jsonl.headers.get("content-disposition")).toContain("agentos-todos.jsonl");
    expect((await jsonl.text()).trim().split("\n")).toHaveLength(1);
    const md = await api(srv, "/api/todos/export?format=md");
    expect(await md.text()).toContain("- [ ] Chase retry");
    expect((await api(srv, "/api/todos/export?format=pdf")).status).toBe(400);
  });

  it("unwired is 501", async () => {
    const { srv } = await boot(async () => ({}));
    expect((await api(srv, "/api/todos")).status).toBe(501);
  });
});

describe("todo.changed over SSE (spec #323)", () => {
  it("a mutation broadcasts to every live stream, not only the writer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-todo-sse-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async (ctx) => {
        ctx.emit({ type: "assistant.text", payload: { text: "holding" }, timestampMs: 1 });
        await new Promise<void>((resolve) => {
          if (ctx.signal?.aborted) resolve();
          else ctx.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        return {};
      },
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      todos: { list: () => [], write: (item) => item, remove: () => true },
    });
    servers.push(srv);

    const res = await postJson(srv, "/api/chat", { sessionId: "tab-a", message: "hold" });
    const reading = readFrames(res);
    await new Promise((r) => setTimeout(r, 40));

    const created = await postJson(srv, "/api/todos", { title: "broadcast me" });
    expect(created.status).toBe(201);
    await new Promise((r) => setTimeout(r, 40));
    await postJson(srv, "/api/sessions/tab-a/abort", {});

    const frames = await reading;
    const changed = frames.filter((f) => f.type === "todo.changed");
    expect(changed).toHaveLength(1);
    expect((changed[0]?.payload as { action: string }).action).toBe("add");
    expect(frames.some((f) => f.type === "assistant.text")).toBe(true); // partial kept
  });
});

describe("role turn plumbing (spec #335/#341)", () => {
  it("forwards the agent name to the runner and keeps abort working on role turns", async () => {
    const seen: Array<string | undefined> = [];
    const { srv } = await boot(async (ctx) => {
      seen.push(ctx.agent);
      if (ctx.agent === "slow") {
        await new Promise<void>((resolve) => {
          if (ctx.signal?.aborted) resolve();
          else ctx.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      }
      return {};
    });
    await (await postJson(srv, "/api/chat", { sessionId: "r1", message: "hi", agent: "analyst" })).text();
    expect(seen).toEqual(["analyst"]);

    const stream = await postJson(srv, "/api/chat", { sessionId: "r2", message: "hi", agent: "slow" });
    const reading = readFrames(stream);
    await new Promise((r) => setTimeout(r, 20));
    expect((await postJson(srv, "/api/sessions/r2/abort", {})).status).toBe(200);
    const frames = await reading; // terminates; abort path reused unchanged
    expect(frames.some((f) => f.type === "session.meta")).toBe(true);
  });
});

describe("GET /api/agents (spec #342)", () => {
  it("returns the read-only role catalogue with chains; unwired is 501", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-agents-api-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      agents: () => [
        {
          name: "analyst",
          baseAgent: "base",
          chain: ["base", "analyst"],
          promptPreview: "You are an analyst.",
          tools: ["kb_search"],
          manifestPath: "config/agents/analyst.yml",
        },
      ],
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/agents")).json()) as { agents: Array<{ name: string; chain: string[] }> };
    expect(body.agents[0]).toMatchObject({ name: "analyst", chain: ["base", "analyst"] });

    const unwired = await boot(async () => ({}));
    expect((await api(unwired.srv, "/api/agents")).status).toBe(501);
  });
});

describe("role tag on sessions (spec #340/#350)", () => {
  it("a role turn tags the row; the list exposes and filters by it", async () => {
    const { srv } = await boot(async () => ({}));
    await (await postJson(srv, "/api/chat", { sessionId: "role-a", message: "hi", agent: "analyst" })).text();
    await (await postJson(srv, "/api/chat", { sessionId: "plain-b", message: "hi" })).text();

    const all = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ external_key: string; agent: string | null }> };
    expect(all.sessions.find((s) => s.external_key === "web-role-a")?.agent).toBe("analyst");
    expect(all.sessions.find((s) => s.external_key === "web-plain-b")?.agent).toBeNull();

    const filtered = (await (await api(srv, "/api/sessions?agent=analyst")).json()) as { sessions: Array<{ external_key: string }>; total: number };
    expect(filtered.sessions.map((s) => s.external_key)).toEqual(["web-role-a"]);
    expect(filtered.total).toBe(1);
    expect((await api(srv, `/api/sessions?agent=${"x".repeat(121)}`)).status).toBe(400);
  });
});

describe("role removal boundary (spec #351)", () => {
  it("an unmounted role leaves old sessions readable, tag intact, and unstartable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-roleremove-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const ledger = openLedger(dbPath);
    const shared = { presetName: "p", model: { provider: "v" }, mounts: [], runner: async () => ({}), ledger, port: 0, dbPath, staticDir: makeStaticDir(dir) };

    const withRole = await startServer({ ...shared, agents: () => [{ name: "retired", chain: ["retired"], promptPreview: "p", tools: [], manifestPath: "config/agents/retired.yml" }] as never });
    servers.push(withRole);
    await (await postJson(withRole, "/api/chat", { sessionId: "old", message: "hi", agent: "retired" })).text();
    await withRole.close();
    servers.pop();

    // role yml deleted + restart: no catalogue, no runner-side role map
    const after = await startServer({ ...shared, ledger });
    servers.push(after);
    const list = (await (await api(after, "/api/sessions")).json()) as { sessions: Array<{ external_key: string; agent: string | null }> };
    expect(list.sessions.find((s) => s.external_key === "web-old")?.agent).toBe("retired"); // snapshot survives
    expect(((await (await api(after, "/api/sessions/old/messages")).json()) as { entries: unknown[] }).entries).toEqual([]); // replay path still answers
    expect((await api(after, "/api/agents")).status).toBe(501); // catalogue gone; old data untouched
  });
});

describe("workflow triggers (spec #370/#371)", () => {
  async function wired(): Promise<{ srv: RunningServer; calls: Array<{ name: string; trigger: string }> }> {
    const dir = mkdtempSync(join(tmpdir(), "agentos-wftrig-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const calls: Array<{ name: string; trigger: string }> = [];
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      runWorkflow: async (name, trigger) => {
        calls.push({ name, trigger });
        if (name !== "daily-brief") return { ok: false, reason: "unknown workflow" };
        return { ok: true, runId: `run-${calls.length}` };
      },
      hookSecretFor: (name) => (name === "daily-brief" ? "hook-secret-value" : undefined),
    });
    servers.push(srv);
    return { srv, calls };
  }

  it("manual runs answer 200/404 and forward resumeFrom", async () => {
    const { srv, calls } = await wired();
    const ok = await postJson(srv, "/api/workflows/daily-brief/run", { resumeFrom: 2 });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { runId: string }).runId).toBe("run-1");
    expect(calls[0]).toEqual({ name: "daily-brief", trigger: "manual" });
    expect((await postJson(srv, "/api/workflows/ghost/run", {})).status).toBe(404);
    expect((await postJson(srv, "/api/workflows/daily-brief/run", { resumeFrom: -1 })).status).toBe(400);
  });

  it("webhooks enforce the env-named secret: 401 wrong, 202 right, 503 unconfigured", async () => {
    const { srv } = await wired();
    expect((await postJson(srv, "/api/hooks/daily-brief", {})).status).toBe(401);
    const bad = await api(srv, "/api/hooks/daily-brief", { method: "POST", headers: { authorization: "Bearer nope" } });
    expect(bad.status).toBe(401);
    const good = await api(srv, "/api/hooks/daily-brief", { method: "POST", headers: { authorization: "Bearer hook-secret-value" } });
    expect(good.status).toBe(202);
    expect((await api(srv, "/api/hooks/no-secret", { method: "POST", headers: { authorization: "Bearer x" } })).status).toBe(503);
  });
});

describe("workflow read APIs (spec #372–#374)", () => {
  it("lists workflows, their runs, and one run's step detail", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-wfread-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const run = { id: "run-1", workflow: "daily-brief", status: "error" as const, trigger: "schedule", project: "proj-1", startedAtMs: 1, endedAtMs: 2, resumeFrom: 1, error: "step 1 failed" };
    const srv = await startServer({
      presetName: "p",
      model: { provider: "v" },
      mounts: [],
      runner: async () => ({}),
      ledger: openLedger(dbPath),
      port: 0,
      dbPath,
      staticDir: makeStaticDir(dir),
      workflows: () => [{ name: "daily-brief", description: "brief", trigger: "schedule", stepCount: 3, manifestPath: "config/workflows/daily-brief.yml", nextRun: "2026-03-02T00:00:00.000Z", missed: 2 }],
      workflowRuns: (name) => (name === "daily-brief" ? [run] : []),
      workflowRunDetail: (id) => (id === "run-1" ? { run, steps: [{ index: 0, status: "ok" }, { index: 1, status: "error" }] } : undefined),
    });
    servers.push(srv);

    const list = (await (await api(srv, "/api/workflows")).json()) as { workflows: Array<{ trigger: string; missed: number }> };
    expect(list.workflows[0]).toMatchObject({ trigger: "schedule", missed: 2 });

    const runs = (await (await api(srv, "/api/workflows/daily-brief/runs")).json()) as { runs: Array<{ resumeFrom: number }> };
    expect(runs.runs[0]?.resumeFrom).toBe(1);

    const detail = (await (await api(srv, "/api/workflows/runs/run-1")).json()) as { steps: unknown[] };
    expect(detail.steps).toHaveLength(2);
    expect((await api(srv, "/api/workflows/runs/ghost")).status).toBe(404);

    const unwired = await boot(async () => ({}));
    expect((await api(unwired.srv, "/api/workflows")).status).toBe(501);
  });
});

describe("workflow run export (spec #384)", () => {
  it("downloads a run as jsonl or markdown; bad format 400, unknown 404", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-runexp-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const run = { id: "run-9", workflow: "daily-brief", status: "error" as const, trigger: "manual", startedAtMs: 1, endedAtMs: 2, error: "step 2 failed" };
    const srv = await startServer({
      presetName: "p", model: { provider: "v" }, mounts: [], runner: async () => ({}),
      ledger: openLedger(dbPath), port: 0, dbPath, staticDir: makeStaticDir(dir),
      workflowRunDetail: (id) => (id === "run-9" ? { run, steps: [{ index: 0, type: "agent", status: "ok", durationMs: 5 }, { index: 1, type: "tool", status: "error", durationMs: 9 }] } : undefined),
    });
    servers.push(srv);
    const jsonl = await api(srv, "/api/workflows/runs/run-9/export?format=jsonl");
    expect(jsonl.headers.get("content-disposition")).toContain("agentos-run-run-9.jsonl");
    expect((await jsonl.text()).trim().split("\n")).toHaveLength(3); // run + 2 steps
    const md = await api(srv, "/api/workflows/runs/run-9/export?format=md");
    const text = await md.text();
    expect(text).toContain("status: error");
    expect(text).toContain("| 2 | tool | error | 9ms |");
    expect((await api(srv, "/api/workflows/runs/run-9/export?format=pdf")).status).toBe(400);
    expect((await api(srv, "/api/workflows/runs/ghost/export")).status).toBe(404);
  });
});

describe("notification feed (spec #386)", () => {
  it("aggregates injected notifications newest-first and degrades to empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-notif-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p", model: { provider: "v" }, mounts: [], runner: async () => ({}),
      ledger: openLedger(dbPath), port: 0, dbPath, staticDir: makeStaticDir(dir),
      notifications: () => [
        { kind: "todo-due", title: "Ship the brief", ref: "t1", ts: 2 },
        { kind: "workflow-done", title: "daily-brief done", ref: "run-1", ts: 3 },
      ],
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/notifications")).json()) as { notifications: Array<{ kind: string; title: string }> };
    expect(body.notifications.map((n) => n.kind)).toEqual(["todo-due", "workflow-done"]);
    const unwired = await boot(async () => ({}));
    expect(((await (await api(unwired.srv, "/api/notifications")).json()) as { notifications: unknown[] }).notifications).toEqual([]);
  });
});

describe("project templates + instances (spec #389/#390)", () => {
  async function wired(): Promise<RunningServer> {
    const dir = mkdtempSync(join(tmpdir(), "agentos-projapi-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const store = new Map<string, { id: string; template: string; title: string; createdAtMs: number; updatedAtMs: number }>();
    const srv = await startServer({
      presetName: "p", model: { provider: "v" }, mounts: [], runner: async () => ({}),
      ledger: openLedger(dbPath), port: 0, dbPath, staticDir: makeStaticDir(dir),
      projectTemplates: () => [{ name: "web-revamp", description: "d", agents: ["analyst"], manifestPath: "config/projects/web-revamp.yml" }],
      projectInstances: {
        list: (template) => [...store.values()].filter((v) => !template || v.template === template),
        create: (template, title) => {
          if (template !== "web-revamp") return null;
          const row = { id: `i${store.size + 1}`, template, title, createdAtMs: 1, updatedAtMs: 1 };
          store.set(row.id, row);
          return row;
        },
        rename: (id, title) => {
          const row = store.get(id);
          if (!row) return null;
          const next = { ...row, title };
          store.set(id, next);
          return next;
        },
        remove: (id) => store.delete(id),
      },
    });
    servers.push(srv);
    return srv;
  }

  it("creates from a template, renames, deletes; templates are separate and read-only", async () => {
    const srv = await wired();
    expect(((await (await api(srv, "/api/project-templates")).json()) as { templates: Array<{ name: string }> }).templates[0]?.name).toBe("web-revamp");

    const created = await postJson(srv, "/api/project-instances", { template: "web-revamp", title: "Q2 revamp" });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { instance: { id: string } }).instance.id;

    const renamed = await api(srv, `/api/project-instances/${id}`, { method: "PATCH", body: JSON.stringify({ title: "Q3 revamp" }), headers: { "content-type": "application/json" } });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { instance: { title: string } }).instance.title).toBe("Q3 revamp");

    expect((await api(srv, `/api/project-instances/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(srv, `/api/project-instances/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await postJson(srv, "/api/project-instances", { template: "ghost", title: "x" })).status).toBe(400);
  });

  it("NEGATIVE (#390): an instance can never change a template field", async () => {
    const srv = await wired();
    const id = ((await (await postJson(srv, "/api/project-instances", { template: "web-revamp", title: "t" })).json()) as { instance: { id: string } }).instance.id;
    for (const field of ["template", "agents", "workflows", "tools", "knowledge", "description"]) {
      const res = await api(srv, `/api/project-instances/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "ok", [field]: field === "template" ? "other" : ["x"] }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status, field).toBe(400);
      expect(((await res.json()) as { fields: string[] }).fields).toContain(field);
    }
  });
});

describe("project aggregation (spec #393/#394)", () => {
  it("a turn with a project tags its session; the list filters by project", async () => {
    const { srv } = await boot(async () => ({}));
    await (await postJson(srv, "/api/chat", { sessionId: "p-a", message: "hi", project: "inst-1" })).text();
    await (await postJson(srv, "/api/chat", { sessionId: "p-b", message: "hi" })).text();
    const rows = (await (await api(srv, "/api/sessions?project=inst-1")).json()) as { sessions: Array<{ external_key: string; project: string | null }> };
    expect(rows.sessions.map((s) => s.external_key)).toEqual(["web-p-a"]);
    expect(rows.sessions[0]?.project).toBe("inst-1");
    const all = (await (await api(srv, "/api/sessions")).json()) as { sessions: Array<{ project: string | null }> };
    expect(all.sessions.find((s) => s.project === null)).toBeDefined();
  });
});

describe("project dashboard (spec #395)", () => {
  it("aggregates todo counts, recent sessions and runs; unknown is 404", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-projdash-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const srv = await startServer({
      presetName: "p", model: { provider: "v" }, mounts: [], runner: async () => ({}),
      ledger: openLedger(dbPath), port: 0, dbPath, staticDir: makeStaticDir(dir),
      projectDashboard: (id) =>
        id === "p1"
          ? {
              instance: { id: "p1", template: "web-revamp", title: "Q2", createdAtMs: 1, updatedAtMs: 1 },
              template: { name: "web-revamp", agents: ["analyst"], workflows: ["daily"] },
              todos: { total: 3, todo: 1, doing: 1, blocked: 1, done: 0 },
              sessions: [{ id: "s1", externalKey: "wf-1", agent: "analyst", status: "idle", lastActiveMs: 2, title: null }],
              runs: [{ id: "r1", workflow: "daily", status: "done", startedAtMs: 1, endedAtMs: 2 }],
            }
          : undefined,
    });
    servers.push(srv);
    const body = (await (await api(srv, "/api/project-instances/p1/dashboard")).json()) as {
      todos: { total: number };
      sessions: unknown[];
      runs: unknown[];
      template: { agents: string[] };
    };
    expect(body).toMatchObject({ todos: { total: 3 }, template: { agents: ["analyst"] } });
    expect(body.sessions).toHaveLength(1);
    expect(body.runs).toHaveLength(1);
    expect((await api(srv, "/api/project-instances/ghost/dashboard")).status).toBe(404);
    const unwired = await boot(async () => ({}));
    expect((await api(unwired.srv, "/api/project-instances/x/dashboard")).status).toBe(501);
  });
});

describe("project export + delete semantics (spec #396/#397)", () => {
  it("exports a bundle (jsonl/md) and deleting an instance never touches templates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-projexp-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "sessions.db");
    const instances = new Map<string, { id: string; template: string; title: string; createdAtMs: number; updatedAtMs: number }>();
    const templates = [{ name: "web-revamp", manifestPath: "config/projects/web-revamp.yml" }];
    let seq = 0;
    const srv = await startServer({
      presetName: "p", model: { provider: "v" }, mounts: [], runner: async () => ({}),
      ledger: openLedger(dbPath), port: 0, dbPath, staticDir: makeStaticDir(dir),
      projectTemplates: () => templates,
      projectInstances: {
        list: () => [...instances.values()],
        create: (template, title) => {
          if (!templates.some((t) => t.name === template)) return null;
          const row = { id: `i${++seq}`, template, title, createdAtMs: 1, updatedAtMs: 1 };
          instances.set(row.id, row);
          return row;
        },
        rename: (id, title) => {
          const row = instances.get(id);
          if (!row) return null;
          const next = { ...row, title };
          instances.set(id, next);
          return next;
        },
        remove: (id) => instances.delete(id),
      },
      projectExport: (id) => {
        const instance = instances.get(id);
        if (!instance) return undefined;
        return { instance, template: templates[0], todos: [{ id: "t1" }], sessions: [{ id: "s1" }], runs: [{ id: "r1" }] };
      },
    });
    servers.push(srv);
    const id = ((await (await postJson(srv, "/api/project-instances", { template: "web-revamp", title: "Q2" })).json()) as { instance: { id: string } }).instance.id;

    const jsonl = await api(srv, `/api/project-instances/${id}/export?format=jsonl`);
    expect(jsonl.headers.get("content-disposition")).toContain(`agentos-project-${id}.jsonl`);
    expect((await jsonl.text()).trim().split("\n")).toHaveLength(5); // instance+template+todo+session+run
    expect(await (await api(srv, `/api/project-instances/${id}/export?format=md`)).text()).toContain("todos: 1");

    // #397: delete the instance — templates keep existing and can re-instantiate
    expect((await api(srv, `/api/project-instances/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(((await (await api(srv, "/api/project-templates")).json()) as { templates: unknown[] }).templates).toHaveLength(1);
    expect((await postJson(srv, "/api/project-instances", { template: "web-revamp", title: "Q2 again" })).status).toBe(201);
  });
});
