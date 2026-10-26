# Examples — where business logic lives

The kernel never learns a domain model (spec #177). Every business-shaped
thing in this repository exists here, as files:

| Example | What it demonstrates | Run it |
|---------|----------------------|--------|
| [`triage-demo/`](triage-demo/presets/triage-demo.yml) | an incident-triage agent assembled from yml: two (placeholder) tool servers + a knowledge book | `node cli/main.mjs preset validate examples/triage-demo/presets/triage-demo.yml` |
| [`docs-assistant/`](docs-assistant/presets/docs-assistant.yml) | a knowledge-only assistant: the read/write loop (`kb_search` → `kb_write` draft → human-confirmed `kb_commit`) | `node cli/main.mjs preset validate examples/docs-assistant/presets/docs-assistant.yml` |

## What is real and what is a placeholder

- The **knowledge books** (`knowledge/book`, `knowledge/handbook`) are real
  markdown with frontmatter — `kb lint` passes on them.
- The **tool manifests** in `triage-demo` are declared `enabled: false`
  with `*.invalid` endpoints: they show the shape of an integration without
  pointing at a real vendor. Set `enabled: true` and replace `command` /
  `endpoint` / the env-var names to run them.
- The **model leases** name env vars (`AGENTOS_DEMO_BASE_URL` /
  `AGENTOS_DEMO_API_KEY`). Point them at any Anthropic-compatible endpoint.
- All content is **fictional** (R6): no real incident, customer or credential
  appears anywhere in this tree.

## Building your own

Copy one directory, rename the preset, edit the four slots. That is the whole
onboarding: no scaffolding, no generator, no code.
