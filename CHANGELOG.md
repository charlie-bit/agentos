# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows the version policy below (not SemVer-by-vibes).

## Version policy

The contracts are **additive-only** by design (spec #7): a version bump may
add fields, methods or verbs; it may not change the meaning of an existing
one. That makes the mapping mechanical:

| Change | Version bump |
|--------|--------------|
| New optional field / new method / new dialect / new command | **minor** (`0.x` → `0.x+1`) |
| Behaviour fix that keeps every existing caller working | **patch** |
| Anything that changes an existing contract's meaning, removes a field, or breaks a manifest that used to load | **major** — and it requires a spec revision note first (see `.docs/spec.md` changelog rules) |

Pre-1.0 the minor series is the contract series: `0.1` manifests and presets
keep loading in every `0.1.x`, and a break ships as `0.2` with the spec note.

## [Unreleased]

### Added

- `ModelDialect` contract and `model-openai-compat` — the first third-party
  dialect package; model manifests gain an optional `dialect` field (#202, #210)
- Idempotent-only retry executor: `isIdempotent` + `withRetryOnce` in core,
  `withToolRetry` in the adapter, wired to the mount plan (#205)
- >10KB tool-result offload to the session workspace with a pointer envelope
  (`OFFLOAD_THRESHOLD_BYTES`, sanitized file names) (#206)
- `envRouting` executor: mounts are filtered by `AGENTOS_ENV` (#207)
- Three-layer model routing: `preset.channelModels` (reverse override >
  channel/tenant > preset slot) (#208)
- `Attribution.tenant` / `Attribution.attr` — manifest `usageAttr` reaches
  `usage.log` (#209)
- Web console: local per-boot token gate with constant-time comparison and a
  paste-once token screen (#287); `GET /api/presets`, `POST
  /api/presets/validate`, `GET /api/tools`, `GET /api/usage`, workspace
  list/read endpoints, single + batch session export (#288–#291, #256,
  #257, #259, #260)
- SSE keepalive comment frames every 15s on idle chat streams (#252)
- `Ledger.sweepRunning()` + boot sweep in both serve modes (#253)
- `kb lint` now checks relative links (README index included) (#234)

### Changed

- `ModelProviderRuntime` replaced by the contract's `ModelDialect`; both
  shipped dialects typecheck against it, Bedrock's probe takes `{ env }` (#202, #243)

### Fixed

- Double-submit: `commitDraft` consumes the draft and records a durable
  `phase:"committed"` ledger line (#214)
- Turn lifecycle in the ledger: `running` is persisted for every turn, `idle`
  on completion (#215)
- Concurrent tabs: entry-rest addresses streams by explicit external key (#216)
- Registry drift is per-session instead of one shared slot (#218)
- Web API client rejects non-2xx instead of parsing errors as success (#219)
- Session list paginates (`limit`/`offset`/`total`/`hasMore`) instead of a
  silent `LIMIT 100` (#221)
- One `web-` session-key definition in contracts (#223); one draft-header
  format in contracts (#224); one entry-adapter registry (#228)
- Overview rendering is bounded to the 1–2K-token budget (#225)
- Drift contract distinguishes "unverified" (no allowlist) from clean (#226)
- Serve no longer invents a placeholder credential; the doc mount is
  `enabled: false` (#227)
- Single unresolvable tool no longer aborts the boot (#204)
- `kb gate` lost its dead clock parameter; `kb lint`/`kb stale` share one
  markdown walker (#229, #230)
- Knowledge pointer line has one definition (#245)

### Security

- `SECURITY.md` with enforceable privacy promises and disclosure process (#239)
- Workspace reads are fenced lexically and by realpath (symlink escape
  refused); token gate on every `/api/*` route (#257, #287)

### Documentation

- README Quick Start matches the real toolchain (pnpm, Node ≥ 22.5) (#231)
- Every manifest example in both READMEs is schema-legal and CI-checked (#232)
- Implementation Order separates shipped from planned; multi-pod clauses and
  ledger DB swap triggers documented; large-result row points at code (#235–#238)
- Spec #73 route wording corrected to `/api/sessions/:id/title` (#233)
