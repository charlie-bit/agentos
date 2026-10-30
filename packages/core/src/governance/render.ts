/**
 * Overview rendering lives HERE, not in providers (contract law: providers
 * return structure; the entry layer presents; the bootstrap guide sits in
 * between as a rendered artifact core owns). Rendering is a PURE function of
 * the KbOverview structure — same input, byte-identical output (idempotency
 * is asserted by conformance; the file is safe to rewrite every session).
 */
import type { KbOverview } from "@agentos/contracts";

const fmtDate = (ms: number | undefined): string => (ms === undefined ? "—" : new Date(ms).toISOString().slice(0, 10));

/**
 * Index menu budget (spec #225). The guide is resident context, so it must
 * stay inside the 1–2K-token promise (#61) even for a 500-page corpus. 120
 * path lines ≈ 800–1,200 tokens once directory lines are counted; the tail is
 * summarized as "(…N more)" and pointed at kb_search, which is always
 * available and exact.
 */
export const MAX_INDEX_ENTRIES = 120;

/** Directory tree of index entries, path-grouped, stable order, bounded by MAX_INDEX_ENTRIES. */
export function renderIndex(overview: KbOverview, opts: { maxEntries?: number } = {}): string {
  const max = Math.max(1, opts.maxEntries ?? MAX_INDEX_ENTRIES);
  const all = [...overview.index.entries].sort((a, b) => a.id.localeCompare(b.id));
  const shown = all.length > max ? all.slice(0, max) : all;
  const hidden = all.length - shown.length;
  const byPrefix = new Map<string, string[]>();
  for (const e of shown) {
    const slash = e.id.lastIndexOf("/");
    const dir = slash < 0 ? "." : e.id.slice(0, slash);
    const list = byPrefix.get(dir) ?? [];
    list.push(slash < 0 ? e.id : e.id.slice(slash + 1));
    byPrefix.set(dir, list);
  }
  const lines: string[] = [];
  for (const dir of [...byPrefix.keys()].sort()) {
    if (dir !== ".") lines.push(`${dir}/`);
    for (const name of (byPrefix.get(dir) ?? []).sort()) lines.push(dir === "." ? `  ${name}` : `    ${name}`);
  }
  if (hidden > 0) lines.push(`… (${hidden} more page${hidden === 1 ? "" : "s"} — use kb_search to find them by topic)`);
  return lines.join("\n");
}

export function renderOverview(overview: KbOverview, opts: { name?: string } = {}): string {
  const recent = overview.recentUpdates
    .map((e) => `- ${fmtDate(e.timestampMs)}  ${e.id}  (${e.title})`)
    .join("\n");
  return [
    `# ${opts.name ?? "Knowledge"} — overview`,
    "",
    "## Where things are",
    "",
    "```",
    renderIndex(overview) || "(empty corpus)",
    "```",
    "",
    "## Recently verified",
    "",
    recent || "—",
    "",
    "Search for detail with the kb_search tool; open a page with kb_get_page.",
    "Write only via kb_write (draft) + kb_commit (human-confirmed).",
    "",
  ].join("\n");
}
