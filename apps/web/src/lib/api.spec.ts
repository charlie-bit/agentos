/**
 * spec #219 — the REST client must treat non-2xx as failure. Before this,
 * jget/jpost/rename/delete/chat parsed 500 bodies as if they were successful
 * payloads, so a broken server looked like an empty result.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, deleteSession, getSessions, getStatus, HttpError, renameSession } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(status: number, body: string): void {
  globalThis.fetch = vi.fn(async () => new Response(body, { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("api client HTTP status handling (#219)", () => {
  it("resolves a 200 payload", async () => {
    stubFetch(200, JSON.stringify({ sessions: [] }));
    await expect(getSessions()).resolves.toEqual({ sessions: [] });
  });

  it("rejects a 500 instead of parsing its body as success", async () => {
    stubFetch(500, JSON.stringify({ error: "internal" }));
    await expect(getSessions()).rejects.toBeInstanceOf(HttpError);
    await expect(getSessions()).rejects.toMatchObject({ status: 500, path: "/api/sessions" });
  });

  it("rejects on every verb: rename, delete, status, chat", async () => {
    stubFetch(503, "");
    await expect(renameSession("id", "t")).rejects.toMatchObject({ status: 503 });
    await expect(deleteSession("id")).rejects.toMatchObject({ status: 503 });
    await expect(getStatus("s")).rejects.toMatchObject({ status: 503 });
    await expect(chat("s", "hi", () => undefined)).rejects.toMatchObject({ status: 503 });
  });

  it("a 404 for a vanished session is a rejection the caller can act on", async () => {
    stubFetch(404, JSON.stringify({ error: "session not found" }));
    await expect(deleteSession("gone")).rejects.toMatchObject({ status: 404 });
  });
});
