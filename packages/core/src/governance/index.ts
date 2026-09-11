/** Public surface of governance: two-phase writeback, rendering, neutral kb tools. */
export {
  commitDraft,
  appendDraftLedger,
  type CommitConfirmation,
  type CommitDraftArgs,
  type CommitDraftResult,
} from "./writeback.js";
export { renderIndex, renderOverview } from "./render.js";
export { buildKbTools, KB_POINTER_LINE, type KbToolContext } from "./tools.js";
export {
  splitFrontmatter,
  validatePageFrontmatter,
  type FrontmatterIssue,
  type FrontmatterVerdict,
} from "./frontmatter.js";
