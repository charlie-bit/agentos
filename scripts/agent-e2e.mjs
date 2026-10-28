#!/usr/bin/env node
/**
 * Agent conversation E2E — drives the REAL web API (`POST /api/chat`, SSE)
 * against a generated offline preset that mounts `scripts/fixtures/e2e-mcp-server.mjs`.
 *
 * Why generated config: a chat with nothing mounted tests nothing (the agent
 * has no capabilities), so the harness builds its own config tree in a temp
 * dir: one deterministic MCP server, the repo's knowledge socket, and the
 * model lease from the environment. Nothing in config/ is touched.
 *
 * What it proves, per case:
 *   - the boundary holds (session.init advertises Read + mounted tools only)
 *   - a tool actually executes and its output reaches the model
 *   - tool failure surfaces as a tool error, not a silent success
 *   - todo_add writes through to the data plane
 *   - a second turn in the same session remembers the first (resume)
 *
 * Requires a real model lease: AGENTOS_DEEPSEEK_ANTHROPIC_BASE_URL +
 * AGENTOS_DEEPSEEK_API_KEY (or --env-file=.env). Exits 2 without it.
 *
 * Usage:
 *   node --env-file=.env scripts/agent-e2e.mjs [--keep] [--verbose] [--case <name>]
 * Exit: 0 all cases passed; 1 assertion failure; 2 setup/usage.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The relay in front of the model needs its own prefixed id (env override). */
const MODEL_ID = process.env.AGENTOS_E2E_MODEL ?? "alicloud/deepseek-v4.1-flash-1017";
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const verbose = args.includes("--verbose");
const only = (() => {
  const i = args.indexOf("--case");
  return i >= 0 ? args[i + 1] : null;
})();

const say = (s) => process.stdout.write(s + "\n");
const die = (code, s) => {
  say(`✗ ${s}`);
  process.exit(code);
};

if (!process.env.AGENTOS_DEEPSEEK_API_KEY || !process.env.AGENTOS_DEEPSEEK_ANTHROPIC_BASE_URL) {
  die(2, "model lease missing: run with --env-file=.env (needs AGENTOS_DEEPSEEK_*), or export both vars");
}

/** A fresh config root: one model, one knowledge mount, one fixture tool. */
function makeConfigRoot() {
  const dir = mkdtempSync(join(tmpdir(), "agentos-e2e-"));
  for (const sub of ["models", "knowledge", "tools", "presets"]) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(
    join(dir, "models", "e2e-model.yml"),
    [
      "kind: model",
      'version: "1"',
      "name: e2e-model",
      "provider: deepseek",
      "baseUrlEnv: AGENTOS_DEEPSEEK_ANTHROPIC_BASE_URL",
      "credentialsEnv: AGENTOS_DEEPSEEK_API_KEY",
      `models: { general: ${MODEL_ID} }`,
      "fallbackChain: [general]",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "knowledge", "e2e-kb.yml"),
    ["kind: knowledge", 'version: "1"', "name: e2e-kb", "provider: markdown", "mount: { type: path, path: " + JSON.stringify(join(repoRoot, "knowledge-base")) + " }", ""].join("\n"),
  );
  writeFileSync(
    join(dir, "tools", "fixture.yml"),
    [
      "# E2E fixture: a real external MCP process, deterministic tools.",
      "kind: tool",
      'version: "1"',
      "name: fixture",
      "transport: stdio",
      "command: node ${AGENTOS_REPO_ROOT}/scripts/fixtures/e2e-mcp-server.mjs",
      "auth: { mode: none }",
      "allowedTools: [echo, fail, tally]",
      "idempotent: { default: true, overrides: { tally: false } }",
      "schemaExchange: json-schema",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "presets", "e2e.yml"),
    ["kind: preset", 'version: "1"', "name: e2e", "knowledge: e2e-kb", "model: e2e-model", "tools: [fixture]", "entry: cli", ""].join("\n"),
  );
  return dir;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(configRoot, port) {
  const dbPath = join(configRoot, "sessions.db");
  const child = spawn(
    process.execPath,
    ["cli/main.mjs", "serve", "--web", "--no-token", "--port", String(port), "--preset", join(configRoot, "presets", "e2e.yml")],
    {
      cwd: repoRoot,
      env: { ...process.env, AGENTOS_SESSION_DB: dbPath, AGENTOS_FS_ROOT: repoRoot, AGENTOS_REPO_ROOT: repoRoot },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) return { child, base, error: `server exited:\n${log.slice(-800)}` };
    try {
      const res = await fetch(base + "/api/status");
      if (res.ok) return { child, base, log: () => log };
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  child.kill("SIGTERM");
  return { child, base, error: `server did not answer in 30s:\n${log.slice(-800)}` };
}

/** POST /api/chat and collect the SSE frames until the stream closes. */
async function chat(base, sessionId, message, timeoutMs = Number(process.env.AGENTOS_E2E_TURN_TIMEOUT_MS ?? 180_000)) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`/api/chat answered ${res.status}`);
    const events = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch {
            /* keepalive/comment or truncated frame */
          }
        }
      }
    }
    return events;
  } finally {
    clearTimeout(timer);
  }
}

const toolsOf = (events) => events.filter((e) => e.type === "tool.call").map((e) => String(e.payload?.tool ?? ""));
const textsOf = (events) => events.filter((e) => e.type === "assistant.text").map((e) => String(e.payload?.text ?? "")).join(" ");
const initOf = (events) => events.find((e) => e.type === "session.init")?.payload ?? {};
const resultsOf = (events) => events.filter((e) => e.type === "tool.result");

const matches = (haystack, needles) => needles.some((n) => haystack.toLowerCase().includes(n.toLowerCase()));

function check(name, cond, detail) {
  if (cond) return null;
  return `${name}: ${detail}`;
}

const CASES = [
  {
    name: "boundary",
    message: "Which tools do you actually have in this session? List their names only.",
    expect: (events) => {
      const surface = (initOf(events).tools ?? []).map(String);
      const builtins = ["Bash", "Write", "Edit", "WebFetch", "WebSearch", "Task"];
      return [
        check("init advertises Read", surface.includes("Read"), "session.init has no Read"),
        check("mounted tool advertised", surface.some((t) => t.includes("fixture__echo")), `session.init: ${surface.join(",")}`),
        check(
          "no builtin shell/write tools",
          !builtins.some((b) => surface.includes(b)),
          `session.init leaks a builtin: ${surface.join(",")}`,
        ),
      ];
    },
  },
  {
    name: "echo",
    message: "Call the echo tool with text 'pong-42'. Then reply with exactly the text it returned, nothing else.",
    expect: (events) => [
      check("echo was called", matches(toolsOf(events).join(","), ["echo"]), `tools called: ${toolsOf(events).join(",") || "none"}`),
      check("tool output reached the model", textsOf(events).toLowerCase().includes("pong-42"), `answer: ${textsOf(events).slice(0, 200)}`),
    ],
  },
  {
    name: "failure",
    message: "Call the fail tool with reason 'disk full'. Then tell me in one sentence whether it failed.",
    expect: (events) => [
      check("fail was called", matches(toolsOf(events).join(","), ["fail"]), `tools called: ${toolsOf(events).join(",") || "none"}`),
      check("tool error surfaced", resultsOf(events).some((e) => e.payload?.isError === true), "no tool.result with isError=true"),
    ],
  },
  {
    name: "todo",
    message: "Record a todo titled 'e2e-buy-milk' using the todo_add tool. Do not ask for confirmation.",
    expect: (events) => [
      check("todo_add was called", matches(toolsOf(events).join(","), ["todo_add"]), `tools called: ${toolsOf(events).join(",") || "none"}`),
    ],
    after: async (base) => {
      const res = await fetch(base + "/api/todos");
      const body = await res.json();
      const titles = (body.todos ?? []).map((t) => String(t.title));
      return [check("todo persisted", titles.includes("e2e-buy-milk"), `todos: ${titles.join(",") || "none"}`)];
    },
  },
  {
    name: "resume",
    sessionTurns: [
      "Remember this code word for later: pineapple. Acknowledge in one short sentence.",
      "What was the code word I asked you to remember? Reply with the word only.",
    ],
    expect: (events) => [
      check("second turn remembered the first", textsOf(events).toLowerCase().includes("pineapple"), `answer: ${textsOf(events).slice(0, 200)}`),
    ],
  },
];

async function main() {
  const configRoot = makeConfigRoot();
  const sessions = [];
  let server;
  let failures = 0;
  let ran = 0;

  try {
    const port = 19100 + Math.floor(Math.random() * 800);
    server = await startServer(configRoot, port);
    if (server.error) die(2, server.error);
    say(`● e2e server up at ${server.base} (preset e2e, fixture MCP)`);

    for (const c of CASES) {
      if (only && c.name !== only) continue;
      ran += 1;
      const sessionId = randomUUID();
      sessions.push(sessionId);
      const events = [];
      const failuresBefore = failures;
      try {
        const turns = c.sessionTurns ?? [c.message];
        for (const message of turns) {
          const started = Date.now();
          const batch = await chat(server.base, sessionId, message);
          if (verbose) say(`    turn (${Date.now() - started}ms): ${batch.length} frames`);
          events.push(...batch);
        }
        const problems = [...(c.expect(events) ?? []).filter(Boolean)];
        if (c.after) problems.push(...((await c.after(server.base)) ?? []).filter(Boolean));
        if (problems.length === 0) {
          say(`✓ ${c.name}  tools=[${toolsOf(events).join(", ") || "none"}]`);
        } else {
          failures += 1;
          say(`✗ ${c.name}`);
          for (const p of problems) say(`    ${p}`);
        }
      } catch (err) {
        failures += 1;
        say(`✗ ${c.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (verbose || failures > failuresBefore) {
        say(`    events: ${events.map((e) => e.type).join(" ")}`);
        const text = textsOf(events);
        if (text) say(`    answer: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }
  } finally {
    server?.child.kill("SIGTERM");
    await sleep(400);
    for (const id of sessions) rmSync(join(repoRoot, ".agentos", "workspaces", `web-${id}`), { recursive: true, force: true });
    if (!keep) rmSync(configRoot, { recursive: true, force: true });
    else say(`kept config root: ${configRoot}`);
  }

  say(failures === 0 ? `\n✓ ${ran} case(s) passed` : `\n✗ ${failures}/${ran} case(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => die(1, err instanceof Error ? err.stack ?? err.message : String(err)));
