# Contributing to AgentOS

Three ways in, one gate. Read the section that matches what you want to add.

## The gate: conformance is the only entry requirement

Every contract ships black-box tests. Any implementation that passes the suite
is admissible — there is no design review queue, no committee, no allowlist
(spec #140). Run:

```bash
pnpm install
pnpm build
pnpm --filter @agentos/conformance test
```

If your provider passes the suite, it works. If it does not, the failure names
the contract clause it violates.

> `CONTRIBUTING.md` inside `skills/` belongs to a vendored third-party
> plugin tree and is **not** this project's guide. This file is.

## 1. Implement a provider

### ToolProvider — usually zero code

Most tools need **no code at all**:

1. drop a `config/tools/<name>.yml` matching `packages/contracts/src/tool.ts`,
2. for `stdio`/`http` transports the loader does the rest (spawn/connect),
3. declare `allowedTools` to mirror the server's REAL tool set (probe it
   offline) — drift warnings are how config lies get caught,
4. declare `idempotent` honestly: `{ default, overrides }`; an undeclared tool
   is never retried automatically,
5. credentials are env-var **names** only (`auth.env`); inline secrets are
   rejected by the schema.

`sdk` transport is the exception: implement the factory under
`packages/adapters/**` (the only place kernel imports are allowed).

### ModelProvider — a yml, or a dialect package

- Same vendor family, new endpoint/alias: `config/models/<name>.yml` — zero code.
- New vendor dialect: implement `ModelDialect` (`tag`, `resolveChannel`,
  `healthCheck`, `resolveModel`) in `packages/providers/model-<vendor>/` and
  export it as `dialect`. Add it to the composition root's dialect registry
  (`cli/src/serve.ts`) and the adapter's channel resolution. Manifests select
  it with the optional `dialect:` field.

### KnowledgeProvider — the five verbs (+ commit once #201 lands)

Implement `bootstrap / search / getPage / listPages / writePage` in
`packages/providers/knowledge-<x>/`:

- return **structure**, never rendered text;
- a no-hit search returns `[]`, never throws;
- uncommitted drafts must be physically invisible to search/bootstrap;
- declare `capabilities.write: false` honestly — core then keeps
  `kb_write`/`kb_commit` out of registration.

### EntryAdapter — four verbs

Implement `identity / session / render / confirm` under
`packages/entry/entry-<x>/`:

- `render` never throws on display problems;
- `capabilities.confirm: false` is a legitimate declaration — core downgrades
  knowledge writes to read-only;
- the confirm timeout (deny-equivalent) is the adapter's own duty.

Add your adapter name to `ENTRY_ADAPTER_NAMES` in
`packages/contracts/src/entry.ts` so preset validation knows it exists.

## 2. Write a preset

A preset is four name references and nothing else:

```yaml
kind: preset
version: "1"
name: my-agent
knowledge: local-markdown   # a knowledge manifest name
model: deepseek             # a model manifest name
tools: [mcp-filesystem]     # tool manifest names, mount order
entry: cli                  # a registered entry adapter
```

Rules that keep "switch business = switch file" true:

- no inline provider config, no inline credentials — only names;
- domain logic belongs in `examples/`, never in the kernel (spec #177);
- validate before opening a PR:

```bash
node cli/main.mjs preset validate config/presets/<yours>.yml
```

## 3. Respect the boundary commitments

`.docs/spec.md` §171–200 lists thirty things this framework deliberately does
**not** do, each with its replacement exit. A PR that implements one of them is
a regression, not a feature: no config-write API (#183), no vendor tool
hard-coded in `src/` (#176), no domain model in the kernel (#177), no runtime
Zod conversion layer (#182), no telemetry (#R1 in `SECURITY.md`), no
Postgres/Next.js/K8s defaults (#178–#180), no runtime hot-plug (#188).

When unsure, a shorter PR that stays inside the boundary is always preferred.

## Working rules

- **Tests**: every behaviour change ships with a test (unit or conformance);
  the acceptance criterion in the spec is the assertion material.
- **Green before push**: `pnpm -r typecheck && pnpm -r lint && pnpm -r test`.
- **Commits**: Conventional Commits, message in English, e.g.
  `fix(governance): close spec #214 — consume draft on commit`. Reference the
  spec point when your change closes one.
- **Bilingual docs**: a README change edits `README.md` and
  `README_zh-CN.md` in the same commit — a single-language change is
  incomplete (spec #98).
- **Changelog**: user-visible behaviour gets one line in `CHANGELOG.md`
  under Unreleased, with its `(#N)`.
- **Spec edits**: wording may be clarified; points may be added. Deleting a
  point requires a changelog note in the spec (spec #200).
- **No new dependencies** in `cli/` (zero-dependency by design). Elsewhere,
  ask first and state license compatibility.
- **Privacy**: never put real conversations, credentials (even revoked),
  internal URLs or personal data into code, tests, fixtures, docs or commit
  messages. `SECURITY.md` records what the project promises.
