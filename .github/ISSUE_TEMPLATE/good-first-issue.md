---
name: Good first issue
about: A scoped task with a checklist and a conformance gate
labels: good-first-issue
---

## Goal

<!-- one sentence; link the spec point (#N) -->

## Files you will touch

- [ ] …

## Acceptance

- [ ] `pnpm -r typecheck && pnpm -r lint && pnpm -r test` green
- [ ] a test pins the behaviour (name it here)
- [ ] spec point closed with evidence (PR/commit)

## Pointers

- Onboarding: docs/onboarding.md · Contracts: docs/contracts.md
- If this changes user-visible behaviour: CHANGELOG.md Unreleased + both READMEs.
