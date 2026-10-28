# Security policy

AgentOS runs agents that read your files, quote your conversations, and write
to your knowledge base. The security posture is therefore not a footnote — it
is part of the product contract.

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (0.x, pre-1.0) | ✅ security fixes land here |
| Older tags | ❌ rebase; there is no backport branch before 1.0 |

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.**

Use GitHub's private channel on this repository:

1. <https://github.com/charlie-bit/agentos/security/advisories/new> —
   private advisory, visible only to maintainers and you.
2. Include: affected file/route, a reproduction, the impact you can
   demonstrate, and (optionally) a suggested fix.

What to expect:

- acknowledgement within **7 days**;
- a fix or a documented decision within **30 days** for confirmed issues;
- credit in the advisory unless you ask otherwise;
- no bug bounty is offered (this is a pre-1.0 open-source project).

## What this project promises (and what it does not)

These promises are implementation facts, not aspirations. Each one names the
code that keeps it true.

| # | Promise | Where it is enforced |
|---|---------|----------------------|
| P1 | **Zero telemetry.** The kernel and CLI make no outbound request except to the model endpoint you configured. No analytics, no crash reporting, no phone-home. | No such client exists in the tree; the only `fetch` calls are dialect health probes and the kernel's model calls. |
| P2 | **Local data only.** Sessions, workspaces, drafts, receipts, usage and audit logs live under `.agentos/` on this machine. Nothing syncs, uploads or mirrors. | `.agentos/` layout in README; no background jobs. |
| P3 | **Logs are metadata-only.** `usage.log`, `escalations.log`, `audit.jsonl` record provider/model/session ids/event types — never prompts, replies, tool payloads or page content. | `packages/core/src/routing/attribution.ts`, `entry-rest` escalation writes, `audit.jsonl` writer in the adapter. |
| P4 | **Secrets are referenced, never stored.** Manifests carry env-var **names**; inline credentials are rejected by the schema. | `packages/contracts/src/tool.ts` (`toolAuthSchema` strict object), `packages/contracts/src/model.ts`, `manifest/errors.ts` hints. |
| P5 | **The web console is local and gated by default.** It binds `127.0.0.1`, and `/api/*` requires the per-boot token printed to the terminal. The gate can be turned off explicitly (`--no-token` / `AGENTOS_WEB_NO_TOKEN=1`) for a single-user intranet deployment — then the network boundary is the only protection and the boot output says so. | `packages/entry/entry-rest/src/index.ts` (`listen(port, "127.0.0.1")`, token gate), `cli/src/serve.ts`. |
| P6 | **The file surface is fenced.** Workspace reads reject traversal, absolute paths and symlink escapes; tool-result names are sanitized before becoming filenames. | `readWorkspaceFile` (lexical + realpath fence), `offloadIfLarge` name sanitizer. |
| P7 | **Rendered failures never leak payloads.** `render()` cannot throw, and error panels are prefilled with version/preset/session id only — never conversation content. | Both entry adapters' `render`; console error surfaces. |

### Known boundary: 127.0.0.1 is not "deploy to a server"

The token gate, `127.0.0.1` binding and local-only data make the default
deployment a **single-user local tool**. Exposing it beyond your machine —
a team server, a container with a published port, an ingress — puts
authentication, TLS, network policy and tenant isolation back on the
**deployer**. That is a deliberate boundary, not a missing feature: built-in
SSO, key management and multi-tenant kernels are out of scope (spec #174,
#186, #187). If you need them, put your own proxy/identity layer in front.

## Scope for reports

In scope: anything that breaks P1–P7 above, remote code execution, secret
disclosure through logs or API responses, auth bypass of the token gate, and
path escapes out of a session workspace.

Out of scope: findings that require the attacker to already control
`process.env`, the `.agentos/` directory, or the local machine account; and
"the 127.0.0.1 server is reachable from localhost" (that is the deployment
model — see the boundary above).
