/** Public surface of governance: two-phase writeback, rendering, neutral kb tools. */
export {
  commitDraft,
  appendDraftLedger,
  type CommitConfirmation,
  type CommitDraftArgs,
  type CommitDraftResult,
} from "./writeback.js";
export { MAX_INDEX_ENTRIES, renderIndex, renderOverview } from "./render.js";
export {
  OFFLOAD_THRESHOLD_BYTES,
  offloadIfLarge,
  type OffloadOptions,
  type OffloadOutcome,
  type OffloadPointer,
} from "./offload.js";
export { buildKbTools, KB_POINTER_LINE, kbPointerLine, type KbToolContext } from "./tools.js";
export { buildTodoTools, type TodoToolContext } from "./todo-tools.js";
export {
  splitFrontmatter,
  validatePageFrontmatter,
  type FrontmatterIssue,
  type FrontmatterVerdict,
} from "./frontmatter.js";
