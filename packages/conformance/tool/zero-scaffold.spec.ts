/**
 * spec #138/#297/#304 — pure-yml onboarding of a REAL external process.
 * The server is spawned as a child (no SDK import, no in-process shortcut):
 * a new agent is a yml file plus a command line.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import { planTools } from "@agentos/core";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function rpcOnce(proc: ReturnType<typeof spawn>, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("rpc timeout")), 5000);
    const rl = createInterface({ input: proc.stdout!, terminal: false });
    const onLine = (line: string) => {
      try {
        const msg = JSON.parse(line) as { id?: unknown };
        if (msg.id === (payload as { id?: unknown }).id) {
          clearTimeout(timer);
          rl.off("line", onLine);
          resolve(msg as Record<string, unknown>);
        }
      } catch {
        /* banner lines */
      }
    };
    rl.on("line", onLine);
    proc.stdin!.write(JSON.stringify(payload) + "\n");
  });
}

describe("a second, external provider enters through yml alone (#138/#297/#304)", () => {
  it("the loader plans it from the manifest with the declared retry split and sandbox", async () => {
    const { loadManifest } = await import("@agentos/core");
    const manifest = loadManifest(fileURLToPath(new URL("./fixtures/tools/echo-external.yml", import.meta.url)));
    expect(manifest.ok).toBe(true);
    if (!manifest.ok || manifest.manifest.kind !== "tool") return;
    const { plans, errors } = planTools([manifest.manifest], { env: {} });
    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({
      key: "echo-external",
      transport: "stdio",
      allowedTools: ["echo", "bump"],
      idempotent: { default: false, overrides: { echo: true } },
      sandbox: { fsRoots: ["/tmp"] },
    });
  });

  it("the external process really speaks MCP: initialize, tools/list, echo round-trip", async () => {
    const proc = spawn(process.execPath, ["scripts/fixtures/echo-mcp-server.mjs"], { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] });
    try {
      const init = await rpcOnce(proc, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      const info = init.result as { serverInfo: { name: string } };
      expect(info.serverInfo.name).toBe("echo-fixture");

      const list = await rpcOnce(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const tools = (list.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
      expect(tools).toEqual(["echo", "bump"]);

      const call = await rpcOnce(proc, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "hello" } } });
      const content = (call.result as { content: Array<{ text: string }> }).content[0]?.text;
      expect(content).toBe("hello");
    } finally {
      proc.kill();
    }
  }, 15_000);
});
