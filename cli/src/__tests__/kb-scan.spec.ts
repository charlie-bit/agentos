/**
 * spec #230 — the single markdown walker shared by `kb lint` and `kb stale`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { markdownFiles } from "../kb-scan.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

function book(): string {
  const root = mkdtempSync(join(tmpdir(), "agentos-kb-scan-"));
  roots.push(root);
  mkdirSync(join(root, "topics"), { recursive: true });
  mkdirSync(join(root, ".git"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# charter");
  writeFileSync(join(root, "a.md"), "# a");
  writeFileSync(join(root, "topics", "b.md"), "# b");
  writeFileSync(join(root, "topics", "notes.txt"), "x");
  writeFileSync(join(root, ".git", "hidden.md"), "# hidden");
  return root;
}

describe("markdownFiles (#230)", () => {
  it("walks recursively, sorted, skipping README.md and dot-directories", () => {
    const root = book();
    const files = markdownFiles(root).map((f) => f.slice(root.length + 1));
    expect(files).toEqual(["a.md", join("topics", "b.md")]);
  });

  it("a missing directory is empty, not an error", () => {
    expect(markdownFiles(join(tmpdir(), "agentos-no-such-dir-xyz"))).toEqual([]);
  });
});
