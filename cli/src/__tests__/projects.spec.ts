/** spec #391 — projects validate is the shared runner; scaffold validates first. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProjectsScaffold } from "../agents.js";

const dirs: string[] = [];
const cwd = process.cwd();
afterEach(() => {
  process.chdir(cwd);
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

describe("projects scaffold (#391)", () => {
  it("writes a validating template and refuses overwrite/invalid names", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentos-proj-scaffold-"));
    dirs.push(dir);
    process.chdir(dir);
    expect(runProjectsScaffold(["web-revamp"]).exitCode).toBe(0);
    expect(existsSync(join(dir, "config", "projects", "web-revamp.yml"))).toBe(true);
    expect(runProjectsScaffold(["web-revamp"]).exitCode).toBe(1);
    expect(runProjectsScaffold(["Bad Name"]).exitCode).toBe(2);
  });
});
