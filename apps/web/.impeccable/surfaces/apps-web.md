---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Web console shell

Scope: the application shell of `apps/web` — persistent work rail, top bar, zone
header. Panel internals (todos / workflows / projects / chat) are the next pass
and stay as they are for now.
Visitor mode: Operate.

## Audience and job

One operator, mid-task, on a machine they own or an intranet host. They arrive
to resume a chat, clear a todo, or start a run; they need the zone, the mounted
roles and the health of the tool mounts visible before they read anything else.

## Direction contract

THESIS: A workbench rail around one work area. Refuses the incumbent
top-strip-of-eleven-text-links, which made navigation and diagnostics compete
with the task.

OWN-WORLD: One dark ground (no light variant, no theme switch), tinted from the
existing semantic tokens, one emerald accent reserved for the primary action and
mount health; a rail on the raised card ground; self-hosted Schibsted Grotesk
for UI text and JetBrains Mono for ids and numbers, 13–14px with 11px uppercase
section labels; medium density; the signature move is mount health as a living
dot plus per-mount chips, so state sits where decisions are made.

STORY: The operator opens Home and sees today's focus, recent chats and mount
health; the rail names the five zones and the mounted roles; one pill starts a
new chat; everything secondary collapses behind one overflow menu.

FIRST VIEWPORT: 264px rail (wordmark + preset, four zone rows, AGENTS list,
bottom health line) beside a content column that opens with a quiet top bar
(health summary, mount chips, search, overflow, bell, settings), a 2xl zone
title with a one-line description, one primary pill at the right, then the
zone body — Home summarizes today's focus and workflow runs, with the full todo
board one click away as a drawer.

FORM: Pinned by the operator's Slack-like layout reference (2026-10-28); no
concept roll was run. seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- A session with no title renders its raw `web-<uuid>` in Home and the ledger
  list.
- Secondary inspectors (files, drafts, logs, tools, escalations, timeline,
  usage, roles) stay right-side asides by design: they are drawers over the work
  area, not destinations.
