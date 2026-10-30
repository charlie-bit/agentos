# Writing a role (agent manifest)

A role is a file in `config/agents/*.yml`. It runs on this kernel; it is not a
second agent runtime (ruling C: external agents are MCP tools, never roles).

```yaml
kind: agent
version: "1"
name: triage-analyst
# baseAgent: another-local-role   # inheritance; never an MCP tool (#418)
systemPrompt: |
  You are triage-analyst. Read the knowledge base first; record follow-ups
  with todo_add instead of only mentioning them.
tools: [kb_search, kb_get_page, todo_add]   # BARE tool names = the turn's fence
knowledge: local-markdown                   # optional: restrict the knowledge socket
# model: deepseek                           # optional: request-level model
```

## Rules the loader enforces

- `systemPrompt` is required; unknown fields and inline secrets are rejected.
- `baseAgent` must name another role in the same tree; cycles and dangling
  names fail at validate time, and a tool manifest name is refused.
- `tools` are bare tool names (`kb_search`, `todo_add`, …) that form the
  role's hard fence: both the pre-approval list and the kernel's canUseTool
  gate consume it, so an out-of-fence call is denied and audited.
- `knowledge`/`model` are manifest references and are statically validated.

## Inheritance semantics (#329)

Prompts concatenate root → leaf (child wording last, so it wins where they
conflict). Tools are a deduped union in root order. `knowledge`/`model` take the
nearest child override.

## Lifecycle

```bash
agentos agents scaffold my-role        # skeleton that validates before it returns
agentos agents validate config/agents  # exit code = verdict
agentos agents export my-role --out share.yml
```

Roles mount at startup. Editing a role = edit the yml + restart (no hot-plug,
#188); the web shows the catalogue read-only (`GET /api/agents`). A running
session keeps its recorded role tag even if the role is later removed.
