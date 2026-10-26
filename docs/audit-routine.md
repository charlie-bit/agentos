# Audit routine (spec #307)

The 307-point list came from a five-way code audit. An audit that happens
once is a snapshot; this file makes it a routine.

## When it runs

1. **Every spec major revision** (v3 was the first): re-run all five lanes
   before the new points are numbered.
2. **Before a release cut** (the v1.0 gate, #170/#306).
3. **On demand** when a lane's assumptions change (e.g. a kernel upgrade).

## The five lanes

| Lane | Scope | What it must produce |
|------|-------|----------------------|
| Contracts / Loader | `packages/contracts`, `packages/core/src/{manifest,loader}` | every claim has a file:line; PARTIAL vs MISSING distinguished |
| Routing / Session / Governance | `packages/core/src/{routing,session,governance}` | dead wiring, unused fields, unimplemented promises |
| Knowledge / Entry / Conformance | providers, both entries, `packages/conformance` | black-box coverage gaps |
| Web console | `apps/web` + entry-rest routes it consumes | endpoint-without-UI and UI-without-endpoint pairs |
| CLI / Engineering / Ecosystem | `cli`, CI, docs, examples | doc claims vs code, dead flags, missing release machinery |

## Rules

- Evidence is always `file:line`, never "seems fine".
- A point closes only when a **test** pins the acceptance criterion
  (`.docs/progress.md` records it); "implemented but untested" is PARTIAL.
- Every finding becomes a numbered spec point (`#N`), one PR-sized unit.
- README-as-contract spot check (#99): pick five README claims and trace each
  to code or a test; a miss opens a documentation point.
- Privacy lanes (R1–R9 in `SECURITY.md`) are checked in every lane, not as a
  sixth pass.

## Where results live

- findings → `.docs/spec.md` (new numbers, additive)
- status → `.docs/progress.md`
- release view → `docs/roadmap-v1.md`
