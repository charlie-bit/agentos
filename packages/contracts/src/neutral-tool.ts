/**
 * NeutralTool — the kernel-free in-process tool definition (P7 pure addition;
 * no existing type touched). core/governance PRODUCES these; adapters
 * translate them into whatever shape their kernel demands (the Claude Agent
 * SDK wants zod raw shapes — that conversion is adapter-side, which is
 * exactly why this type speaks JSON Schema instead: the standard every
 * kernel can reach, per the same JSON-Schema-exchange law pinned in tool.ts.
 * handler results are JSON-serializable data; presentation is the caller's.
 */

/** JSON Schema (2020-12 subset: object with typed properties) — data, not code. */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, { type: "string" | "number" | "boolean" | "array" }>;
  required?: string[];
}

export interface NeutralTool {
  /** Bare name (no mcp__ prefix — the mount key namespaces it). */
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  /** Input already validated/coerced by the kernel transport; output is JSON data. */
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}
