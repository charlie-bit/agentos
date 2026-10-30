# Deploying AgentOS

The default and recommended shape is **one process on one machine** (spec
#134). There is no K8s/ArgoCD/ingress productization and there will not be
(#178) — deployment chains are the operator's craft.

## Local (the normal case)

```bash
pnpm install && pnpm build
node cli/main.mjs serve --web --preset config/presets/example.yml
```

Prints the console URL and a per-boot token. The server binds `127.0.0.1`
only; every `/api/*` route requires the token (see `SECURITY.md`).

### Turning the token gate off (single-user intranet)

The token exists to stop other local processes and stray browser tabs from
reading sessions or driving the agent. If this deployment is single-user and
the network is the boundary, say so explicitly:

```bash
node cli/main.mjs serve --web --no-token --host 0.0.0.0 --preset config/presets/example.yml
# or put AGENTOS_WEB_NO_TOKEN=1 in .env
```

The boot output then warns that anyone who can reach the port can drive the
agent. Nothing else changes: the bind address, data directory and provider
leases are unaffected.

## Container

```bash
docker build -t agentos .
docker run --rm -p 8787:8787 \
  -v "$PWD/.agentos-docker:/app/.agentos" \
  --env-file .env \
  agentos
```

The image starts `serve --web --host 0.0.0.0` so the published port works;
that 0.0.0.0 is *inside the container's network namespace* and exists only
because the operator published it. The token gate still applies to every
`/api/*` route, and the console is not a team server (#173, `SECURITY.md`).
Publish with `-p 127.0.0.1:8787:8787` to keep it loopback-only on the host.

## Data

Everything lives under `.agentos/` (or `/data/.agentos` in the container):

| Path | Contents |
|------|----------|
| `sessions.db` | ledger: ids, status, title, pointers (`AGENTOS_SESSION_DB`) |
| `workspaces/<key>/` | per-session scratch + `tool-results/` offload files |
| `kb-drafts/` | uncommitted knowledge drafts (invisible to search) |
| `kb-receipts.jsonl` | draft/commit ledger |
| `usage.log` | per-turn attribution metadata |
| `escalations.log` + `audit.jsonl` | human-handoff + execution gate records |

Back up by copying that directory; there is no background sync anywhere.
