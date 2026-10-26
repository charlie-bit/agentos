/**
 * spec #222 — entry-rest keeps an IN-PACKAGE regression suite for its own
 * routes, so a change here fails here first instead of only in conformance.
 * Offline: stub runner, temp ledger, ephemeral port.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLedger } from "@agentos/core";
import { startServer, type RunningServer } from "../index.js";

const dirs: string[] = [];
const servers: RunningServer[] = [];

async function boot(): Promise<RunningServer> {
  const dir = mkdtempSync(join(tmpdir(), "agentos-rest-pkg-"));
  dirs.push(dir);
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>web</title>");
  const dbPath = join(dir, "sessions.db");
  const srv = await startServer({
    presetName: "pkg",
    model: { provider: "v" },
    mounts: [],
    runner: async () => ({}),
    ledger: openLedger(dbPath),
    port: 0,
    dbPath,
    staticDir: dist,
  });
  servers.push(srv);
  return srv;
}

const call = (srv: RunningServer, path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${srv.port}${path}`, init);
const post = (srv: RunningServer, path: string, body: unknown) =>
  call(srv, path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

describe("entry-rest package routes (#222)", () => {
  it("healthz, status, and the session list", async () => {
    const srv = await boot();
    expect((await call(srv, "/healthz")).status).toBe(200);
    expect(((await (await call(srv, "/api/status")).json()) as { preset: string }).preset).toBe("pkg");
    expect(((await (await call(srv, "/api/sessions")).json()) as { sessions: unknown[] }).sessions).toEqual([]);
  });

  it("title rename + delete round-trip", async () => {
    const srv = await boot();
    await (await post(srv, "/api/chat", { sessionId: "r1", message: "hi" })).text();
    const id = ((await (await call(srv, "/api/sessions")).json()) as { sessions: Array<{ id: string }> }).sessions[0]!.id;

    const renamed = await call(srv, `/api/sessions/${id}/title`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed" }),
      headers: { "content-type": "application/json" },
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()) as unknown).toEqual({ ok: true, title: "Renamed" });
    expect((await call(srv, `/api/sessions/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(((await (await call(srv, "/api/sessions")).json()) as { sessions: unknown[] }).sessions).toEqual([]);
  });

  it("messages route is read-only and answers [] without a transcript reader", async () => {
    const srv = await boot();
    const res = await call(srv, "/api/sessions/anything/messages");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ entries: [] });
    expect((await post(srv, "/api/sessions/anything/messages", {})).status).toBe(404);
  });
});
