#!/usr/bin/env node
/**
 * A real external MCP server process (spec #138/#297/#304) — deliberately
 * dependency-free so it can be the "second party" in an offline test:
 * newline-delimited JSON-RPC over stdio, implementing the three calls a
 * mount needs (initialize, tools/list, tools/call).
 *
 * Tools: echo (idempotent read) and bump (mutating, for the retry split).
 */
import { createInterface } from "node:readline";

let counter = 0;
const TOOLS = [
  { name: "echo", description: "Echo the input text back.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "bump", description: "Increment an internal counter (not idempotent).", inputSchema: { type: "object", properties: {} } },
];

const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return fail(null, -32700, "parse error");
  }
  switch (req.method) {
    case "initialize":
      return send(req.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "echo-fixture", version: "0.1.0" },
      });
    case "notifications/initialized":
      return; // notification: no response
    case "tools/list":
      return send(req.id, { tools: TOOLS });
    case "tools/call": {
      const name = req.params?.name;
      if (name === "echo") {
        const text = String(req.params?.arguments?.text ?? "");
        return send(req.id, { content: [{ type: "text", text }], isError: false });
      }
      if (name === "bump") {
        counter += 1;
        return send(req.id, { content: [{ type: "text", text: String(counter) }], isError: false });
      }
      return fail(req.id, -32602, `unknown tool: ${name}`);
    }
    default:
      return fail(req.id, -32601, `method not found: ${req.method}`);
  }
});
