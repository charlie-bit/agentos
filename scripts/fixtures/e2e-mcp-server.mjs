#!/usr/bin/env node
/**
 * E2E fixture MCP server — the deterministic "second party" for agent
 * conversation tests. Dependency-free newline-delimited JSON-RPC over stdio,
 * same wire shape as scripts/fixtures/echo-mcp-server.mjs (which conformance
 * pins for its own purposes; this one is free to grow).
 *
 * Tools:
 *   echo  — return the input text (read; idempotent)
 *   fail  — return a tool error carrying the reason (read; idempotent)
 *   tally — server-side counter that changes each call (mutating)
 */
import { createInterface } from "node:readline";

let counter = 0;
const TOOLS = [
  {
    name: "echo",
    description: "Echo the input text back verbatim.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "fail",
    description: "Always fail. Use it to test how tool errors surface.",
    inputSchema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
  },
  {
    name: "tally",
    description: "Increment an internal counter and return its new value.",
    inputSchema: { type: "object", properties: {} },
  },
];

const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const failRpc = (id, code, message) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return failRpc(null, -32700, "parse error");
  }
  switch (req.method) {
    case "initialize":
      return send(req.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "e2e-fixture", version: "0.1.0" },
      });
    case "notifications/initialized":
      return;
    case "tools/list":
      return send(req.id, { tools: TOOLS });
    case "tools/call": {
      const name = req.params?.name;
      if (name === "echo") {
        const text = String(req.params?.arguments?.text ?? "");
        return send(req.id, { content: [{ type: "text", text }], isError: false });
      }
      if (name === "fail") {
        const reason = String(req.params?.arguments?.reason ?? "unspecified");
        return send(req.id, { content: [{ type: "text", text: `failed: ${reason}` }], isError: true });
      }
      if (name === "tally") {
        counter += 1;
        return send(req.id, { content: [{ type: "text", text: String(counter) }], isError: false });
      }
      return failRpc(req.id, -32602, `unknown tool: ${name}`);
    }
    default:
      return failRpc(req.id, -32601, `method not found: ${req.method}`);
  }
});
