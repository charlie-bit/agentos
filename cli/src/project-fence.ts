/**
 * Project fence (spec #392): inside a project instance, a turn or a workflow
 * may only use what the instance's TEMPLATE declares. The fence is the
 * intersection of the template's lists with what the preset mounted — the
 * template can never widen the deployment, only narrow it.
 */
import type { ProjectManifest } from "@agentos/contracts";

export type FenceKind = "agents" | "workflows" | "tools" | "knowledge";

/** True when the template allows this name (absent list = nothing allowed). */
export function projectAllows(template: ProjectManifest, kind: FenceKind, name: string): boolean {
  return (template[kind] ?? []).includes(name);
}

/** Names the fence permits, already narrowed to mounted surfaces. */
export function fenceIntersect(template: ProjectManifest, kind: FenceKind, mounted: readonly string[]): string[] {
  const allowed = new Set(template[kind] ?? []);
  return mounted.filter((m) => allowed.has(m));
}

export function fenceError(kind: FenceKind, name: string, templateName: string): Error {
  return new Error(`project "${templateName}" does not allow ${kind.slice(0, -1)} "${name}" (template fence, #392)`);
}
