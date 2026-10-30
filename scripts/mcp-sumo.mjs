#!/usr/bin/env node
/**
 * Sumo Logic MCP launcher.
 *
 * `mcp-sumologic` ships its server as the package `main` with NO `bin` entry,
 * so `npx mcp-sumologic` cannot run it ("could not determine executable").
 * This launcher is the missing bin: the package's main module starts a stdio
 * MCP server on import, so importing it is the whole program.
 *
 * Credentials: the server reads SUMO_API_ID / SUMO_API_KEY (+ ENDPOINT) from
 * the environment. To keep that config local without a manual export step,
 * this launcher falls back to ~/.sumologic.env (the conventional location for
 * Sumo access keys) and maps the names Sumo's CLI docs use onto the names the
 * server expects. An already-set variable always wins — nothing here overrides
 * an explicit deployment, and no value is read, logged or forwarded by this
 * file; process.loadEnvFile puts it in the child's environment.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOCAL_ENV = join(homedir(), ".sumologic.env");
if (!process.env.SUMO_API_ID && existsSync(LOCAL_ENV)) {
  // Small dotenv reader rather than process.loadEnvFile: the conventional
  // Sumo file uses shell syntax (`export KEY=value`), which loadEnvFile refuses.
  // An already-set variable wins; values are never logged.
  try {
    for (const line of readFileSync(LOCAL_ENV, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m?.[1]) continue;
      let value = m[2] ?? "";
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      process.env[m[1]] ??= value;
    }
  } catch {
    // unreadable local file: leave the environment as-is and let the server
    // report the missing credential itself.
  }
  process.env.SUMO_API_ID ??= process.env.SUMO_ACCESS_ID;
  process.env.SUMO_API_KEY ??= process.env.SUMO_ACCESS_KEY;
}

// The server requires an API endpoint (the org's region: api.<region>.sumologic.com).
// It has no usable default, so hand it whatever the environment declares.
const endpoint = process.env.SUMO_ENDPOINT ?? process.env.ENDPOINT;
if (endpoint && !process.argv.includes("--endpoint")) process.argv.push("--endpoint", endpoint);

await import("mcp-sumologic");
