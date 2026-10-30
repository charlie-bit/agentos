# AgentOS docs

Start here, then follow the path that matches what you are doing.

## Using it

- [README](../README.md) — what this is, in five minutes
- [Quick Start](../README.md#quick-start) — requirements, install, first preset
- [Presets](presets.md) — how to describe an agent without code
- [Deployment](deploy.md) — local, container, data directory
- [Security](../SECURITY.md) — promises, disclosure, the 127.0.0.1 boundary

## The five authoring guides

1. [Presets](presets.md) — the four-slot convergence file
2. [Roles](agents.md) — prompts, inheritance, tool fence
3. [Projects](projects.md) — templates vs instances, the 400 boundary
4. [External agents](external-agents.md) — MCP is the only path
5. [Contracts](contracts.md) — every interface and its one law

## Extending it

- [Onboarding](onboarding.md) — the four sockets + the conformance gate
- [Contracts](contracts.md) — every interface and its one law
- [Roles](agents.md) / [角色](agents.zh-CN.md) — the agent manifest, inheritance and fence
- [Projects](projects.md) / [项目](projects.zh-CN.md) — templates (config) vs instances (data)
- [External agents](external-agents.md) / [外部 agent](external-agents.zh-CN.md) — MCP is the only path
- [Examples](../examples/README.md) — two complete, fictional presets

## Operating it

- [Performance budget](performance.md) — the numbers regressions are measured against
- [Roadmap](roadmap-v1.md) — v1.0 criteria and live counts
- [Audit routine](audit-routine.md) — how the spec is re-verified
- [Changelog](../CHANGELOG.md) · [Contributing](../CONTRIBUTING.md)

This directory is the documentation set; it renders as-is on GitHub and any
Markdown host, with no site generator and no new dependency.

## From nothing to something (scaffolds)

Every config face has a scaffold that writes a skeleton which is validated by
the real loader before the command reports success:

```bash
agentos preset validate config/presets/example.yml   # check an assembled preset
agentos agents scaffold my-role                      # role yml
agentos workflows scaffold my-flow                   # five-step workflow yml
agentos projects scaffold my-project                 # project template yml
agentos agents export my-role --out share.yml        # take a role with you
```

All four exit non-zero on a bad name, refuse to overwrite, and print the next
command to run. There is no generator and no editor: the file is the product.
([中文](scaffolds.zh-CN.md))
