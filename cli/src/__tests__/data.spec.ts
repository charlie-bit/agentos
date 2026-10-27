/**
 * spec #161/#162 — data export/import/gc. Temp dirs only; the repo's own
 * .agentos is never touched (the tests chdir into a sandbox).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLedger } from "@agentos/core";
import { runDataExport, runDataGc, runDataImport } from "../data.js";

const dirs: string[] = [];
const cwd = process.cwd();
afterEach(() => {
  process.chdir(cwd);
  delete process.env.AGENTOS_SESSION_DB;
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-data-"));
  dirs.push(dir);
  process.chdir(dir);
  process.env.AGENTOS_SESSION_DB = join(dir, ".agentos", "sessions.db");
  mkdirSync(join(dir, ".agentos", "kb-drafts"), { recursive: true });
  return dir;
}

describe("data export/import (#161)", () => {
  it("round-trips sessions + drafts idempotently", () => {
    const dir = sandbox();
    const ledger = openLedger(join(dir, ".agentos", "sessions.db"));
    const row = ledger.createSession({ entry: "rest", externalKey: "web-a", preset: "p" });
    ledger.setTitle(row.id, "Alpha");
    ledger.close();
    writeFileSync(join(dir, ".agentos", "kb-drafts", "r1.md"), "draft body");
    writeFileSync(join(dir, ".agentos", "usage.log"), '{"tsMs":1}\n');

    expect(runDataExport(["bundle.json"]).exitCode).toBe(0);
    const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as { sessions: unknown[]; note: string };
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.note).toContain("transcripts are NOT");

    // import into a fresh .agentos: restores the row and the draft
    rmSync(join(dir, ".agentos"), { recursive: true, force: true });
    expect(runDataImport(["bundle.json"]).exitCode).toBe(0);
    const restored = openLedger(join(dir, ".agentos", "sessions.db"));
    expect(restored.getByExternalKey("web-a")?.title).toBe("Alpha");
    restored.close();
    expect(readFileSync(join(dir, ".agentos", "kb-drafts", "r1.md"), "utf8")).toBe("draft body");

    // idempotent: a second import does not duplicate
    expect(runDataImport(["bundle.json"]).lines.join("\n")).toContain("imported 0");
  });

  it("rejects a non-bundle file", () => {
    sandbox();
    writeFileSync("bad.json", "{\"nope\":1}");
    expect(runDataImport(["bad.json"]).exitCode).toBe(1);
  });
});

describe("data gc (#162)", () => {
  it("removes only aged files in drafts/logs/workspaces, and supports dry-run", () => {
    const dir = sandbox();
    mkdirSync(join(dir, ".agentos", "logs"), { recursive: true });
    mkdirSync(join(dir, ".agentos", "workspaces", "k"), { recursive: true });
    const old = join(dir, ".agentos", "kb-drafts", "old.md");
    const fresh = join(dir, ".agentos", "kb-drafts", "fresh.md");
    writeFileSync(old, "x");
    writeFileSync(fresh, "y");
    writeFileSync(join(dir, ".agentos", "logs", "serve.log"), "l");
    writeFileSync(join(dir, ".agentos", "workspaces", "k", "f.txt"), "w");
    const ancient = Date.now() / 1000 - 90 * 86_400;
    for (const p of [old, join(dir, ".agentos", "logs", "serve.log"), join(dir, ".agentos", "workspaces", "k", "f.txt")]) {
      utimesSync(p, ancient, ancient);
    }

    const dry = runDataGc(["--keep-days", "30", "--dry-run"]);
    expect(dry.lines.join("\n")).toContain("would remove 3");
    expect(readFileSync(old, "utf8")).toBe("x"); // dry run touched nothing

    const real = runDataGc(["--keep-days", "30"]);
    expect(real.lines.join("\n")).toContain("removed 3");
    expect(readFileSync(fresh, "utf8")).toBe("y"); // fresh draft survives
  });
});

describe("gc sweeps completed todos only (spec #327)", () => {
  it("deletes done todos older than the window, keeps open ones", async () => {
    const dir = sandbox();
    const ledger = openLedger(join(dir, ".agentos", "sessions.db"));
    const old = Date.now() - 90 * 86_400_000;
    ledger.todoWrite({ id: "done-old", title: "old done", status: "done", sourceKind: "manual", createdAt: old, updatedAt: old });
    ledger.todoWrite({ id: "done-new", title: "new done", status: "done", sourceKind: "manual", createdAt: Date.now(), updatedAt: Date.now() });
    ledger.todoWrite({ id: "open-old", title: "open old", status: "todo", sourceKind: "manual", createdAt: old, updatedAt: old });
    ledger.close();

    const check = openLedger(join(dir, ".agentos", "sessions.db"));
    expect(check.todoList({ status: "done" }).map((t) => t.id).sort()).toEqual(["done-new", "done-old"]);
    check.close();

    expect(runDataGc(["--keep-days", "30"]).lines.join("\n")).toContain("todo:done-old");
    const after = openLedger(join(dir, ".agentos", "sessions.db"));
    expect(after.todoList().map((t) => t.id).sort()).toEqual(["done-new", "open-old"]);
    after.close();
  });
});
