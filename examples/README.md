# Examples — where business logic lives

The kernel never learns a domain model (spec #177). Every business-shaped
thing in this repository exists here, as files. All content is fictional (R6).

## The five workbench surfaces, in one place

`workbench/` is the aggregate demo: five roles, one schedule-driven workflow,
one project template and one knowledge book.

| Surface | Here | Why it is a file |
|---------|------|------------------|
| **Roles** | [`workbench/agents/`](workbench/agents) | a role is a prompt + tool fence + optional inheritance; changing one is editing yml |
| **Workflows** | [`workbench/workflows/daily-brief.yml`](workbench/workflows/daily-brief.yml) | a workflow is a closed five-type step list with a trigger — no editor, no graph store |
| **Projects** | [`workbench/projects/workbench-demo.yml`](workbench/projects/workbench-demo.yml) | a template declares what a project may use; instances are data, the template is git |
| **Knowledge** | [`workbench/knowledge/book/`](workbench/knowledge/book) | markdown + git is the source of truth; kb_search reads it, kb_write drafts back |
| **Todos** | (runtime) | created by the `todo_*` tools or the web; stored in `.agentos/`, never in config |
| **External agents** | [`../scripts/fixtures/echo-mcp-server.mjs`](../scripts/fixtures/echo-mcp-server.mjs) | an outside agent is an MCP tool server, mounted by yml only |

## Quick checks

```bash
# every manifest in the workbench resolves
node cli/main.mjs preset validate examples/workbench/presets/workbench.yml
node cli/main.mjs projects validate examples/workbench/projects/workbench-demo.yml
node cli/main.mjs kb lint examples/workbench/knowledge/book --strict
```

## The single-business examples

| Example | Demonstrates | Run |
|---------|--------------|-----|
| [`triage-demo/`](triage-demo/presets/triage-demo.yml) | incident triage: two placeholder tool servers + a book | `preset validate …` |
| [`docs-assistant/`](docs-assistant/presets/docs-assistant.yml) | knowledge-only assistant and the two-phase writeback loop | `preset validate …` |

Placeholders are declared `enabled: false` with `*.invalid` endpoints: shape
without a vendor. Model leases name env vars; point them at any
Anthropic-compatible endpoint to run.

## Building your own

Copy `workbench/`, rename the preset, edit the four slots (knowledge / model /
tools / entry) and the lists in the project template. That is the whole
onboarding: no scaffolding, no generator, no code.
