/**
 * spec #232 — README examples are schema-legal, in both languages. The docs
 * are the contract's front door; an example that does not parse teaches the
 * wrong shape. Every fenced yaml block that declares a `kind:` is loaded
 * through the real loader here.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadManifest } from "../load.js";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const tempDirs: string[] = [];
afterAll(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

function yamlBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((m) => m[1] ?? "").filter((b) => /^\s*kind:\s*\S+/m.test(b));
}

describe("README manifest examples (#232)", () => {
  for (const file of ["README.md", "README_zh-CN.md"]) {
    it(`${file}: every manifest example loads`, () => {
      const blocks = yamlBlocks(readFileSync(join(repoRoot, file), "utf8"));
      expect(blocks.length).toBeGreaterThanOrEqual(3); // tool / model / preset are all present
      const dir = mkdtempSync(join(tmpdir(), "agentos-readme-"));
      tempDirs.push(dir);
      blocks.forEach((block, i) => {
        const path = join(dir, `example-${i}.yml`);
        writeFileSync(path, block);
        const result = loadManifest(path);
        expect(result.ok, `${file} block ${i} must parse:\n${block}\n${result.ok ? "" : JSON.stringify(result.errors)}`).toBe(true);
      });
    });
  }
});
