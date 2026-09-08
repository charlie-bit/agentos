# Getting started with AgentOS (example knowledge)

This two-file directory is a **placeholder knowledge corpus** so the example
preset (`config/presets/example.yml`) resolves its `local-markdown` mount
end to end. Real deployments mount a separate knowledge-base repository
(mount types: `path`, `submodule`, `git-sync`).

Expected structure for a real corpus:

- one folder per topic, markdown files inside
- a filename-stable id convention (providers index by relative path)
- no rendered HTML — providers return structure, presenters render
