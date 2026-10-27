# Performance budget (spec #169)

Numbers exist so regressions are visible. Measure on a cold process, release
builds (after `pnpm build`), on the maintainer laptop class of machine
(4 vCPU, SSD). Record the date with any change.

| Metric | Budget | How to measure | Latest |
|--------|--------|----------------|--------|
| CLI cold start (`preset validate`, config only) | ≤ 400 ms | `/usr/bin/time -p node cli/main.mjs preset validate config/presets/example.yml` | ~250 ms (2026-10-26) |
| Server boot to listening (`serve --web`, no turn) | ≤ 1.5 s | start and read the printed URL | budget only |
| First token latency | channel-bound (no in-repo SLO) | time from `POST /api/chat` to first `assistant.text` frame | measured per deployment |
| Session resume (history replay, 100 entries) | ≤ 150 ms | `GET /api/sessions/:id/messages` with a 100-entry fixture | budget only |
| Overview render (500 pages) | ≤ 2K tokens | conformance assertion (#225) | enforced in CI |
| Scheduler window decision | ≤ 10 ms | `node scripts/bench-workflow.mjs` (10k iterations, pure) | measured ~0.001 ms/call (2026-10-27) |
| Tendril/role fence check | ≤ 1 ms | pure set membership, exercised per tool call by the adapter | constant-time set lookup |

Rules of thumb this repo already enforces: the bootstrap guide is bounded
(#225), tool results over 10KB leave context (#206), and the ledger is a
single sqlite file with index-free point lookups.

A regression is a budget entry moved in the wrong direction without a note —
documented here rather than discovered in production.
