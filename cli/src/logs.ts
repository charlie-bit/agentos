/**
 * Operational log + redaction (spec #124/#292). This is NOT the kernel's own
 * stdout/stderr: stdio MCP servers are spawned inside the kernel, so their
 * stderr never crosses this process. What lands here is what this process
 * knows — turn lifecycle, failures, degraded mounts — written as metadata.
 *
 * Redaction law (R2): before any line is persisted, credential-shaped tokens
 * and the VALUES of key/token/secret-looking env vars are replaced with ***.
 * Content (prompts, replies, tool payloads) never reaches this writer.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Names whose VALUES must never appear even if logged by accident. */
function secretValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([k, v]) => typeof v === "string" && v.length >= 8 && /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(k))
    .map(([, v]) => v as string);
}

export function redactSecrets(line: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = line
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "***")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer ***");
  for (const value of secretValues(env)) out = out.split(value).join("***");
  return out;
}

export function logsDir(repoRoot: string): string {
  return join(repoRoot, ".agentos", "logs");
}

/** Append one metadata line; failures are silent (a log must never kill work). */
export function appendLog(repoRoot: string, name: string, record: Record<string, unknown>): void {
  try {
    const dir = logsDir(repoRoot);
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: Date.now(), ...record });
    appendFileSync(join(dir, `${name.replace(/[^A-Za-z0-9._-]+/g, "_")}.log`), redactSecrets(line) + "\n", "utf8");
  } catch {
    /* logging is best-effort, always */
  }
}

export interface LogFile {
  name: string;
  lines: string[];
}

/** Tail of every operational log, bounded, redacted again on read (defence in depth). */
export function readLogs(repoRoot: string, lines = 100): LogFile[] {
  const dir = logsDir(repoRoot);
  if (!existsSync(dir)) return [];
  const cap = Math.min(500, Math.max(1, Math.trunc(lines)));
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".log"))
      .sort()
      .map((name) => {
        const raw = readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean);
        return { name, lines: raw.slice(-cap).map((l) => redactSecrets(l)) };
      });
  } catch {
    return [];
  }
}
