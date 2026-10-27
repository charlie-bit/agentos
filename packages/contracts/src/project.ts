/**
 * Project TEMPLATE manifest (spec #388, ruling A/D): configuration, git-owned.
 * It declares which roles/workflows/tools/knowledge a project may use; the
 * project INSTANCE (title, todos, sessions, runs) is runtime data and is
 * writable from the web — instances can never mutate these template fields
 * (#390).
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

const names = z.array(z.string().min(1)).optional();

export const projectManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("project"),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  agents: names,
  workflows: names,
  tools: names,
  knowledge: names,
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
