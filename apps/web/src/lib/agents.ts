/**
 * Role card derivation (spec #343): the chain label and the fence summary are
 * pure formatting so they can be tested without a DOM.
 */
import type { AgentInfo } from "./api";

export function chainLabel(agent: AgentInfo): string {
  return agent.chain.length > 0 ? agent.chain.join(" → ") : agent.name;
}

export function fenceSummary(agent: AgentInfo): string {
  if (agent.tools.length === 0) return "full preset surface";
  return agent.tools.join(" · ");
}

/** Roles with no baseAgent run as themselves (#339 default). */
export function isSelf(agent: AgentInfo): boolean {
  return agent.baseAgent === undefined;
}
