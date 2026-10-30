/**
 * First-run guidance (spec #268). Three empty situations, in order of what
 * actually blocks the user: no provider mounted at all (nothing can run),
 * then no sessions yet (nothing has run), then no knowledge socket (runs, but
 * with no project memory). The variant drives both copy and next action, so
 * an empty console never looks like a broken one.
 */
export type EmptyVariant = "no-provider" | "no-sessions" | "no-kb";

export interface EmptyInputs {
  /** Ledger rows visible to this viewer. */
  sessionCount: number;
  /** Tool providers currently mounted. */
  mountCount: number;
  /** Whether a knowledge socket resolved for this preset. */
  hasKnowledge: boolean;
}

export function emptyVariant(input: EmptyInputs): EmptyVariant | null {
  if (input.mountCount === 0) return "no-provider";
  if (input.sessionCount === 0) return "no-sessions";
  if (!input.hasKnowledge) return "no-kb";
  return null;
}

export const EMPTY_COPY: Record<EmptyVariant, { title: string; body: string; action: string }> = {
  "no-provider": {
    title: "No tools are mounted",
    body: "This preset resolved zero tool providers, so the agent has only the Read tool. Add a manifest under config/tools/ and point the preset's tools: slot at it.",
    action: "Inspect ConfigDialog for what did resolve",
  },
  "no-sessions": {
    title: "No sessions yet",
    body: "Send the first message to create a ledger row. Sessions are local to this machine and can be renamed or deleted from the sidebar.",
    action: "Type a question below",
  },
  "no-kb": {
    title: "No knowledge socket",
    body: "The agent runs, but it has no project knowledge base. Add a knowledge manifest and reference it from the preset's knowledge: slot to enable kb_search and two-phase writeback.",
    action: "Continue without it, or add config/knowledge/*.yml",
  },
};
