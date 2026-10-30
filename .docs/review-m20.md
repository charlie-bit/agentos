# M20 boundary re-review for the v4 workbench (spec #453)

Reviewed 171–200 against the five surfaces. Verdict per risk, with the ruling
that settles it:

| Boundary | v4 risk | Verdict |
|----------|---------|---------|
| #183 no config-write API | project instances are writable | **Holds** — instances store template+title only; PATCH refuses `agents/workflows/tools/knowledge/template/description` with 400 (#390). Templates = yml + git. |
| #196 no graphical editor | workflow/agent views | **Holds** — read-only vertical flow (#376); scaffold commands lower the authoring bar without an editor. |
| #199 no A2A kernel | external agents | **Holds** — external agents enter only as MCP tool manifests (#408); baseAgent cannot name a tool (#418). |
| #177 no domain model | todos, projects | **Holds** — todos are a neutral contract + tool family (#308/#309), projects are data; the kernel parses no MCP result. |
| #197 session sovereignty | project sessions | **Holds** — one channel → one entry adapter (#212)); project tagging does not create a second writer. |
| #188 no runtime hot-plug | new manifests | **Holds** — agents/workflows/projects mount at startup; changes are yml + restart. |
| #195 no plugin marketplace | role/workflow sharing | **Holds** — export downloads a yml (#347); no registry endpoint. |
| #192/#194 no vendor observability / browser model calls | notifications, logs | **Holds** — metadata-only feed; model calls stay server-side. |

No new boundary violations found; the only additions are negative tests that
pinned existing rules (project-template PATCH 400, baseAgent→tool refusal).
