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
import { startServer, type RunningServer, type TurnRunner } from "@agentos/entry-rest";

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

async function boot(runner: TurnRunner): Promise<{ srv: RunningServer; dbPath: string; escPath: string }> {
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

describe("out-of-band confirm", () => {
  it("pushes confirm.request, POST resolves it", async () => {
    let confirmResult = "";
    const { srv } = await boot(async ({ emit, confirm }) => {
      const r = await confirm({ prompt: "Commit the draft?", timeoutMs: 4000 });
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
    const after = (await (await api(srv, "/api/status")).json()) as { lastDrift: unknown };
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
