/**
 * The neutral kb tool set (JSON Schema in, JSON data out — no kernel types
 * anywhere). Capability gates are ENFORCED here, not advertised: if the
 * provider cannot write or the entry cannot ask a human, kb_write/kb_commit
 * do not exist in the registry at all (read-only degradation by omission).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ConfirmResult, KnowledgeProvider, NeutralTool } from "@agentos/contracts";
import { commitDraft, appendDraftLedger, type CommitConfirmation } from "./writeback.js";
import { renderOverview } from "./render.js";

export interface KbToolContext {
  provider: KnowledgeProvider;
  /** Entry can ask a human (capabilities.confirm). false => write tools omitted. */
  confirmCapable: boolean;
  bookRoot: string;
  draftsDir: string;
  receiptsLog: string;
  /** Where the rendered bootstrap guide is (re)written by kb_overview. */
  workspaceOverviewFile: string;
  /** Out-of-band human gate (chat: readline; web: SSE modal). */
  confirm: (req: { prompt: string; subject: Record<string, unknown> }) => Promise<ConfirmResult>;
  tenant: { tenantId: string };
}

const str = { type: "string" } as const;
const num = { type: "number" } as const;

export function buildKbTools(ctx: KbToolContext): NeutralTool[] {
  const writable = ctx.provider.capabilities.write && ctx.confirmCapable;

  const overview = async (): Promise<string> => {
    const ov = await ctx.provider.bootstrap(ctx.tenant);
    const md = renderOverview(ov, { name: ctx.provider.name });
    mkdirSync(dirname(ctx.workspaceOverviewFile), { recursive: true });
    writeFileSync(ctx.workspaceOverviewFile, md, "utf8");
    return md;
  };

  const tools: NeutralTool[] = [
    {
      name: "kb_overview",
      description: "Refresh the knowledge-base guide (index tree + recently verified) and return it.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ markdown: await overview() }),
    },
    {
      name: "kb_search",
      description: "Lexical search over the knowledge base. Empty list means no hits, not failure.",
      inputSchema: { type: "object", properties: { q: str, limit: num }, required: ["q"] },
      handler: async (input) => ({
        hits: await ctx.provider.search(String(input.q ?? ""), input.limit === undefined ? undefined : { limit: Number(input.limit) }),
      }),
    },
    {
      name: "kb_get_page",
      description: "Return a page's raw markdown by id (from kb_search or kb_overview).",
      inputSchema: { type: "object", properties: { id: str }, required: ["id"] },
      handler: async (input) => await ctx.provider.getPage(String(input.id ?? "")),
    },
  ];

  if (writable) {
    tools.push(
      {
        name: "kb_write",
        description:
          "Stage a knowledge page as a DRAFT (two-phase write, beat 1). Returns a receipt; the page is invisible to search until kb_commit succeeds.",
        inputSchema: {
          type: "object",
          properties: { title: str, body: str, scope: str, targetPageId: str },
          required: ["title", "body"],
        },
        handler: async (input) => {
          const receipt = await ctx.provider.writePage({
            title: String(input.title ?? ""),
            body: String(input.body ?? ""),
            scope: input.scope === undefined ? undefined : String(input.scope),
            targetPageId: input.targetPageId === undefined ? undefined : String(input.targetPageId),
          });
          appendDraftLedger(ctx.receiptsLog, { receiptId: receipt.receiptId, pageId: receipt.pageId });
          return { ...receipt, next: "call kb_commit with this receiptId and an evidence line; a human must confirm" };
        },
      },
      {
        name: "kb_commit",
        description:
          "Commit a kb_write draft into the knowledge book (beat 2). ALWAYS asks a human first; refusal (or no answer) leaves the draft invisible.",
        inputSchema: { type: "object", properties: { receiptId: str, evidence: str }, required: ["receiptId", "evidence"] },
        handler: async (input) => {
          const receiptId = String(input.receiptId ?? "");
          const evidence = String(input.evidence ?? "");
          const answer = await ctx.confirm({ prompt: `Commit KB draft ${receiptId}? evidence: ${evidence}`, subject: { receiptId, evidence } });
          if (!answer.approved) {
            return { committed: false, reason: `denied (${answer.decidedBy ?? "no-answer"})`, note: "draft remains invisible" };
          }
          const draftLine = { receiptId };
          appendDraftLedger(ctx.receiptsLog, { phase: "confirm", ...draftLine, decidedBy: answer.decidedBy });
          // pageId must come from the receipt ledger, not the model: read it back.
          const pageId = pageIdFromLedger(ctx.receiptsLog, receiptId);
          if (pageId === undefined) return { committed: false, reason: `unknown receiptId ${receiptId}` };
          const confirmation: CommitConfirmation = {
            confirmedBy: answer.decidedBy ?? "human",
            confirmedAtMs: answer.timestampMs ?? Date.now(),
          };
          const result = commitDraft({
            bookRoot: ctx.bookRoot,
            draftsDir: ctx.draftsDir,
            receiptsLog: ctx.receiptsLog,
            receiptId,
            pageId,
            evidence,
            confirmation,
          });
          return { committed: true, ...result };
        },
      },
    );
  }
  return tools;
}

/** Newest draft ledger line for a receipt -> its pageId (model cannot forge the path). */
function pageIdFromLedger(receiptsLog: string, receiptId: string): string | undefined {
  try {
    const lines = readFileSync(receiptsLog, "utf8").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const rec = JSON.parse(lines[i] as string) as { phase?: string; receiptId?: string; pageId?: string };
        if (rec.phase === "draft" && rec.receiptId === receiptId && typeof rec.pageId === "string") return rec.pageId;
      } catch {
        /* skip malformed ledger line */
      }
    }
  } catch {
    /* no ledger yet */
  }
  return undefined;
}

/** Public prompt line pointing a session at the rendered guide. */
export const KB_POINTER_LINE = "Project knowledge: read ./kb-overview.md first (already generated); then kb_search for detail, kb_get_page to open a page.";
