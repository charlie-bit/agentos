/**
 * spec #203 — the composition root reads confirmCapable from the mounted entry
 * adapter instead of hardcoding true. A confirm:false entry must lose the
 * knowledge-write verbs at REGISTRATION time (read-only degradation by
 * omission), which is what these tests pin: the kb mount plan's allowlist is
 * the registration surface the kernel sees.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { wireKnowledge, type Assembly } from "../serve.js";

const roots: string[] = [];

function assembly(knowledgeRoot: string): Assembly {
  return {
    presetName: "test-preset",
    presetModel: "test-model",
    allModels: [],
    knowledge: {
      kind: "knowledge",
      version: "1",
      name: "kb",
      provider: "markdown",
      mount: { type: "path", path: knowledgeRoot },
    },
    plans: [],
    mounts: [],
    repoRoot: knowledgeRoot,
  };
}

function tempBook(): string {
  const root = mkdtempSync(join(tmpdir(), "agentos-wire-"));
  roots.push(root);
  writeFileSync(
    join(root, "page.md"),
    "---\nowner: team\nlast_verified: 2026-01-01\nstale_after: 2027-01-01\nstatus: published\n---\n# Page\n.body\n",
    "utf8",
  );
  return root;
}

const approve = async () => ({ approved: true, decidedBy: "test", timestampMs: Date.now() });

afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

describe("wireKnowledge — confirm capability is read, never assumed (#203)", () => {
  it("registers kb_write/kb_commit when the entry can ask a human", async () => {
    const book = tempBook();
    const workspace = join(book, "workspace");
    mkdirSync(workspace, { recursive: true });
    const wired = await wireKnowledge(assembly(book), approve, workspace, true);
    expect(wired).not.toBeNull();
    const names = wired?.plan.allowedTools ?? [];
    expect(names).toContain("kb_write");
    expect(names).toContain("kb_commit");
  });

  it("omits every write verb when the entry declares confirm:false", async () => {
    const book = tempBook();
    const workspace = join(book, "workspace");
    mkdirSync(workspace, { recursive: true });
    const wired = await wireKnowledge(assembly(book), approve, workspace, false);
    expect(wired).not.toBeNull();
    const names = wired?.plan.allowedTools ?? [];
    expect(names).toContain("kb_search");
    expect(names).toContain("kb_get_page");
    expect(names).not.toContain("kb_write");
    expect(names).not.toContain("kb_commit");
  });
});
