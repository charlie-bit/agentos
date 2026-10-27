# v4 audit — product surface (308–457)

Scope: the five workbench surfaces plus their integration, run over the code as
it exists after the v4 implementation rounds. Evidence is file paths + the
tests that pin each claim; every "open" line names what is missing rather than
leaving it implied.

## Lane 1 — contracts / loader / validation

- Todo, agent, workflow, project contracts exist and are strict; unknown kinds
  and inline secrets are rejected (contracts tests).
- Cross-layer references validated: preset agents/workflows, agent
  knowledge/model/baseAgent (cycles + tool-as-base refused), project
  agents/workflows/tools/knowledge.
- **Gap**: agent `tools` are runtime names and are not statically resolvable —
  documented in the validator and the role guide.

## Lane 2 — runtime (turns, todos, workflow)

- Role turns: prompt concat + hard `toolAllowlist` fence consumed by both the
  pre-approval list and canUseTool; usage attribution carries the agent.
- Todos: ledger verbs + `todo_*` tools + SSE `todo.changed` + transcript marker.
- Workflow: sequential runner (offload pointer, human denial stops, resumeFrom),
  persisted instances, 60s scheduler with lastRun-before-fire, triggers
  (manual/webhook with env-named secret), audit metadata only.
- **Gaps (real-acceptance phase)**: workflow `tool` steps cannot invoke
  cross-process MCP tools; external results → todo needs a live model;
  per-call audit of external tools; usage attribution per external manifest.

## Lane 3 — web console

- Panels: todos, roles, workflows (read-only vertical flow, instance timeline,
  resume), projects (templates vs instances, dashboard, filters), usage by
  role, notifications bell (30s), logs, workspace files, drafts inbox.
- Rust-check invariants covered by pure-function tests (reducer, filter, chain,
  fence, timeline, theme). Panels reuse EmptyState guidance.
- **Gaps**: no browser E2E (maintainer declined the Playwright dependency);
  ⌘K palette and five-zone navigation/home are not built.

## Lane 4 — CLI / config faces

- scaffold/validate/export for agents and projects; scaffold/validate for
  workflows; agents export; data export/import/gc (with done-todo sweep).
- **Gap**: no `projects export` of a template (instances export exists).

## Lane 5 — engineering / ecosystem

- CI: typecheck + lint + full tests + bilingual check + kb lint; opt-in
  external-provider lane; pack check for the CLI tarball.
- Docs: contracts, presets, agents, projects, external agents, onboarding,
  deployment, performance, roadmap, audit routine — bilingual where the
  content is product-facing.
- **Gaps**: real third-party MCP acceptance, npm registry publish, documented
  performance regression script.

## Privacy pass (R1–R9)

- No telemetry; all new endpoints are local, token-gated, metadata-only.
- Todos/roles/workflow prompts are user data: logs and audits never carry their
  text (tests assert a todo title and a prompt are absent from audit records).
- Notifications carry kind + title only; exports are user-initiated downloads.
