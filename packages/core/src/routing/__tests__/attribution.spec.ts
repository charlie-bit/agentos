/**
 * spec #209 — the manifest's usageAttr (costCenter/team) and the tenant label
 * are no longer dead wiring: they land in usage.log, one JSONL line per turn,
 * and never carry a credential shape (R2/R9).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendAttribution, formatAttributionLine, type Attribution } from "../attribution.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

function record(overrides: Partial<Attribution> = {}): Attribution {
  return {
    tsMs: 1_700_000_000_000,
    preset: "triage-demo",
    session: "web-1",
    tenant: "triage-demo",
    manifest: "deepseek",
    provider: "deepseek",
    alias: "general",
    modelId: "deepseek-chat",
    attr: { costCenter: "platform-eng", team: "sre" },
    usage: { input: 120, output: 30 },
    costUsd: 0.0021,
    ...overrides,
  };
}

describe("usage attribution (#209)", () => {
  it("the JSONL line carries tenant + manifest usageAttr", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-usage-"));
    roots.push(dir);
    const path = join(dir, "usage.log");
    appendAttribution(record(), path);
    const line = JSON.parse(readFileSync(path, "utf8").trim()) as Record<string, unknown>;
    expect(line.tenant).toBe("triage-demo");
    expect(line.attr).toEqual({ costCenter: "platform-eng", team: "sre" });
    expect(line.manifest).toBe("deepseek");
    expect(line.usage).toEqual({ input: 120, output: 30 });
  });

  it("a line without usageAttr simply omits the field (absent ≠ empty guess)", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-usage-"));
    roots.push(dir);
    const path = join(dir, "usage.log");
    appendAttribution(record({ attr: undefined }), path);
    const line = JSON.parse(readFileSync(path, "utf8").trim()) as Record<string, unknown>;
    expect("attr" in line).toBe(false);
  });

  it("formatting never invents fields and stays human-readable", () => {
    expect(formatAttributionLine(record())).toContain("deepseek/general→deepseek-chat");
    expect(formatAttributionLine(record({ alias: undefined, modelId: undefined }))).toContain("kernel-default");
  });
});
