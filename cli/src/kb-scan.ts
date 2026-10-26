/**
 * Shared markdown scan for the read-only kb runners (spec #230): `kb lint`
 * and `kb stale` previously carried byte-identical copies of this walker, so
 * "what counts as book content" could drift between them.
 *
 * Contract: recursive, sorted, skips README.md (the socket's own charter) and
 * dot-directories (.git, .obsidian…). Unreadable directories yield no files
 * rather than an error — lint reports unreadable PAGES, a missing tree is
 * simply empty.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

export function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "README.md" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(p));
    else if (/\.md$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}
