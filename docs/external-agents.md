# External agents are MCP tools

There is exactly one way to bring a third-party agent into AgentOS: mount it as
a tool server (`config/tools/<name>.yml`). It is not an entry, not a role, and
never a `baseAgent` (ruling C / #408 / #418).

## The two shapes

| You want | Write | It becomes |
|----------|-------|-----------|
| an agent whose behaviour lives **here** | `config/agents/<name>.yml` | a role: prompt + tool fence, runs on this kernel |
| an agent whose behaviour lives **elsewhere** | `config/tools/<name>.yml` (stdio/http MCP) | a tool surface the model can call |

If the service ships its own prompt and loop, mount it as a tool. If you want
this product's transcript, todos and gates around it, write a role that calls
that tool.

## Mounting checklist (#409)

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

## What the kernel does NOT do with it

- it does not parse the external agent's results into todos — the model reads
  the result and calls `todo_add` with `sourceKind: mcp` (#414);
- it does not let a workflow `tool` step call an MCP tool directly: those run
  inside the kernel, so a step that names one fails loudly instead of faking
  success (#410, headless runner);
- it does not import the external agent as a role base (#418).

## Worked, offline example

`scripts/fixtures/echo-mcp-server.mjs` is a real external process (stdio MCP)
mounted by `packages/conformance/tool/fixtures/tools/echo-external.yml`. The
conformance suite spawns it, completes the handshake, and proves the retry
split (`echo` retried once, `bump` never). Run it opt-in in CI with
`vars.AGENTOS_EXTERNAL_SMOKE=on` (#419).

A real vendor server is the final-step acceptance (#304), not a development
blocker.
