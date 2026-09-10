/**
 * Knowledge contract split: runtime interface (behavior) + manifest (mount).
 * Providers return STRUCTURE only, never rendered text — the entry layer owns
 * presentation, so one provider serves CLI, chat, and HTTP identically.
 * Writes are two-phase: writePage produces a draft + receipt; visibility of
 * uncommitted content is the thing the contract protects hardest, because a
 * silent leak here puts drafts in front of end users.
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

export type PageId = string;
export type Scope = string;

/** Attribution unit for permission checks and usage; one per tenant isolation domain. */
export interface TenantRef {
  readonly tenantId: string;
  /** Server-side partition on multi-tenant KB backends; absent = provider ignores tenancy. */
  readonly workspaceId?: string;
}

export interface SearchOpts {
  /** Upper bound on returned hits; provider applies its own default when absent. */
  readonly limit?: number;
  /** Restrict to a scope subtree; absent = whole tenant corpus. */
  readonly scope?: Scope;
}

export interface KbIndexEntry {
  readonly id: PageId;
  readonly title: string;
  /** Unix epoch ms of last content change; absent = provider does not track it. */
  readonly timestampMs?: number;
}

export interface KbIndex {
  readonly entries: KbIndexEntry[];
}

/** Raw structure for the bootstrap guide — no pre-rendered text in here. */
export interface KbOverview {
  readonly index: KbIndex;
  /** Top-N most recently updated, newest first. N is provider-chosen and small. */
  readonly recentUpdates: KbIndexEntry[];
}

export interface KbHit {
  readonly id: PageId;
  readonly title: string;
  /** Relevance score; comparable only within the same result set. */
  readonly score: number;
  /** Short context fragment; absent = provider returns no snippets. */
  readonly snippet?: string;
}

export interface KbPage {
  readonly id: PageId;
  readonly title: string;
  /** Raw body (markdown/plaintext UTF-8). No rendering instructions — presentation is core's job. */
  readonly body: string;
  readonly timestampMs?: number;
}

/** Input to the first write phase. targetPageId absent = create. */
export interface KbDraft {
  readonly targetPageId?: PageId;
  /** Required for creates; placement of the new page. */
  readonly scope?: Scope;
  readonly title: string;
  readonly body: string;
}

/** Proof that a draft exists. Holding a receipt grants no visibility to readers. */
export interface WriteReceipt {
  readonly receiptId: string;
  readonly pageId: PageId;
  /** Unix epoch ms the draft was created. */
  readonly createdAtMs: number;
}

/** The knowledge socket. Behavior contract; implementations are mounted by manifest. */
export interface KnowledgeProvider {
  readonly name: string;
  /**
   * write:false ⇒ core MUST disable kb_write/kb_commit tool registration for
   * this provider — the entry path is read-only.
   */
  readonly capabilities: { search: boolean; write: boolean };
  /**
   * Bootstrap guide: structured table of contents + Top-N recent updates.
   * Rendering the guide is core's responsibility; providers must not return
   * pre-formatted text.
   */
  bootstrap(tenant: TenantRef): Promise<KbOverview>;
  /** No hits returns an empty array — not an error, must not throw. */
  search(q: string, opts?: SearchOpts): Promise<KbHit[]>;
  /** Unknown id throws (not a null page): absence of a page is exceptional at call sites. */
  getPage(id: PageId): Promise<KbPage>;
  /** Full index; scope narrows to a subtree. */
  listPages(scope?: Scope): Promise<KbIndex>;
  /**
   * First beat of the two-phase write: creates a draft and returns a receipt.
   * Writes not yet committed must NOT appear in search/bootstrap results.
   */
  writePage(draft: KbDraft): Promise<WriteReceipt>;
}

/** Mount type is a deployment detail swappable per preset; the contract only ever asks for "a readable file source". */
const knowledgeMountSchema = z.discriminatedUnion("type", [
  /** Git submodule checked out with the app; path is relative to repo root. */
  z.strictObject({
    type: z.literal("submodule"),
    path: z.string().min(1),
    /** Pinned submodule revision; absent = whatever the parent repo points at. */
    ref: z.string().min(1).optional(),
  }),
  /**
   * Plain filesystem source: either a single .md file (single-page corpus) or a
   * directory (provider scans *.md recursively). Provider decides via stat —
   * the contract only ever asks for "a readable file source".
   */
  z.strictObject({
    type: z.literal("path"),
    path: z.string().min(1),
  }),
  /** Loader keeps a local clone fresh; sync cadence and target are deployment-side. */
  z.strictObject({
    type: z.literal("git-sync"),
    repoUrl: z.string().min(1),
    /** Branch/tag/commit to follow; absent = default branch. */
    ref: z.string().min(1).optional(),
    /** Local checkout directory. */
    targetPath: z.string().min(1),
    /** Poll interval in ms; absent = provider default. */
    intervalMs: z.number().int().positive().optional(),
  }),
]);

export const knowledgeManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("knowledge"),
  /** Preset reference key (config/ name). */
  name: z.string().min(1),
  /** Which KnowledgeProvider implementation instantiates this. */
  provider: z.string().min(1),
  mount: knowledgeMountSchema,
  /** Opaque workspace/partition id forwarded to a multi-tenant KB server. */
  workspaceId: z.string().min(1).optional(),
  /** Env var name carrying the KB token; never the token. */
  tokenEnv: z.string().min(1).optional(),
  /**
   * P7a pure addition — content-legislation trigger gate (P7b). Deployment
   * policy DATA, consumed ONLY by the cli `kb gate` query; no runtime layer
   * reads it. absent = { minPerWeek: 3, windowDays: 7 }.
   */
  escalationGate: z
    .strictObject({
      /** Human-handoff events needed within the window to trigger the gate. */
      minPerWeek: z.number().int().min(1),
      /** Sliding window length in days, counted back from now. */
      windowDays: z.number().int().min(1),
    })
    .optional(),
});

export type KnowledgeManifest = z.infer<typeof knowledgeManifestSchema>;
