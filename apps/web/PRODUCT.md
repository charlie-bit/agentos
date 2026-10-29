# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Today: one operator running a single AgentOS instance on their own machine or an
intranet host — the same person who writes the presets, roles and workflows.
They arrive mid-task (check a chat, clear a todo, adjust a workflow), not to
browse.

Explicitly future, not current: several people sharing one instance under
separate accounts. The console has no accounts, no per-user data and no
permissions today; do not design as if it did.

## Product Purpose

AgentOS is a pluggable agent execution framework: one kernel, three provider
sockets (model, tool, knowledge). The web console is the operate surface for
that kernel — run chats, capture todos, inspect and run roles and workflows,
and organize projects. Success is finishing a task without editing yml or
dropping to the CLI.

## Positioning

The console is not a separate product: it drives the same kernel the CLI does,
and everything configurable is a file in git. Roles, workflows and project
templates are read-only in the UI; user data (sessions, todos, project
instances, drafts) is writable. A Slack-like workspace cannot truthfully copy
that arrangement — in those products the channels and messages are the product,
whereas here the configuration files are.

## Operating Context

- One Node process serves the static console and the REST/SSE API.
- Default bind is `127.0.0.1`; intranet deployments pass `--host 0.0.0.0` and may
  turn the per-boot token off with `--no-token`.
- Data lives under `.agentos/` (sessions ledger, workspaces, logs); config lives
  in `config/*.yml`.
- Four zones exist today: Home, Chats, Workflows, Projects. Home is the
  overview (today's focus, workflow runs, recent chats, mount health); the full
  todo board is a drawer opened from Home, not a destination. Keyboard:
  `1`–`4`, `Alt+↑/↓` across sessions, `Esc`, `⌘K`.
- The web writes user data only; system configuration is read-only, with
  validate triggers.
- Skills mounts are deployment-local and private: `config/skills/local.yml` and
  the `skills-base/` content it points at are gitignored, like the knowledge
  socket. The mount path may be an absolute path or `${ENV}`.

## Capabilities and Constraints

- Existing endpoints are the ceiling for this redesign. Backend additions are
  permitted but not required now — leave TODOs rather than inventing endpoints.
- Provider mounts can be degraded (missing credentials, absent env) and the UI
  must show that honestly instead of hiding it.
- Deliberate boundaries: no accounts, no team server, no visual workflow
  editor, no config write API.
- Explicit future direction, not current scope: multi-user accounts/tenancy.
- Explicit future direction, not current scope: workflow authoring from the
  console. Stage A ships the visual step composer plus a generated yml file
  (export only, config stays file+git). The intended successor is an API write
  path with config stored in the database, which replaces the read-only
  configuration boundary for this one surface.

## Brand Commitments

- Name: AgentOS.
- One theme: dark. No light variant and no theme switch (operator decision,
  2026-10-28); the console ships a single palette.
- Type: self-hosted Schibsted Grotesk + JetBrains Mono
  (`apps/web/public/fonts`), so the console renders identically offline and on
  an intranet.
- Binding layout reference supplied by the operator on 2026-10-28: a Slack-like
  shell — persistent left rail with workspace identity, grouped navigation, an
  agents list, quiet content pane with a large title, a one-line description and
  one primary action. Adopt the layout language; do not import the neighbour's
  sections (no People, no Rooms, no App store).

## Evidence on Hand

Real surfaces only: the five zones, the endpoints under
`packages/entry/entry-rest/src/index.ts`, and the shipped components under
`apps/web/src/components`. No testimonials, customers, benchmarks or marketing
claims exist; do not fabricate them.

## Product Principles

1. Operate, don't perform: the console is a tool, not a showcase.
2. Config is read-only here; data is writable.
3. Show real state, including absence — degraded mounts, empty zones and missing
   credentials stay visible.
4. One primary action per surface.
5. The CLI and the console are peers over one kernel; neither owns features the
   other cannot reach.

## Accessibility & Inclusion

No product-specific standard has been established. Do not claim compliance.
