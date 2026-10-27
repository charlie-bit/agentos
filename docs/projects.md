# Projects: templates vs instances

A **project** is the place where roles, workflows and todos meet. The design
has one hard line (ruling A): the template is configuration, the instance is
data.

## Template (configuration, git)

`config/projects/*.yml` — mounted at startup, reviewed in git, read-only in the
web:

```yaml
kind: project
version: "1"
name: web-revamp
description: Q3 checkout rewrite
agents: [triage-analyst, docs-writer]   # must exist in config/agents
workflows: [daily-brief]                # must exist in config/workflows
tools: [mcp-filesystem]                 # tool manifest names
knowledge: [local-markdown]
```

`agentos projects validate <file-or-dir>` checks every reference; scaffold with
`agentos projects scaffold <name>`.

## Instance (data, writable from the web)

Creating a project from a template writes an **instance** to `.agentos/`:
`{id, template, title, timestamps}`. Instances own their todos, sessions and
workflow runs (all tagged with the instance id).

**Why can't I edit the template from the web?** Because then two people could
silently diverge the definition of "what this project is allowed to do", and
the audit trail would be a database row instead of a reviewed diff. Template
changes go through the yml + a PR; instance changes (title, data) are yours.

The API makes this explicit: `PATCH /api/project-instances/:id` accepts
`title` only — sending `agents`, `workflows`, `tools`, `knowledge`, `template`
or `description` answers **400** and names the offending fields.

## The fence

Inside an instance only the template's declared roles/workflows are usable.
The fence is the intersection of the template and the preset mount: a template
can narrow a deployment, never widen it. Out-of-fence role turns and workflow
triggers are refused by the server, and the UI only lists declared entries.

## Lifecycle

1. Write the template (or scaffold it) → `projects validate` → git PR.
2. In the console: pick the template, name the instance, create.
3. Add todos (model or web), start role turns, trigger workflows.
4. Dashboard shows todo counts by status, recent sessions, recent runs.
5. Export the whole instance (`/export?format=jsonl|md`) or delete it — the
   template stays.
