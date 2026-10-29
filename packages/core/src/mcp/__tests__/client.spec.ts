/**
 * Direct MCP tool calls: the fixture server is a real process, so this is an
 * integration test of the wire protocol — no kernel, no model, no network.
 */
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { ToolMountPlan } from "@agentos/contracts";
import { callMountedTool, closeMcpConnections, probeMcp } from "../client.js";

const fixture = fileURLToPath(new URL("../../../../../scripts/fixtures/echo-mcp-server.mjs", import.meta.url));

afterAll(() => closeMcpConnections());

const plan: ToolMountPlan = {
  key: "fixture",
  transport: "stdio",
  stdio: { command: process.execPath, args: [fixture] },
  allowedTools: ["echo", "bump"],
};

describe("callMountedTool (direct MCP)", () => {
  it("calls a declared tool over stdio and returns its text", async () => {
    const res = await callMountedTool([plan], "echo", { text: "hello" });
    expect(res).toEqual({ text: "hello", isError: false });
  }, 20_000);

  it("reuses one connection across calls (no per-call spawn)", async () => {
    const a = await callMountedTool([plan], "echo", { text: "one" });
    const b = await callMountedTool([plan], "echo", { text: "two" });
    expect([a.text, b.text]).toEqual(["one", "two"]);
    expect(await probeMcp(plan)).toEqual({ ok: true });
  }, 20_000);

  it("refuses a tool no mount declares", async () => {
    await expect(callMountedTool([plan], "nope", {})).rejects.toThrow(/not declared/);
  }, 20_000);

  it("carries the server's own error for an undeclared-at-runtime tool", async () => {
    // The plan allows only echo/bump, so a plan without an allowlist is needed
    // to reach the server and let its JSON-RPC error answer.
    const open: ToolMountPlan = { ...plan, allowedTools: undefined };
    await expect(callMountedTool([open], "missing_tool", {})).rejects.toThrow(/unknown tool/i);
  }, 20_000);
});
