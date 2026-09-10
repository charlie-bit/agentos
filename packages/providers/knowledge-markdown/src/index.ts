/**
 * The markdown KnowledgeProvider: filesystem corpora (mount.path may be a
 * single .md file OR a directory scanned recursively). Lexical search only —
 * hand-rolled, zero deps; semantic/vector retrieval is explicitly P8
 * (WeKnora territory), not a missing feature here.
 *
 * Two-phase write law lives at this edge: writePage drops a DRAFT under the
 * drafts dir and returns a receipt — the corpus is never touched directly,
 * so drafts are structurally invisible to search/bootstrap (they don't live
 * under the mount root). Committing is governance's, gated by confirm.
 *
 * Providers return STRUCTURE; zero rendering in every method (the overview
 * document is core/governance's job).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type {
  KbDraft,
  KbHit,
  KbIndex,
  KbIndexEntry,
  KbOverview,
  KbPage,
  KnowledgeProvider,
  PageId,
  Scope,
  SearchOpts,
  TenantRef,
  WriteReceipt,
} from "@agentos/contracts";

export interface MarkdownProviderOptions {
  /** Provider name reported via the interface. */
  name?: string;
  /** mount.path resolved absolute (file or directory of *.md). */
  root: string;
  /** Where two-phase drafts land (OUTSIDE root — invisibility by location). */
  draftsDir: string;
  /** recentUpdates Top-N for bootstrap (small). */
  recentTopN?: number;
  now?: () => number;
}

/** Minimal `---` fenced `key: value` frontmatter; no YAML lib (documented subset). */
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

function parseDateMs(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

interface Page {
  id: PageId;
  title: string;
  raw: string;
  body: string;
  meta: Record<string, string>;
  mtimeMs: number;
}

export function createMarkdownProvider(opts: MarkdownProviderOptions): KnowledgeProvider {
  const root = resolve(opts.root);
  const draftsDir = resolve(opts.draftsDir);
  const topN = opts.recentTopN ?? 5;
  const now = opts.now ?? Date.now;

  function mdFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".git" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...mdFiles(p));
      else if (/\.md$/i.test(e.name)) out.push(p);
    }
    return out.sort();
  }

  function pages(): Page[] {
    let files: string[];
    const st = statSync(root, { throwIfNoEntry: false });
    if (!st) return [];
    if (st.isFile()) files = root.toLowerCase().endsWith(".md") ? [root] : [];
    else files = mdFiles(root);
    return files.map((f) => {
      const raw = readFileSync(f, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const firstHeading = /^#\s+(.+)$/m.exec(body);
      return {
        id: relative(root, f).split(sep).join("/") || f, // single-file mount: id = filename
        title: firstHeading?.[1]?.trim() ?? meta["title"] ?? f,
        raw,
        body,
        meta,
        mtimeMs: statSync(f).mtimeMs,
      };
    });
  }

  function toEntry(p: Page): KbIndexEntry {
    return { id: p.id, title: p.title, timestampMs: parseDateMs(p.meta["last_verified"]) ?? p.mtimeMs };
  }

  const tokenize = (s: string): string[] =>
    s
      .toLowerCase()
      .split(/[^a-z0-9一-鿿]+/)
      .filter((t) => t.length > 0);

  return {
    name: opts.name ?? "markdown",
    capabilities: { search: true, write: true },

    async bootstrap(tenant: TenantRef): Promise<KbOverview> {
      void tenant; // tenancy is a P8 server-side concept; filesystem ignores it
      const all = pages();
      const recentUpdates = all
        .map(toEntry)
        .sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0))
        .slice(0, topN);
      return { index: { entries: all.map(toEntry) }, recentUpdates };
    },

    async search(q: string, search?: SearchOpts): Promise<KbHit[]> {
      const tokens = tokenize(q);
      if (tokens.length === 0) return []; // empty query is not an error
      const hits: KbHit[] = [];
      for (const p of pages()) {
        if (search?.scope !== undefined && !p.id.startsWith(search.scope)) continue;
        const bodyL = p.body.toLowerCase();
        const titleL = p.title.toLowerCase();
        let score = 0;
        let firstAt = -1;
        for (const t of tokens) {
          const inTitle = titleL.includes(t);
          const idx = bodyL.indexOf(t);
          if (inTitle) score += 2;
          if (idx >= 0) {
            score += 1;
            if (firstAt < 0) firstAt = idx;
          }
        }
        if (score === 0) continue;
        const snippet =
          firstAt >= 0 ? p.body.slice(Math.max(0, firstAt - 40), firstAt + 120).replace(/\s+/g, " ").trim() : undefined;
        hits.push({ id: p.id, title: p.title, score, ...(snippet !== undefined ? { snippet } : {}) });
      }
      hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      return search?.limit !== undefined ? hits.slice(0, Math.max(0, search.limit)) : hits;
    },

    async getPage(id: PageId): Promise<KbPage> {
      const p = pages().find((x) => x.id === id);
      if (!p) throw new Error(`unknown page id: ${id}`); // absence is exceptional here (contract)
      return { id: p.id, title: p.title, body: p.raw, timestampMs: parseDateMs(p.meta["last_verified"]) ?? p.mtimeMs };
    },

    async listPages(scope?: Scope): Promise<KbIndex> {
      const entries = pages()
        .filter((p) => scope === undefined || p.id.startsWith(scope))
        .map(toEntry);
      return { entries };
    },

    async writePage(draft: KbDraft): Promise<WriteReceipt> {
      const receiptId = randomUUID();
      const pageId = draft.targetPageId ?? `${(draft.scope ? `${draft.scope}/` : "") + slug(draft.title)}.md`;
      // receiptId is OUR uuid, so the draft file cannot escape the dir;
      // targetPageId (caller-supplied) is sanitized later, at commit time.
      const file = join(draftsDir, `${receiptId}.md`);
      mkdirSync(dirname(file), { recursive: true });
      const header = [
        `<!-- agentos draft ${receiptId} -->`,
        `<!-- target: ${draft.targetPageId ?? "NEW " + pageId} -->`,
        "",
      ].join("\n");
      writeFileSync(file, header + draft.body, "utf8");
      return { receiptId, pageId, createdAtMs: now() };
    },
  };
}

function slug(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "page";
}
