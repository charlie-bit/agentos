# skills-base — the skills socket

This directory is a SOCKET, not content. It holds the instruction directories
(`<skill>/SKILL.md`) that workflows can name in a `skill` step. **Content is
never committed to the app repo** — `.gitignore` keeps everything except this
README, because skills are private operating knowledge that follows the
deployment, not the codebase.

Mount it with a skills manifest (the manifest itself is local too — see
`config/skills/local.yml`, which is gitignored):

```yaml
kind: skills
version: "1"
name: local-skills
mount:
  type: path
  path: ./skills-base        # or an absolute path, or ${AGENTOS_SKILLS_DIR}
```

Then reference it from the preset:

```yaml
skills: [local-skills]
```

## Layout

```
skills-base/
└── triage/
    └── SKILL.md     # frontmatter: name, description; body: the instructions
```

The catalogue is scanned once at startup. A missing directory is an empty
catalogue; an unset `${VAR}` in the mount path skips that mount with a warning
instead of failing the boot.
