/**
 * spec #234 — kb lint judges the book's LINKS as well as its frontmatter.
 * A dead relative link (including one in README's index) is exit 1 and names
 * both the page and the target.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintLinks, runKbLint } from "../kb-lint.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

const GOOD_FM = "---\nowner: team\nlast_verified: 2026-01-01\nstale_after: 2027-01-01\nstatus: published\n---\n";

function book(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agentos-lint-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

describe("kb lint links (#234)", () => {
  it("a live relative link passes; a dead one fails with page + target named", () => {
    const root = book({
      "a.md": `${GOOD_FM}\nsee [b](./b.md)\n`,
      "b.md": `${GOOD_FM}\nbody\n`,
    });
    expect(lintLinks(root)).toEqual([]);
    expect(runKbLint([root]).exitCode).toBe(0);

    const broken = book({
      "a.md": `${GOOD_FM}\nsee [gone](./missing.md#section)\n`,
    });
    const result = runKbLint([broken]);
    expect(result.exitCode).toBe(1);
    const text = result.lines.join("\n");
    expect(text).toContain("link:./missing.md#section");
    expect(text).toContain("a.md");
  });

  it("README's index links are checked too (and README frontmatter is not)", () => {
    const root = book({
      "README.md": "charter\n\n- [A](./a.md)\n- [Ghost](./ghost.md)\n",
      "a.md": `${GOOD_FM}\nbody\n`,
    });
    const issues = lintLinks(root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.target).toBe("./ghost.md");
    expect(runKbLint([root]).exitCode).toBe(1);
  });

  it("external and in-page links are not judged", () => {
    const root = book({
      "a.md": `${GOOD_FM}\n[web](https://example.com) [mail](mailto:a@b.c) [self](#top)\n`,
    });
    expect(lintLinks(root)).toEqual([]);
  });
});
