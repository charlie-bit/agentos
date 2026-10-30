/**
 * baseAgent inheritance (spec #329): prompts concatenate root→child, tools
 * union (child order kept for its own additions), knowledge/model take the
 * nearest child override. Pure — loading and validation happen elsewhere
 * (#330/#331 reject cycles/dangling refs before this can run).
 */
import type { AgentManifest } from "@agentos/contracts";

export interface ResolvedAgent {
  name: string;
  /** base first, child last; child wording wins where they conflict. */
  systemPrompt: string;
  tools: string[];
  knowledge?: string;
  model?: string;
  /** Root → leaf names, for display (#343). */
  chain: string[];
}

export function resolveAgent(name: string, agents: ReadonlyMap<string, AgentManifest>): ResolvedAgent {
  const root = agents.get(name);
  if (!root) throw new Error(`unknown agent ${JSON.stringify(name)}`);
  const lineage: AgentManifest[] = [];
  const seen = new Set<string>();
  let cursor: AgentManifest | undefined = root;
  while (cursor) {
    if (seen.has(cursor.name)) throw new Error(`baseAgent cycle at ${cursor.name}`);
    seen.add(cursor.name);
    lineage.unshift(cursor);
    cursor = cursor.baseAgent ? agents.get(cursor.baseAgent) : undefined;
  }

  const tools: string[] = [];
  let knowledge: string | undefined;
  let model: string | undefined;
  for (const role of lineage) {
    for (const t of role.tools ?? []) if (!tools.includes(t)) tools.push(t);
    if (role.knowledge !== undefined) knowledge = role.knowledge;
    if (role.model !== undefined) model = role.model;
  }

  return {
    name,
    systemPrompt: lineage.map((r) => r.systemPrompt).join("\n\n"),
    tools,
    ...(knowledge !== undefined ? { knowledge } : {}),
    ...(model !== undefined ? { model } : {}),
    chain: lineage.map((r) => r.name),
  };
}
