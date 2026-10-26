# Provider onboarding

The conformance suite is the only admission requirement (spec #140). This
page is the shortest path from a clone to a passing provider.

## 0. One-time setup

```bash
git clone https://github.com/charlie-bit/agentos.git
cd agentos
pnpm install
pnpm build
pnpm --filter @agentos/conformance test   # must be green before you start
```

## 1. Pick your socket

| You have | Path | Code? |
|----------|------|-------|
| an MCP tool server (stdio/http) | `config/tools/<name>.yml` | **no** |
| an extra alias/endpoint for an existing vendor dialect | `config/models/<name>.yml` | **no** |
| a vendor family with its own API dialect | `packages/providers/model-<vendor>/` exporting `dialect: ModelDialect` | yes, one package |
| a knowledge store | `packages/providers/knowledge-<x>/` implementing the six verbs | yes |
| a new inbound surface | `packages/entry/entry-<x>/` implementing `identity/session/render/confirm` | yes |

## 2a. Tool server — zero code

```yaml
kind: tool
version: "1"
name: my-server
transport: stdio            # or http
command: npx -y @example/my-mcp-server ${MY_ROOT}
auth: { mode: none }
allowedTools: [search, get]          # probe the server offline; mirror the REAL set
idempotent: { default: false, overrides: { search: true, get: true } }
sandbox: { fsRoots: [${MY_ROOT}] }   # the ONLY roots the mount may touch
schemaExchange: json-schema
```

Then point a preset's `tools:` slot at `my-server` and run:

```bash
node cli/main.mjs preset validate config/presets/example.yml
```

Drift check (`/api/tools`, drift events) compares declared vs discovered at
mount time — an empty `allowedTools` is reported as *unverified*, not clean.

## 2b. Model dialect — one package

Implement the contract's `ModelDialect` in `packages/providers/model-<vendor>/`:

```ts
export const dialect: ModelDialect = { tag, resolveChannel, healthCheck, resolveModel };
```

Register it in `cli/src/serve.ts`'s dialect registry and the adapter's
channel resolution, then select it from a manifest with `dialect: <tag>`.
Acceptance: `pnpm --filter @agentos/model-<vendor> typecheck` plus a
conformance case in `packages/conformance/model`.

## 2c. KnowledgeProvider — six verbs

`bootstrap / search / getPage / listPages / writePage / commit`.
Laws that the suite enforces:

- return structure, never rendered text;
- no-hit search returns `[]`, never throws;
- drafts are invisible to search/bootstrap until `commit`;
- `commit` is receipt-idempotent (a second commit of the same receipt throws);
- declare `capabilities.write:false` honestly — core then omits the write verbs.

## 2d. EntryAdapter — four verbs

`identity / session / render / confirm`. `render` never throws; a `confirm`
that cannot ask a human must declare `capabilities.confirm:false` (core then
downgrades knowledge writes to read-only); the confirm timeout is yours.
Register the adapter name in `packages/contracts/src/entry.ts`
(`ENTRY_ADAPTER_NAMES`) so preset validation accepts it, and route a channel
to it via the preset's `channels` table.

## 3. The gate

```bash
pnpm -r typecheck && pnpm -r lint && pnpm -r test
```

All green = admissible. There is no review committee; the suite is the
contract (spec #97/#140).

## Known provider implementations

The framework's ecosystem directory is this list, maintained in markdown —
not a package registry (spec #142/#195).

| Provider | Socket | Status | Maintained by |
|----------|--------|--------|---------------|
| `knowledge-markdown` | Knowledge | shipped | core team |
| `model-anthropic-compat` | Model | shipped | core team |
| `model-bedrock` | Model | shipped | core team |
| `model-openai-compat` | Model | shipped (first third-party dialect) | core team |
| `entry-cli` / `entry-rest` | Entry | shipped | core team |
| `mcp-filesystem` (manifest) | Tool | shipped (reference manifest) | core team |

Community implementations: open a PR that adds one row here **and** a
conformance case. A row without a green suite is not merged. There is no
in-repo plugin marketplace and there will not be one (#195).
