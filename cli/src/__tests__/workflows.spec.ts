/** spec #358 — workflow validate command + preset.workflows references. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../run.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

function book(presetExtra: string, workflowAgent = "analyst", withAgent = true): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-wf-cli-"));
  dirs.push(dir);
  for (const sub of ["presets", "knowledge", "models", "workflows", "agents"]) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, "presets", "p.yml"), ["kind: preset", 'version: "1"', "name: p", "knowledge: k", "model: m", "tools: []", "entry: cli", presetExtra, ""].join("\n"));
  writeFileSync(join(dir, "knowledge", "k.yml"), ["kind: knowledge", 'version: "1"', "name: k", "provider: markdown", "mount: { type: path, path: ./kb }", ""].join("\n"));
  writeFileSync(join(dir, "models", "m.yml"), ["kind: model", 'version: "1"', "name: m", "provider: v", "models: { a: real }", ""].join("\n"));
  writeFileSync(
    join(dir, "workflows", "w.yml"),
    ["kind: workflow", 'version: "1"', "name: w", "steps:", `  - { type: agent, agent: ${workflowAgent}, prompt: go }`, ""].join("\n"),
  );
  if (withAgent) writeFileSync(join(dir, "agents", "analyst.yml"), ["kind: agent", 'version: "1"', "name: analyst", "systemPrompt: hi", ""].join("\n"));
  return dir;
}

describe("workflows validate (#358)", () => {
  it("accepts a preset referencing a valid workflow and its local agent", async () => {
    const dir = book("workflows: [w]");
    const r = await run(["workflows", "validate", join(dir, "presets", "p.yml")]);
    expect(r.exitCode).toBe(0);
  });

  it("rejects a dangling workflow reference and a workflow naming an unknown agent", async () => {
    const dangling = book("workflows: [ghost]");
    const r1 = await run(["workflows", "validate", join(dangling, "presets", "p.yml")]);
    expect(r1.exitCode).toBe(1);
    expect(r1.lines.join("\n")).toContain("workflows.0");

    const badStep = book("workflows: [w]", "nobody");
    const r2 = await run(["workflows", "validate", join(badStep, "presets", "p.yml")]);
    expect(r2.exitCode).toBe(1);
    expect(r2.lines.join("\n")).toContain("steps.0.agent");
  });
});
