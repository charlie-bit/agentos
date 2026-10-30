# Writing a preset

A preset is the only file that names your business. Everything else is a
manifest it references.

```yaml
kind: preset
version: "1"
name: my-agent
knowledge: local-markdown      # knowledge manifest name
model: deepseek                # model manifest name
tools: [mcp-filesystem]        # tool manifest names, mount order
entry: cli                     # code-registered entry adapter
# Optional, all additive:
channels: { web: rest }                 # channel -> entry adapter (#212); absent = the serving mode's own adapter
channelModels: { cli: deepseek }        # channel/tenant -> model (#208)
budgetUsd: 5                            # ask a human past this spend (#163)
maxConcurrentSessions: 2                # FIFO queue beyond this (#164)
```

## Rules

1. **Names only.** Slots reference manifest `name:` values; no inline config,
   no inline credentials (schema-rejected).
2. **Tools mount in order**; duplicates are rejected at validate time.
3. **`entry` must be code-registered** (`ENTRY_ADAPTER_NAMES`); a channel
   route to an unknown adapter fails validation.
4. **Validate before running**:

```bash
node cli/main.mjs preset validate config/presets/my-agent.yml
```

## What lives where

| You want to change | Edit |
|--------------------|------|
| which model answers | `config/models/*.yml` (or the preset's slots/routing) |
| which tools the agent has | `config/tools/*.yml` + the preset's `tools:` |
| which knowledge it reads | `config/knowledge/*.yml` + the preset's `knowledge:` |
| which surface serves it | the preset's `entry:` / `channels:` |
| the business scenario itself | `examples/` (never the kernel, #177) |
