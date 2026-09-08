# Contract map (example knowledge)

The four sockets, as declared in `packages/contracts`:

| Socket | Manifest | Runtime interface |
|---|---|---|
| Tool | `ToolProviderManifest` | MCP-discovered tools, JSON Schema exchange |
| Model | `ModelProviderManifest` | `ModelProviderRuntime` |
| Knowledge | `KnowledgeManifest` | `KnowledgeProvider` |
| Entry | (code-registered) | `EntryAdapter` |

A preset references all four by name. Kernel packages
(Claude Agent SDK / DeepSeek Harness) are importable only under
`packages/adapters/**`, enforced by ESLint.
