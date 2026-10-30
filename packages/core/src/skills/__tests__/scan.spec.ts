import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scanSkills } from "../index.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function root(): string {
  const d = mkdtempSync(join(tmpdir(), "agentos-skills-"));
  dirs.push(d);
  return d;
}

describe("scanSkills", () => {
  it("discovers nested SKILL.md files, parses frontmatter and keeps the body", () => {
    const d = root();
    mkdirSync(join(d, "triage"), { recursive: true });
    writeFileSync(join(d, "triage", "SKILL.md"), "---\nname: triage\ndescription: Triage alerts\n---\n\n# Steps\n1. look\n");
    mkdirSync(join(d, "writer"), { recursive: true });
    writeFileSync(join(d, "writer", "SKILL.md"), "---\ndescription: Write it up\n---\nbody only\n");

    const skills = scanSkills(d);
    expect(skills.map((s) => s.name)).toEqual(["triage", "writer"]); // writer falls back to its dir
    expect(skills[0]).toMatchObject({ description: "Triage alerts", path: "triage/SKILL.md" });
    expect(skills[0]?.body.startsWith("# Steps")).toBe(true);
    expect(skills[1]?.description).toBe("Write it up");
  });

  it("a missing directory or one without SKILL.md is an empty catalogue, never a throw", () => {
    expect(scanSkills(join(root(), "nope"))).toEqual([]);
    const d = root();
    writeFileSync(join(d, "README.md"), "not a skill");
    expect(scanSkills(d)).toEqual([]);
  });

  it("skips dot directories and node_modules", () => {
    const d = root();
    mkdirSync(join(d, ".hidden"), { recursive: true });
    writeFileSync(join(d, ".hidden", "SKILL.md"), "---\nname: hidden\n---\nx");
    mkdirSync(join(d, "node_modules"), { recursive: true });
    writeFileSync(join(d, "node_modules", "SKILL.md"), "---\nname: dep\n---\nx");
    expect(scanSkills(d)).toEqual([]);
  });
});
