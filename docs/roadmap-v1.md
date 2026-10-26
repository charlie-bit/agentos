# Roadmap to v1.0 (spec #306)

v1.0 is **not** a feeling. The definition, mirroring spec #170 (widened by
v3 to the full 307-point list):

1. every point in `.docs/spec.md` is green (currently 242/307),
2. both examples under `examples/` validate and run,
3. cross-runtime acceptance (#144/#298) passes: one preset, two runtimes,
   inject → retrieve → writeback.

## Current state — auto-generated from `.docs/progress.md`

| Status | Count |
|--------|-------|
| closed `[x]` | 242 |
| partial `[~]` (endpoint or half done; see the ledger line) | 18 |
| open `[ ]` | 47 |
| **total** | 307 |

This table is updated by hand alongside `.docs/progress.md`; the ledger is
the source of truth, this file is the reading. The audit routine (#307)
requires re-running the five-way review whenever the spec gets a major
revision, so the counts here cannot drift silently for long.

## What blocks v1.0 most

- **Cross-runtime proof** (#144/#298): the one remaining headline claim with
  no executable evidence.
- **Second-party onboarding** (#68/#304): still validated only by fixtures.
- **Web second-phase UI** (#258, #261, #270–#286): endpoints exist for most
  of it; the console surfaces do not.
- **npm distribution** (#299): `npx agentos` does not exist yet.

Everything else is either done or a small, isolated task in the ledger.
