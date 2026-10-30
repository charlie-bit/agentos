/**
 * Agent role manifest (spec #328, v4 ruling C/D): a config-side role that
 * runs on this kernel. `baseAgent` may only name another config/agents role —
 * external agents are TOOLS (MCP manifests), never base classes (#418).
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

export const agentManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("agent"),
  name: z.string().min(1),
  /** Parent role name (same config/agents tree); absent = runs as "itself". */
  baseAgent: z.string().min(1).optional(),
  /** Required: the role's own instruction text (concatenated after base's). */
  systemPrompt: z.string().min(1),
  /** Tool-allowlist names for this role's turns (#336); absent = preset surface. */
  tools: z.array(z.string().min(1)).optional(),
  /** Knowledge manifest/source reference (#337); absent = full provider. */
  knowledge: z.string().min(1).optional(),
  /** Model manifest/alias reference; absent = preset routing. */
  model: z.string().min(1).optional(),
});

export type AgentManifest = z.infer<typeof agentManifestSchema>;
