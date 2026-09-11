/**
 * Ledger lifecycle on a throwaway sqlite file per test — the default path
 * resolution (env lease) is asserted separately, never against the repo db.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ledgerPathFromEnv, openLedger, type Ledger } from "../index.js";

const tempDirs: string[] = [];
function freshLedger(): Ledger {
  const dir = mkdtempSync(join(tmpdir(), "agentos-ledger-"));
  tempDirs.push(dir);
  return openLedger(join(dir, "sessions.db"));
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

describe("ledger lifecycle", () => {
  it("creates, reads back, and updates every pointer field", () => {
    const led = freshLedger();
    const created = led.createSession({ entry: "smoke", externalKey: "p2-smoke", preset: "example" });
    expect(created.status).toBe("running");
    expect(created.sdkSessionId).toBeNull();

    const fetched = led.getByExternalKey("p2-smoke");
    expect(fetched?.id).toBe(created.id);

    led.setSdkSessionId(created.id, "sdk-abc-123");
    led.markStatus(created.id, "idle");
    const updated = led.getByExternalKey("p2-smoke");
    expect(updated?.sdkSessionId).toBe("sdk-abc-123");
    expect(updated?.status).toBe("idle");

    const before = updated?.lastActiveMs ?? 0;
    led.touch(created.id);
    const after = led.getByExternalKey("p2-smoke");
    expect(after?.lastActiveMs ?? 0).toBeGreaterThanOrEqual(before);
    led.close();
  });

  it("external_key is unique — a second create with the same key throws", () => {
    const led = freshLedger();
    led.createSession({ entry: "e", externalKey: "dup", preset: "p" });
    expect(() => led.createSession({ entry: "e", externalKey: "dup", preset: "p" })).toThrow();
    led.close();
  });

  it("status enum is enforced at the storage layer and at the API", () => {
    const led = freshLedger();
    const row = led.createSession({ entry: "e", externalKey: "k", preset: "p" });
    expect(() => led.markStatus(row.id, "exploded" as never)).toThrow(/unknown session status/);
    led.close();
  });

  it("operations on unknown ids fail loudly, not silently", () => {
    const led = freshLedger();
    expect(() => led.markStatus("no-such-id", "idle")).toThrow(/session not found/);
    expect(() => led.touch("no-such-id")).toThrow(/session not found/);
    led.close();
  });

  it("data survives reopen — the ledger is a disk artifact, not memory", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-ledger-"));
    tempDirs.push(dir);
    const path = join(dir, "sessions.db");
    const first = openLedger(path);
    first.createSession({ entry: "e", externalKey: "persist", preset: "p" });
    first.close();
    const second = openLedger(path);
    expect(second.getByExternalKey("persist")).toBeDefined();
    second.close();
  });
});

describe("session title", () => {
  it("defaults to null, then can be set and read back", () => {
    const led = freshLedger();
    const row = led.createSession({ entry: "e", externalKey: "k", preset: "p" });
    expect(row.title).toBeNull();
    led.setTitle(row.id, "Ledger outage 09-11");
    expect(led.getByExternalKey("k")?.title).toBe("Ledger outage 09-11");
    led.close();
  });

  it("empty or whitespace-only clears the title back to null", () => {
    const led = freshLedger();
    const row = led.createSession({ entry: "e", externalKey: "k", preset: "p" });
    led.setTitle(row.id, "named");
    led.setTitle(row.id, "   ");
    expect(led.getByExternalKey("k")?.title).toBeNull();
    led.close();
  });

  it("trims and caps length, unknown id fails loudly", () => {
    const led = freshLedger();
    const row = led.createSession({ entry: "e", externalKey: "k", preset: "p" });
    led.setTitle(row.id, "  padded  ");
    expect(led.getByExternalKey("k")?.title).toBe("padded");
    led.setTitle(row.id, "x".repeat(500));
    expect(led.getByExternalKey("k")?.title).toHaveLength(200);
    expect(() => led.setTitle("no-such-id", "t")).toThrow(/session not found/);
    led.close();
  });

  it("existing rows from before the title column existed still open fine", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-ledger-"));
    tempDirs.push(dir);
    const path = join(dir, "sessions.db");
    const first = openLedger(path);
    const row = first.createSession({ entry: "e", externalKey: "pre-migration", preset: "p" });
    first.close();
    // Re-opening the same file simulates the ALTER TABLE migration path on an
    // already-existing sessions table — must not throw, title stays readable.
    const second = openLedger(path);
    expect(second.getByExternalKey("pre-migration")?.title).toBeNull();
    second.setTitle(row.id, "renamed after migration");
    expect(second.getByExternalKey("pre-migration")?.title).toBe("renamed after migration");
    second.close();
  });
});

describe("deleteSession", () => {
  it("removes the row; a second delete or any op on it fails loudly", () => {
    const led = freshLedger();
    const row = led.createSession({ entry: "e", externalKey: "gone", preset: "p" });
    led.deleteSession(row.id);
    expect(led.getByExternalKey("gone")).toBeUndefined();
    expect(() => led.deleteSession(row.id)).toThrow(/session not found/);
    expect(() => led.touch(row.id)).toThrow(/session not found/);
    led.close();
  });

  it("deleting one row leaves the others untouched", () => {
    const led = freshLedger();
    const a = led.createSession({ entry: "e", externalKey: "a", preset: "p" });
    const b = led.createSession({ entry: "e", externalKey: "b", preset: "p" });
    led.deleteSession(a.id);
    expect(led.getByExternalKey("a")).toBeUndefined();
    expect(led.getByExternalKey("b")?.id).toBe(b.id);
    led.close();
  });
});

describe("ledgerPathFromEnv", () => {
  it("prefers AGENTOS_SESSION_DB verbatim", () => {
    expect(ledgerPathFromEnv({ AGENTOS_SESSION_DB: "/somewhere/led.db" })).toBe("/somewhere/led.db");
  });

  it("falls back to .agentos/sessions.db resolved to an absolute path", () => {
    const p = ledgerPathFromEnv({});
    expect(p.endsWith(join(".agentos", "sessions.db"))).toBe(true);
    expect(p.startsWith("/")).toBe(true);
  });
});
