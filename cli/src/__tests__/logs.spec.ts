/**
 * spec #124/#292 — the operational log exists to diagnose a deployment
 * without ever persisting a secret or conversation content (R2).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendLog, logsDir, readLogs, redactSecrets } from "../logs.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "agentos-logs-"));
  roots.push(dir);
  return dir;
};

describe("redaction (R2)", () => {
  it("strips credential-shaped tokens and env values by name", () => {
    const env = { AGENTOS_DEEPSEEK_API_KEY: "sk-live-abcdef123456" };
    const line = 'error from https://x?key=sk-live-abcdef123456 header Authorization: Bearer abcdef1234567890';
    const out = redactSecrets(line, env);
    expect(out).not.toContain("abcdef123456");
    expect(out).toContain("***");
  });
});

describe("append/read (spec #124)", () => {
  it("writes metadata lines and reads a bounded tail", () => {
    const root = temp();
    for (let i = 0; i < 10; i += 1) appendLog(root, "serve", { event: "turn", n: i });
    const files = readLogs(root, 3);
    expect(files).toHaveLength(1);
    expect(files[0]?.lines).toHaveLength(3);
    expect(files[0]?.lines.at(-1)).toContain('"n":9');
    const raw = readFileSync(join(logsDir(root), "serve.log"), "utf8");
    expect(raw.split("\n").filter(Boolean)).toHaveLength(10);
  });

  it("a secret in the record is redacted before it hits disk", () => {
    const root = temp();
    appendLog(root, "serve", { event: "boot", note: "token sk-should-not-land-123456" });
    const raw = readFileSync(join(logsDir(root), "serve.log"), "utf8");
    expect(raw).not.toContain("sk-should-not-land");
  });
});
