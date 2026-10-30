/** spec #346/#347 — scaffold produces a valid role; export round-trips it. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAgentsExport, runAgentsScaffold } from "../agents.js";

const dirs: string[] = [];
const cwd = process.cwd();
afterEach(() => {
  process.chdir(cwd);
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-agents-"));
  dirs.push(dir);
  process.chdir(dir);
  return dir;
}

describe("agents scaffold (#346)", () => {
  it("writes a validating skeleton and refuses to overwrite", () => {
    const dir = sandbox();
    const r = runAgentsScaffold(["triage-analyst"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(dir, "config", "agents", "triage-analyst.yml"))).toBe(true);
    expect(runAgentsScaffold(["triage-analyst"]).exitCode).toBe(1); // no silent overwrite
    expect(runAgentsScaffold(["Bad Name"]).exitCode).toBe(2);
  });
});

describe("agents export (#347)", () => {
  it("exports the yml verbatim and rejects unknown roles", () => {
    const dir = sandbox();
    runAgentsScaffold(["analyst"]);
    const out = join(dir, "copy.yml");
    expect(runAgentsExport(["analyst", "--out", out]).exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(readFileSync(join(dir, "config", "agents", "analyst.yml"), "utf8"));
    expect(runAgentsExport(["ghost"]).exitCode).toBe(1);
  });
});
