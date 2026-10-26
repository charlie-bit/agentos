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

## Container

```bash
docker build -t agentos .
docker run --rm --network host \
  -v "$PWD/.agentos:/data/.agentos" \
  -e AGENTOS_DEEPSEEK_ANTHROPIC_BASE_URL \
  -e AGENTOS_DEEPSEEK_API_KEY \
  agentos
```

`--network host` (Linux) keeps the loopback-only posture: the server binds
`127.0.0.1` *inside* the container's network namespace, which is the host's
loopback. On Docker Desktop (macOS/Windows) host networking is unavailable —
that deployment either accepts `127.0.0.1`-inside-the-VM reachability or puts
its own proxy in front, which is the documented remote-deployment boundary
(#173, `SECURITY.md`).

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
