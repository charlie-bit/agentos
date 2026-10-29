import { describe, expect, it } from "vitest";
import { composeWorkflowYaml, emptyDraft, validateDraft, type WorkflowDraft } from "./workflow-compose";

const base = (patch: Partial<WorkflowDraft> = {}): WorkflowDraft => ({ ...emptyDraft(), name: "daily-triage", ...patch });

describe("workflow composer: validation", () => {
  it("a minimal draft with one agent step is valid", () => {
    expect(validateDraft(base({ steps: [{ type: "agent", agent: "triage", prompt: "go" }] }))).toEqual([]);
  });

  it("rejects a non-kebab name and an empty step list", () => {
    expect(validateDraft(base({ name: "Daily Triage" }))).toContain("name must be kebab-case (a-z, 0-9, single dashes)");
    expect(validateDraft(base({ steps: [] }))).toContain("at least one step is required");
  });

  it("rejects a malformed schedule and a non-env webhook secret", () => {
    expect(validateDraft(base({ trigger: "schedule", cron: "0 9 *" }))).toContain("cron must have five fields");
    expect(validateDraft(base({ trigger: "webhook", secretEnv: "not a name" }))).toContain("webhook secretEnv must be an env-var name");
  });

  it("rejects invalid tool args; accepts a scalar object", () => {
    const bad = base({ steps: [{ type: "tool", tool: "echo", args: "{nope" }] });
    expect(validateDraft(bad).some((p) => p.includes("args is not valid JSON"))).toBe(true);
    const nested = base({ steps: [{ type: "tool", tool: "echo", args: '{"a":{"b":1}}' }] });
    expect(validateDraft(nested).some((p) => p.includes("args values must be string, number or boolean"))).toBe(true);
    const good = base({ steps: [{ type: "tool", tool: "echo", args: '{"text":"hi","n":2,"ok":true}' }] });
    expect(validateDraft(good)).toEqual([]);
  });
});

describe("workflow composer: YAML output", () => {
  it("emits the closed envelope, trigger and a quoted multi-line prompt", () => {
    const yaml = composeWorkflowYaml(
      base({
        description: "morning run",
        steps: [{ type: "agent", agent: "triage", prompt: "line one\nline two" }],
      }),
    );
    expect(yaml).toContain('kind: workflow');
    expect(yaml).toContain('name: "daily-triage"');
    expect(yaml).toContain('description: "morning run"');
    expect(yaml).toContain("trigger:\n  type: manual");
    expect(yaml).toContain('    prompt: "line one\\nline two"');
    // JSON-quoted scalars are valid YAML double-quoted scalars; no YAML lib needed.
    expect(yaml.endsWith("\n")).toBe(true);
  });

  it("emits schedule cron and webhook secretEnv only for their own trigger", () => {
    const schedule = composeWorkflowYaml(base({ trigger: "schedule", cron: "0 9 * * 1-5" }));
    expect(schedule).toContain('  cron: "0 9 * * 1-5"');
    expect(schedule).not.toContain("secretEnv");
    const webhook = composeWorkflowYaml(base({ trigger: "webhook", secretEnv: "TRIAGE_HOOK_SECRET" }));
    expect(webhook).toContain('  secretEnv: "TRIAGE_HOOK_SECRET"');
    expect(webhook).not.toContain("cron");
  });

  it("emits tool args as a nested mapping with scalars typed", () => {
    const yaml = composeWorkflowYaml(base({ steps: [{ type: "tool", tool: "echo", args: '{"text":"hi","n":2,"ok":true}' }] }));
    expect(yaml).toContain("    args:");
    expect(yaml).toContain('      "text": "hi"');
    expect(yaml).toContain('      "n": 2');
    expect(yaml).toContain('      "ok": true');
  });

  it("emits category, input source and the slack output sink", () => {
    const yaml = composeWorkflowYaml(
      base({
        category: "sre",
        inputSource: "manual",
        outputSink: "slack",
        outputChannel: "C0123456789",
        steps: [{ type: "agent", agent: "triage", prompt: "go" }],
      }),
    );
    expect(yaml).toContain('category: "sre"');
    expect(yaml).toContain("input:\n  source: manual");
    expect(yaml).toContain("output:\n  sink: slack");
    expect(yaml).toContain('  channel: "C0123456789"');
  });

  it("a slack sink without a channel is invalid", () => {
    expect(validateDraft(base({ outputSink: "slack", outputChannel: "" }))).toContain("slack output needs a channel id");
  });

  it("keeps the five step kinds intact, in order", () => {
    const yaml = composeWorkflowYaml(
      base({
        steps: [
          { type: "agent", agent: "triage", prompt: "a" },
          { type: "tool", tool: "echo", args: "" },
          { type: "skill", skill: "triage", prompt: "" },
          { type: "kb_search", query: "runbook" },
          { type: "review", agent: "reviewer", prompt: "approve?" },
        ],
      }),
    );
    const types = [...yaml.matchAll(/^  - type: (\w+)$/gm)].map((m) => m[1]);
    expect(types).toEqual(["agent", "tool", "skill", "kb_search", "review"]);
    expect(yaml).toContain('    agent: "reviewer"');
  });
});
