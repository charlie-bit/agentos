# Contract reference

Four sockets, one kernel. Every type lives in `packages/contracts/src/`; this
page is the map, the source is the contract.

| Socket | Interface | File | The one law |
|--------|-----------|------|-------------|
| Knowledge | `KnowledgeProvider` (six verbs) | `knowledge.ts` | structure out, never rendered text; drafts invisible until `commit` |
| Tool | `ToolProviderManifest` + `ToolMountPlan` | `tool.ts` | the manifest says WHERE, MCP says WHAT; JSON Schema across the seam |
| Model | `ModelProviderManifest` + `ModelDialect` | `model.ts` | the alias is the lease; credentials are env-var NAMES |
| Entry | `EntryAdapter` (four verbs) + `TranscriptEntry` | `entry.ts` | `confirm:false` is legal and downgrades writes to read-only |

Cross-cutting:

- **Preset** (`preset.ts`) — four name references + `channels` / `channelModels`
  / `budgetUsd` / `maxConcurrentSessions`. Zero inline config.
- **NeutralTool** (`neutral-tool.ts`) — the in-process tool shape core emits
  and adapters translate; JSON Schema in, JSON data out.
- **Session key** (`session-key.ts`) — the `web-` browser/ledger convention.

Versioning: additive-only (`CHANGELOG.md` policy). A changed meaning is a
major bump plus a spec revision note.
