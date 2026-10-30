# 外部 agent 就是 MCP 工具

There is exactly one way to bring a third-party agent into AgentOS: mount it as
a tool server (`config/tools/<name>.yml`). It is not an entry, not a role, and
never a `baseAgent` (ruling C / #408 / #418).

## 两种形态

| 你想要 | 写在哪 | 它是什么 |
|--------|--------|----------|
| 行为**在本仓**的 agent | `config/agents/<name>.yml` | 角色:prompt + 工具围栏,跑在本内核 |
| 行为**在别处**的 agent | `config/tools/<name>.yml`(stdio/http MCP) | 模型可调用的工具面 |

服务自带 prompt 与循环 → 挂成工具;想让它带上本产品的转录、待办与门禁 → 写一个调用该工具的角色。

## 挂载清单(#409)

```yaml
kind: tool
version: "1"
name: vendor-agent
transport: stdio            # or http
command: npx -y @vendor/agent-mcp ${VENDOR_ROOT}
auth: { mode: bearer-token-env, env: VENDOR_AGENT_TOKEN }   # env NAME only
allowedTools: [run_task, get_result]   # mirror the REAL tools/list (probe offline)
idempotent: { default: false, overrides: { get_result: true } }
sandbox: { fsRoots: [${VENDOR_ROOT}] }
schemaExchange: json-schema
```

1. probe `tools/list` offline and copy it into `allowedTools` — drift is the
   lie detector;
2. declare idempotency honestly; a mutating tool is never auto-retried (#411);
3. validate: `agentos preset validate config/presets/<yours>.yml`;
4. `GET /api/tools` and `/healthz` show the mount and its health (#412);
5. an unavailable server degrades to an absent provider with a warning (#421),
   never a failed boot.

## 内核**不**对它做的事

- it does not parse the external agent's results into todos — the model reads
  the result and calls `todo_add` with `sourceKind: mcp` (#414);
- it does not let a workflow `tool` step call an MCP tool directly: those run
  inside the kernel, so a step that names one fails loudly instead of faking
  success (#410, headless runner);
- it does not import the external agent as a role base (#418).

## 可离线复跑的示例

`scripts/fixtures/echo-mcp-server.mjs` is a real external process (stdio MCP)
mounted by `packages/conformance/tool/fixtures/tools/echo-external.yml`. The
conformance suite spawns it, completes the handshake, and proves the retry
split (`echo` retried once, `bump` never). Run it opt-in in CI with
`vars.AGENTOS_EXTERNAL_SMOKE=on` (#419).

A real vendor server is the final-step acceptance (#304), not a development
blocker.
