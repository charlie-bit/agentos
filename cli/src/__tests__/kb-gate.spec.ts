/**
 * spec #229 — kb gate's gate loader no longer takes an unused clock. These
 * tests pin the observable contract instead: manifest gate values are read,
 * the default applies when absent, and the window filter uses the injected
 * clock (the only clock the command legitimately needs).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GATE, runKbGate } from "../kb-gate.js";

const roots: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-kb-gate-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

const DAY = 86_400_000;

describe("kb gate (#229)", () => {
  it("uses manifest escalationGate values when present", () => {
    const root = temp();
    mkdirSync(join(root, "config", "knowledge"), { recursive: true });
    writeFileSync(
      join(root, "config", "knowledge", "k.yml"),
      ["kind: knowledge", 'version: "1"', "name: k", "provider: markdown", "mount: { type: path, path: ./kb }", "escalationGate: { minPerWeek: 1, windowDays: 30 }", ""].join("\n"),
    );
    const now = Date.now();
    const r = runKbGate(join(root, "config"), join(root, "none.log"), () => now);
    expect(r.exitCode).toBe(0);
    expect(r.lines[0]).toContain("(30d)");
    expect(r.lines[1]).toContain("k.yml");
  });

  it("falls back to the documented default gate", () => {
    const root = temp();
    const now = Date.now();
    const r = runKbGate(join(root, "config"), join(root, "none.log"), () => now);
    expect(r.lines[0]).toContain(`/${DEFAULT_GATE.minPerWeek} (${DEFAULT_GATE.windowDays}d)`);
    expect(r.lines[1]).toContain("default");
  });

  it("counts only escalations inside the window", () => {
    const root = temp();
    const log = join(root, "esc.log");
    const now = Date.now();
    writeFileSync(
      log,
      [JSON.stringify({ ts: now - 1 * DAY }), JSON.stringify({ ts: now - 100 * DAY })].join("\n") + "\n",
    );
    const r = runKbGate(join(root, "config"), log, () => now);
    expect(r.lines[0]).toContain("1/3");
    expect(r.lines.join("\n")).toContain("1 条在窗口外");
  });
});
