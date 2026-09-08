# examples/

Two jobs, one directory:

1. **Conformance fixtures** — real, valid objects that scripts and contract
   tests parse (e.g. the P2 smoke script reads `docs/contract-map.md` through
   the filesystem MCP tool).
2. **Teaching material** — copy-from samples for newcomers.

Current contents:

- `docs/contract-map.md` — map of the four contracts (Model / Tool / Knowledge / Entry)
- `docs/getting-started.md` — first-run walkthrough

Policy: this directory keeps exactly one README (this file) plus the samples
themselves. No template files — when a sample needs explaining, the explanation
lives here or in the sample's own front matter.