/**
 * Direct MCP calls with a persistent per-mount connection.
 *
 * A mounted MCP server is a long-lived child process, not a per-call spawn:
 * the first workflow step connects, and later steps reuse the same process
 * (the same model Claude's own MCP client uses). A transport failure disposes
 * the connection and the next call rebuilds it once automatically.
 *
 * Transports:
 *   - stdio: newline-delimited JSON-RPC, one child per mount key.
 *   - http: one JSON-RPC POST per call (no process to keep); initialize runs
 *     per call because sessions are the server's business.
 *
 * Failure posture matches the rest of the loader: a non-zero exit, a malformed
 * frame, a timeout or a JSON-RPC error becomes a thrown Error carrying the
 * server's own message — never a silent empty result.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { ToolMountPlan } from "@agentos/contracts";

export interface ToolCallResult {
  text: string;
  isError: boolean;
}

export interface McpProbeResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

interface JsonRpcResponse {
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface Pending {
  resolve: (value: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface Conn {
  child: ChildProcess;
  buf: string;
  stderr: string;
  nextId: number;
  pending: Map<number, Pending>;
  ready: Promise<void>;
  dead: boolean;
}

const conns = new Map<string, Conn>();

function resultText(result: unknown): ToolCallResult {
  const content = (result as { content?: unknown } | null)?.content;
  const isError = (result as { isError?: unknown } | null)?.isError === true;
  if (Array.isArray(content)) {
    const text = content
      .map((block) => (typeof block === "object" && block !== null && "text" in block ? String((block as { text?: unknown }).text ?? "") : ""))
      .join("\n")
      .trim();
    return { text, isError };
  }
  if (typeof result === "string") return { text: result, isError };
  return { text: result === undefined ? "" : JSON.stringify(result), isError };
}

function dispose(key: string, reason: string): void {
  const conn = conns.get(key);
  if (!conn) return;
  conns.delete(key);
  conn.dead = true;
  for (const p of conn.pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  conn.pending.clear();
  conn.child.kill("SIGTERM");
}

/** Spawn + initialize once per mount key; later calls reuse this process. */
function connect(plan: ToolMountPlan): Conn {
  const existing = conns.get(plan.key);
  if (existing && !existing.dead) return existing;
  const spec = plan.stdio;
  if (!spec) throw new Error(`mount "${plan.key}" has no stdio spec`);

  const child = spawn(spec.command, spec.args ?? [], { stdio: ["pipe", "pipe", "pipe"] });
  const conn: Conn = {
    child,
    buf: "",
    stderr: "",
    nextId: 1,
    pending: new Map(),
    dead: false,
    ready: Promise.resolve(),
  };

  const send = (msg: unknown): void => {
    if (!conn.dead) child.stdin?.write(JSON.stringify(msg) + "\n");
  };
  const failAll = (err: Error): void => {
    if (conn.dead) return;
    conn.dead = true;
    conns.delete(plan.key);
    for (const p of conn.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    conn.pending.clear();
  };

  child.stderr.on("data", (d) => {
    conn.stderr += d.toString();
  });
  child.on("error", (err) => failAll(err));
  child.on("exit", (code) => failAll(new Error(`mount "${plan.key}" exited (${code}): ${conn.stderr.trim().slice(0, 300)}`)));

  child.stdout.on("data", (d) => {
    conn.buf += d.toString();
    let i: number;
    while ((i = conn.buf.indexOf("\n")) >= 0) {
      const line = conn.buf.slice(0, i).trim();
      conn.buf = conn.buf.slice(i + 1);
      if (line.length === 0) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue; // a stray log line on stdout is not a frame
      }
      const id = typeof msg.id === "number" ? msg.id : undefined;
      if (id === undefined) continue; // notification / server request
      const pending = conn.pending.get(id);
      if (!pending) continue;
      conn.pending.delete(id);
      clearTimeout(pending.timer);
      pending.resolve(msg);
    }
  });

  conn.ready = new Promise<void>((resolve, reject) => {
    const id = conn.nextId++;
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      dispose(plan.key, `mount "${plan.key}" did not answer initialize in time`);
      reject(new Error(`mount "${plan.key}" did not answer initialize`));
    }, DEFAULT_TIMEOUT_MS);
    conn.pending.set(id, {
      resolve: (msg) => {
        if (msg.error) reject(new Error(`initialize failed: ${msg.error.message ?? "unknown"}`));
        else {
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          resolve();
        }
      },
      reject,
      timer,
    });
    send({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agentos-workflow", version: "1" } },
    });
  });

  conns.set(plan.key, conn);
  return conn;
}

async function callStdio(plan: ToolMountPlan, name: string, args: unknown, timeoutMs: number): Promise<ToolCallResult> {
  const conn = connect(plan);
  await conn.ready;
  if (conn.dead) throw new Error(`mount "${plan.key}" is not connected`);

  const id = conn.nextId++;
  const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      dispose(plan.key, `tool "${name}" on mount "${plan.key}" timed out after ${timeoutMs}ms`);
      reject(new Error(`tool "${name}" on mount "${plan.key}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timer });
    try {
      conn.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args ?? {} } }) + "\n");
    } catch (err) {
      conn.pending.delete(id);
      clearTimeout(timer);
      dispose(plan.key, err instanceof Error ? err.message : String(err));
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
  if (response.error) throw new Error(response.error.message ?? "tools/call failed");
  return resultText(response.result);
}

async function callHttp(plan: ToolMountPlan, name: string, args: unknown, timeoutMs: number): Promise<ToolCallResult> {
  const spec = plan.http;
  if (!spec) throw new Error(`mount "${plan.key}" has no http spec`);
  const headers = { "content-type": "application/json", ...(spec.headers ?? {}) };
  const post = async (body: unknown): Promise<JsonRpcResponse> => {
    const res = await fetch(spec.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`mount "${plan.key}" answered ${res.status}`);
    return (await res.json()) as JsonRpcResponse;
  };
  const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agentos-workflow", version: "1" } } });
  if (init.error) throw new Error(`initialize failed: ${init.error.message ?? "unknown"}`);
  const call = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args ?? {} } });
  if (call.error) throw new Error(call.error.message ?? "tools/call failed");
  return resultText(call.result);
}

async function callOnce(plan: ToolMountPlan, tool: string, args: unknown, timeoutMs: number): Promise<ToolCallResult> {
  return plan.transport === "stdio" ? await callStdio(plan, tool, args, timeoutMs) : await callHttp(plan, tool, args, timeoutMs);
}

/**
 * Find the mount that declares this bare tool and call it. On a transport
 * failure the connection is disposed and ONE rebuild is attempted — a crashed
 * server heals on the next call instead of wedging the run.
 */
export async function callMountedTool(
  plans: readonly ToolMountPlan[],
  tool: string,
  args: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<ToolCallResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const candidates = plans.filter((p) => p.allowedTools === undefined || p.allowedTools.includes(tool));
  if (candidates.length === 0) throw new Error(`tool "${tool}" is not declared by any mounted provider`);
  let lastError: unknown;
  for (const plan of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await callOnce(plan, tool, args, timeoutMs);
      } catch (err) {
        lastError = err;
        if (plan.transport === "stdio") dispose(plan.key, err instanceof Error ? err.message : String(err));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`tool "${tool}" failed on every candidate mount`);
}

/**
 * Liveness probe: connect (warming the pool) and initialize. Used by the
 * console's mount status list; a failure also disposes the connection so the
 * next real call rebuilds it.
 */
export async function probeMcp(plan: ToolMountPlan, timeoutMs = PROBE_TIMEOUT_MS): Promise<McpProbeResult> {
  if (plan.transport === "http") {
    try {
      const spec = plan.http;
      if (!spec) return { ok: false, error: "no http spec" };
      const res = await fetch(spec.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(spec.headers ?? {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agentos-probe", version: "1" } } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { ok: false, error: `http ${res.status}` };
      const body = (await res.json()) as JsonRpcResponse;
      return body.error ? { ok: false, error: body.error.message ?? "initialize failed" } : { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  try {
    const conn = connect(plan);
    conn.ready.catch(() => undefined); // the race below owns this failure
    await Promise.race([
      conn.ready,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error(`probe timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    return { ok: true };
  } catch (err) {
    dispose(plan.key, err instanceof Error ? err.message : String(err));
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Close every pooled connection (graceful shutdown, tests). */
export function closeMcpConnections(): void {
  for (const key of [...conns.keys()]) dispose(key, "connections closed");
}
