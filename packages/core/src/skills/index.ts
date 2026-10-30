/**
 * Skill directory scanner (stage C). A "skills mount" is just a directory of
 * SKILL.md files; the catalogue is discovered once at startup, exactly like
 * knowledge pages. This module is pure filesystem work — no registry, no
 * caching, no formatting decisions.
 *
 * Frontmatter is the documented one-line subset (`key: value` between `---`
 * fences), the same shape the knowledge provider parses. `name` falls back to
 * the containing directory, so a bare SKILL.md still mounts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { SkillEntry } from "@agentos/contracts";

const SKIP = new Set(["node_modules", ".git", ".agentos"]);

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "SKILL.md") out.push(p);
  }
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/.exec(line.trim());
    if (kv?.[1] !== undefined && kv[2] !== undefined) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

/** Scan a skills root. Missing directory = empty catalogue (never throws). */
export function scanSkills(rootDir: string): SkillEntry[] {
  const root = resolve(rootDir);
  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  const files: string[] = [];
  walk(root, files);
  const skills: SkillEntry[] = [];
  for (const file of files.sort()) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const { meta, body } = parseFrontmatter(raw);
    const dirName = basename(dirname(file));
    const name = (meta.name ?? "").trim() || dirName || file;
    skills.push({
      name,
      description: (meta.description ?? "").trim(),
      body: body.trim(),
      path: relative(root, file).split(sep).join("/"),
    });
  }
  return skills;
}
