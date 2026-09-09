# AgentOS — working notes

## Adding a ToolProvider

1. Drop a `config/tools/<name>.yml` matching `ToolProviderManifest` (schema: `packages/contracts/src/tool.ts`).
2. MCP stdio/http servers: zero code — the loader spawns/connects from the transport declaration.
3. `sdk` transport only: implemented inside `packages/adapters/**` (the sole place kernel imports are allowed).
4. Declare `idempotent` honestly — a non-idempotent tool loses auto-retry by design.
5. `${VAR}` placeholders in command/endpoint expand from the environment at load (missing var = hard error, not a silent empty mount); `enabled: false` keeps the file visible but unmounts it.
6. Validate: `node cli/main.mjs preset validate config/presets/<preset>.yml` (loader-level behavior: `pnpm --filter @agentos/core test`).
7. The registry drift check (declared vs discovered tools) at mount is the backstop; `config/tools/*.yml` allowedTools must mirror the server's REAL tool set (probe offline) so drift stays silent.

## Adding a ModelProvider

1. New alias / endpoint / pricing for an existing vendor: add `config/models/<name>.yml` (`ModelProviderManifest`) — zero code.
2. New vendor dialect: implement `ModelProviderRuntime` (healthCheck + resolveModel) in `packages/providers/model-<vendor>/`.
3. Endpoint and credentials enter as env-var names only; inline secrets are schema-rejected anyway.
4. Point the preset's `model:` slot at the manifest name.

## Adding a KnowledgeProvider

1. Implement the five verbs in `packages/providers/knowledge-<x>/`.
2. Return structure, never rendered text; a no-hit search returns `[]`, not a throw; uncommitted drafts must stay invisible.
3. Declare `capabilities` truthfully — `write:false` must keep kb_write/kb_commit out of registration.
4. Add a `KnowledgeManifest` in config (provider + mount); the conformance suite (P3) is the on-ramp gate.

## Adding an EntryAdapter

1. Implement the four verbs plus `capabilities` in `packages/entry/entry-<x>/`.
2. `capabilities.confirm:false` is a valid honest declaration — core then downgrades knowledge writes to read-only.
3. `render` never throws on display glitches; the `confirm` timeout is the adapter's own duty.
4. Point the preset's `entry:` slot at this adapter's manifest name.

## 踩坑记录

- **zod 全仓锁 v4**：v3/v4 schema 互不兼容，跨边界传递会静默丢工具（Claude Agent SDK 公开文档记录的行为）。跨内核交换格式只用 JSON Schema。
