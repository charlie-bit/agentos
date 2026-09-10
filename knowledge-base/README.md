# knowledge-base — the knowledge socket

This directory is a SOCKET, not content. What lands here is owned by a
separate knowledge repository (the `git-sync` / `submodule` mounts of the
knowledge contract, or plain files during development). **Content is never
committed to the app repo** — `.gitignore` keeps everything except this README.

Three mount shapes the contract recognizes:

| shape | meaning |
|---|---|
| `path` | plain directory or single `.md` file (dev, embedded corpora) |
| `submodule` | vendored git submodule, pinned `ref` |
| `git-sync` | loader keeps a local clone fresh (`repoUrl` + `ref` + cadence) |

## Page frontmatter (P7b ratifies; providers already parse it)

Each markdown page MAY carry a frontmatter block; keep exactly this shape
(one line per `---` fence, `key: value` pairs):

```markdown
---
owner: team-or-person
last_verified: 2026-09-10
stale_after: 2027-03-10
status: draft | published
---
```

`status: draft` pages exist but should not be quoted as settled;
`last_verified` feeds the recency view (`recentUpdates`).

## P7b preview

Taxonomy, first pages, CI lint (frontmatter validator), and the stale queue
are legislated in P7b — triggered via `agentos kb gate` (escalations window),
not by calendar. This README is the only file the app repo owns here.
