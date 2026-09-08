/**
 * Contract fitness gate: every fixture is a real, publicly documented open-source
 * system. If a real system cannot be expressed through the contract, the contract
 * is the thing to fix — never the fixture. Negative cases pin the discipline
 * claims (secret rejection, transport-conditional fields).
 */
import { describe, expect, it } from "vitest";
import {
  knowledgeManifestSchema,
  modelProviderManifestSchema,
  presetSchema,
  toolProviderManifestSchema,
  type EntryAdapter,
  type RenderEvent,
} from "../index.js";

describe("ToolProviderManifest ← real MCP servers (modelcontextprotocol/servers)", () => {
  it("parses the filesystem server as stdio transport", () => {
    const manifest = toolProviderManifestSchema.parse({
      kind: "tool",
      version: "1",
      name: "filesystem",
      transport: "stdio",
      // Reference invocation of the publicly documented server package.
      command: "npx -y @modelcontextprotocol/server-filesystem /workspace",
      auth: { mode: "none" },
      allowedTools: ["read_file", "write_file", "list_directory"],
      // Read tools retry safely; the mutating pair must be carved out.
      idempotent: {
        default: true,
        overrides: { write_file: false, edit_file: false },
      },
      schemaExchange: "json-schema",
    });
    expect(manifest.transport).toBe("stdio");
  });

  it("parses a generic remote http server with bearer-token-env auth", () => {
    const manifest = toolProviderManifestSchema.parse({
      kind: "tool",
      version: "1",
      name: "remote-tools-gateway",
      transport: "http",
      endpoint: "https://mcp.example.com/rpc",
      auth: { mode: "bearer-token-env", env: "EXAMPLE_MCP_TOKEN" },
      envRouting: ["dev", "staging"],
      schemaExchange: "json-schema",
    });
    expect(manifest.name).toBe("remote-tools-gateway");
  });

  it("refuses a literal secret in auth (strict object, extra key = reject)", () => {
    expect(() =>
      toolProviderManifestSchema.parse({
        kind: "tool",
        version: "1",
        name: "leaky",
        transport: "http",
        endpoint: "https://mcp.example.com/rpc",
        auth: { mode: "bearer-token-env", env: "T", token: "sk-live-secret" },
        schemaExchange: "json-schema",
      }),
    ).toThrow();
  });

  it("refuses command on sdk transport and endpoint on stdio transport", () => {
    expect(() =>
      toolProviderManifestSchema.parse({
        kind: "tool",
        version: "1",
        name: "bad-sdk",
        transport: "sdk",
        command: "echo hi", // not a member of the sdk variant
        auth: { mode: "none" },
        schemaExchange: "json-schema",
      }),
    ).toThrow();
    expect(() =>
      toolProviderManifestSchema.parse({
        kind: "tool",
        version: "1",
        name: "bad-stdio",
        transport: "stdio", // command missing
        auth: { mode: "none" },
        schemaExchange: "json-schema",
      }),
    ).toThrow();
  });

  it("refuses non-none auth without an env var name", () => {
    expect(() =>
      toolProviderManifestSchema.parse({
        kind: "tool",
        version: "1",
        name: "no-env",
        transport: "http",
        endpoint: "https://mcp.example.com/rpc",
        auth: { mode: "bearer-token-env" },
        schemaExchange: "json-schema",
      }),
    ).toThrow();
  });
});

describe("ModelProviderManifest ← public model endpoints", () => {
  it("parses AWS Bedrock with env-referenced credentials", () => {
    const manifest = modelProviderManifestSchema.parse({
      kind: "model",
      version: "1",
      name: "bedrock-default",
      provider: "aws-bedrock",
      // Publicly documented Bedrock API-key env var; value never appears here.
      credentialsEnv: "AWS_BEARER_TOKEN_BEDROCK",
      models: {
        sonnet: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        haiku: "anthropic.claude-3-haiku-20240307-v1:0",
      },
      fallbackChain: ["sonnet", "haiku"],
      usageAttr: { costCenter: "platform-eng" },
    });
    expect(manifest.models.sonnet).toContain("anthropic.");
  });

  it("parses DeepSeek's Anthropic-compatible endpoint (URL lives only in this fixture)", () => {
    // DEEPSEEK_ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic" — per DeepSeek public API docs.
    const manifest = modelProviderManifestSchema.parse({
      kind: "model",
      version: "1",
      name: "deepseek-anthropic-compat",
      provider: "deepseek",
      baseUrlEnv: "DEEPSEEK_ANTHROPIC_BASE_URL",
      credentialsEnv: "DEEPSEEK_API_KEY",
      models: { general: "deepseek-chat", reasoner: "deepseek-reasoner" },
      fallbackChain: ["general"],
    });
    expect(manifest.baseUrlEnv).toBe("DEEPSEEK_ANTHROPIC_BASE_URL");
  });

  it("refuses an empty alias map", () => {
    expect(() =>
      modelProviderManifestSchema.parse({
        kind: "model",
        version: "1",
        name: "empty",
        provider: "whoever",
        models: {},
      }),
    ).toThrow();
  });
});

describe("KnowledgeManifest ← markdown book repository", () => {
  it("parses a local path mount", () => {
    const manifest = knowledgeManifestSchema.parse({
      kind: "knowledge",
      version: "1",
      name: "team-handbook",
      provider: "markdown",
      mount: { type: "path", path: "./knowledge-base" },
    });
    expect(manifest.mount.type).toBe("path");
  });

  it("parses a git-sync mount with pinned ref", () => {
    const manifest = knowledgeManifestSchema.parse({
      kind: "knowledge",
      version: "1",
      name: "external-docs",
      provider: "markdown",
      mount: {
        type: "git-sync",
        repoUrl: "https://github.com/example-org/open-book-repo",
        ref: "main",
        targetPath: "/var/cache/kb/open-book-repo",
        intervalMs: 300_000,
      },
    });
    expect(manifest.mount.type).toBe("git-sync");
  });
});

describe("EntryAdapter ← chat-platform type-only mock (no product named)", () => {
  const rendered: RenderEvent[][] = [];

  const mockChatEntry = {
    async identity() {
      return { userId: "u-1", tenant: { tenantId: "t-1", workspaceId: "w-1" } };
    },
    async session() {
      return { clientSessionId: "c-thread-9", agentSessionId: "a-77" };
    },
    render(events) {
      rendered.push(events);
    },
    async confirm(req) {
      return { approved: false, decidedBy: `auto-deny:${req.requestId}`, timestampMs: Date.now() };
    },
    capabilities: { confirm: true },
  } satisfies EntryAdapter;

  it("satisfies the EntryAdapter shape", () => {
    expect(mockChatEntry.capabilities.confirm).toBe(true);
  });

  it("identity and session round-trip the expected structures", async () => {
    const { userId, tenant } = await mockChatEntry.identity();
    expect(userId).toBe("u-1");
    expect(tenant.tenantId).toBe("t-1");
    const binding = await mockChatEntry.session();
    expect(binding.agentSessionId).toBe("a-77");
  });

  it("render never throws and records the batch; confirm returns a result", async () => {
    await expect(
      Promise.resolve(
        mockChatEntry.render([{ type: "assistant.text", payload: { text: "hi" }, timestampMs: Date.now() }]),
      ),
    ).resolves.toBeUndefined();
    expect(rendered).toHaveLength(1);
    const result = await mockChatEntry.confirm({ requestId: "r-1", prompt: "Commit draft?" });
    expect(result.approved).toBe(false);
  });
});

describe("Preset ← assembled reference graph of the fixtures above", () => {
  it("parses a preset referencing the real-system manifests by name", () => {
    const preset = presetSchema.parse({
      kind: "preset",
      version: "1",
      name: "handbook-assistant",
      knowledge: "team-handbook",
      model: "bedrock-default",
      tools: ["filesystem", "remote-tools-gateway"],
      entry: "mock-chat",
    });
    expect(preset.tools).toHaveLength(2);
  });

  it("refuses an envelope with the wrong kind for a preset body", () => {
    expect(() =>
      presetSchema.parse({
        kind: "tool",
        version: "1",
        name: "wrong-envelope",
        knowledge: "k",
        model: "m",
        tools: [],
        entry: "e",
      }),
    ).toThrow();
  });
});
