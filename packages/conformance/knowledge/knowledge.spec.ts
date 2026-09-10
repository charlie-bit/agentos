/**
 * KNOWLEDGE SUITE — provider verbs, two-phase writeback with real git in a
 * temp book repo, capability gates, rendering idempotency, gate config + the
 * cli gate query. Fully offline; zero credentials; temp fixtures everywhere.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { knowledgeManifestSchema, type NeutralTool } from "@agentos/contracts";
import { buildKbTools, commitDraft, renderOverview } from "@agentos/core";
import { createMarkdownProvider } from "@agentos/knowledge-markdown";

const tempDirs: string[] = [];
function tmp(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `agentos-kb-${label}-`));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

function seedBook(dir: string): void {
  writeFileSync(join(dir, "mcp.md"), "---\nowner: platform\nlast_verified: 2026-09-01\nstatus: published\n---\n# MCP Notes\n\nMCP standardizes tool transport over stdio and http.\n");
  mkdirSync(join(dir, "style"), { recursive: true });
  writeFileSync(join(dir, "style", "fmt.md"), "---\nowner: docs\nlast_verified: 2026-08-01\nstatus: published\n---\n# Formatting\n\nKeep lines under 120 chars in docs too.\n");
}

const providerIn = (root: string) =>
  createMarkdownProvider({ root, draftsDir: join(root, "..", "drafts") });

describe("five verbs (black box)", () => {
  it("bootstrap returns pure structure — no pre-rendered prose", async () => {
    const book = tmp("boot");
    seedBook(book);
    const ov = await providerIn(book).bootstrap({ tenantId: "t" });
    expect(ov.index.entries.map((e) => e.id).sort()).toEqual(["mcp.md", "style/fmt.md"]);
    expect(ov.recentUpdates[0]?.id).toBe("mcp.md"); // last_verified wins over mtime
    const flat = JSON.stringify(ov);
    expect(flat).not.toContain("```");
    expect(flat).not.toContain("Recently verified");
  });

  it("search: lexical title-weighted hits; no match is [], never a throw", async () => {
    const book = tmp("search");
    seedBook(book);
    const p = providerIn(book);
    const hits = await p.search("mcp transport");
    expect(hits[0]?.id).toBe("mcp.md");
    expect(await p.search("")).toEqual([]);
    expect(await p.search("zzz-nothing-here")).toEqual([]);
  });

  it("getPage: raw markdown back; unknown id throws", async () => {
    const book = tmp("page");
    seedBook(book);
    const p = providerIn(book);
    expect((await p.getPage("mcp.md")).body).toContain("last_verified");
    await expect(p.getPage("nope.md")).rejects.toThrow(/unknown page id/);
  });

  it("listPages honors scope prefix", async () => {
    const book = tmp("scope");
    seedBook(book);
    expect((await providerIn(book).listPages("style/")).entries.map((e) => e.id)).toEqual(["style/fmt.md"]);
  });

  it("mount single-file form (path may be ONE .md)", async () => {
    const book = tmp("single");
    seedBook(book);
    const p = createMarkdownProvider({ root: join(book, "mcp.md"), draftsDir: join(book, "..", "d") });
    const ov = await p.bootstrap({ tenantId: "t" });
    expect(ov.index.entries).toHaveLength(1);
  });
});

describe("two-phase writeback, end to end with real git", () => {
  it("writePage draft invisible -> confirmed commit lands in git + searchable; denied/unconfirmed stays invisible", async () => {
    const book = tmp("2phase");
    seedBook(book);
    const drafts = join(book, "..", "drafts");
    const ledger = join(book, "..", "ledger.jsonl");
    const p = createMarkdownProvider({ root: book, draftsDir: drafts });

    const receipt = await p.writePage({ title: "Retry policy", body: "# Retry policy\n\nOnly idempotent tools retry.\n", scope: "ops" });
    expect(receipt.pageId).toBe("ops/retry-policy.md");
    // invisible until committed:
    expect((await p.search("retry idempotent"))).toEqual([]);
    expect((await p.bootstrap({ tenantId: "t" })).index.entries.some((e) => e.id.includes("retry"))).toBe(false);

    // commit WITHOUT a confirmation credential: refused (structural gate)
    expect(() =>
      commitDraft({
        bookRoot: book,
        draftsDir: drafts,
        receiptsLog: ledger,
        receiptId: receipt.receiptId,
        pageId: receipt.pageId,
        evidence: "runbook migration",
        confirmation: { confirmedBy: "", confirmedAtMs: 0 },
      }),
    ).toThrow(/no human confirmation credential/);
    expect((await p.search("retry idempotent"))).toEqual([]);

    // commit WITH credential: file + git history + searchable
    const res = commitDraft({
      bookRoot: book,
      draftsDir: drafts,
      receiptsLog: ledger,
      receiptId: receipt.receiptId,
      pageId: receipt.pageId,
      evidence: "oncall asked twice this week",
      confirmation: { confirmedBy: "cli-user:yes", confirmedAtMs: Date.now() },
    });
    expect(res.appended).toBe(false);
    expect(readFileSync(res.path, "utf8")).toContain("Only idempotent tools retry.");
    const log = execFileSync("git", ["log", "--format=%B", "-1"], { cwd: book, encoding: "utf8" });
    expect(log).toContain("evidence: oncall asked twice this week");
    expect(log).toContain("Assisted-by: agentos knowledge writeback");
    const hits = await p.search("retry idempotent");
    expect(hits.map((h) => h.id)).toContain("ops/retry-policy.md");

    // append mode: second draft targeting the SAME page appends
    const r2 = await p.writePage({ targetPageId: "ops/retry-policy.md", title: "more", body: "Appendix A.\n" });
    const res2 = commitDraft({
      bookRoot: book,
      draftsDir: drafts,
      receiptsLog: ledger,
      receiptId: r2.receiptId,
      pageId: r2.pageId,
      evidence: "append demo",
      confirmation: { confirmedBy: "web-user:yes", confirmedAtMs: Date.now() },
    });
    expect(res2.appended).toBe(true);
    expect(readFileSync(res2.path, "utf8")).toMatch(/retry.*Appendix A/s);
  });

  it("pageId traversal is refused, not normalized", () => {
    const book = tmp("trav");
    seedBook(book);
    expect(() =>
      commitDraft({
        bookRoot: book,
        draftsDir: join(book, "..", "d"),
        receiptsLog: join(book, "..", "l"),
        receiptId: "r",
        pageId: "../../escape.md",
        evidence: "x",
        confirmation: { confirmedBy: "cli-user:yes", confirmedAtMs: 1 },
      }),
    ).toThrow(/escapes the book root/);
  });
});

describe("capability gates on the neutral tool set", () => {
  const fakeProvider = (write: boolean) => ({
    name: "fake",
    capabilities: { search: true, write },
    bootstrap: async () => ({ index: { entries: [] }, recentUpdates: [] }),
    search: async () => [],
    getPage: async (id: string) => {
      throw new Error(id);
    },
    listPages: async () => ({ entries: [] }),
    writePage: async () => ({ receiptId: "r", pageId: "p", createdAtMs: 0 }),
  });
  const baseCtx = (write: boolean, confirmCapable: boolean) => ({
    provider: fakeProvider(write) as never,
    confirmCapable,
    bookRoot: "/tmp/x",
    draftsDir: "/tmp/d",
    receiptsLog: "/tmp/l",
    workspaceOverviewFile: "/tmp/o.md",
    confirm: async () => ({ approved: false }),
    tenant: { tenantId: "t" },
  });

  it("provider write:false -> no kb_write/kb_commit registered", () => {
    const names = buildKbTools(baseCtx(false, true)).map((t: NeutralTool) => t.name);
    expect(names).toEqual(["kb_overview", "kb_search", "kb_get_page"]);
  });
  it("entry confirm:false -> write tools absent even for a writable provider", () => {
    const names = buildKbTools(baseCtx(true, false)).map((t) => t.name);
    expect(names).not.toContain("kb_write");
    expect(names).not.toContain("kb_commit");
  });
  it("both capable -> five tools", () => {
    expect(buildKbTools(baseCtx(true, true))).toHaveLength(5);
  });

  it("kb_commit denied by human -> committed:false, no git touched", async () => {
    const dir = tmp("deny");
    seedBook(dir);
    const drafts = join(dir, "..", "drafts");
    const p = createMarkdownProvider({ root: dir, draftsDir: drafts });
    const receipt = await p.writePage({ title: "Denied", body: "# Denied\nsecret sauce\n" });
    const tools = buildKbTools({
      provider: p,
      confirmCapable: true,
      bookRoot: dir,
      draftsDir: drafts,
      receiptsLog: join(dir, "..", "l.jsonl"),
      workspaceOverviewFile: join(dir, "..", "ov.md"),
      confirm: async () => ({ approved: false, decidedBy: "cli-user:no" }),
      tenant: { tenantId: "t" },
    });
    const commit = tools.find((t) => t.name === "kb_commit")!;
    const res = (await commit.handler({ receiptId: receipt.receiptId, evidence: "try" })) as { committed: boolean; reason: string };
    expect(res.committed).toBe(false);
    expect((await p.search("secret sauce"))).toEqual([]); // still invisible
  });
});

describe("rendering is deterministic", () => {
  it("same structure -> byte-identical overview; guide carries the search pointer", async () => {
    const book = tmp("render");
    seedBook(book);
    const ov = await providerIn(book).bootstrap({ tenantId: "t" });
    expect(renderOverview(ov, { name: "kb" })).toBe(renderOverview(ov, { name: "kb" }));
    expect(renderOverview(ov)).toContain("kb_search");
    expect(renderOverview(ov)).toContain("mcp.md");
  });
});

describe("escalationGate config shape", () => {
  const kbBase = { kind: "knowledge", version: "1", name: "k", provider: "markdown", mount: { type: "path", path: "./knowledge-base" } };
  it("absent is legal (query applies defaults)", () => {
    expect(knowledgeManifestSchema.safeParse(kbBase).success).toBe(true);
  });
  it("explicit gate parses", () => {
    const r = knowledgeManifestSchema.safeParse({ ...kbBase, escalationGate: { minPerWeek: 3, windowDays: 7 } });
    expect(r.success).toBe(true);
  });
  it("zero/negative/fractional gate values are rejected", () => {
    for (const bad of [
      { minPerWeek: 0, windowDays: 7 },
      { minPerWeek: 3, windowDays: -1 },
      { minPerWeek: 2.5, windowDays: 7 },
    ]) {
      expect(knowledgeManifestSchema.safeParse({ ...kbBase, escalationGate: bad }).success).toBe(false);
    }
  });
});
