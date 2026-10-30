/** spec #382 — the workflow skeleton validates before it is handed over. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWorkflowsScaffold } from "../agents.js";

const dirs: string[] = [];
const cwd = process.cwd();
afterEach(() => {
  process.chdir(cwd);
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

describe("workflows scaffold (#382)", () => {
  it("writes a validating five-type skeleton and refuses overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-wf-scaffold-"));
    dirs.push(dir);
    process.chdir(dir);
    const r = runWorkflowsScaffold(["daily-brief"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(dir, "config", "workflows", "daily-brief.yml"))).toBe(true);
    expect(runWorkflowsScaffold(["daily-brief"]).exitCode).toBe(1);
    expect(runWorkflowsScaffold(["not a name"]).exitCode).toBe(2);
  });
});
