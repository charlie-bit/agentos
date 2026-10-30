/**
 * Skills mount (stage C): a directory of SKILL.md files, declared like any
 * other socket. Skills are instructions, not tools — the workflow `skill` step
 * resolves one by name and runs its body as the turn's system-prompt addition.
 *
 * The manifest carries a MOUNT (where the directory is), never the skill text:
 * the catalogue is discovered at startup, exactly like knowledge pages and MCP
 * tools. Names are repo-relative paths resolved by the composition root.
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

export const skillsManifestSchema = manifestEnvelopeSchema.extend({
  kind: z.literal("skills"),
  name: z.string().min(1),
  mount: z.strictObject({
    type: z.literal("path"),
    /** Repo-relative directory scanned for **\/SKILL.md. */
    path: z.string().min(1),
  }),
});

export type SkillsManifest = z.infer<typeof skillsManifestSchema>;

/** One mounted skill, as the catalogue and the workflow runner see it. */
export interface SkillEntry {
  /** Frontmatter `name`, else the containing directory name. */
  readonly name: string;
  readonly description: string;
  /** Instruction body without the frontmatter fence. */
  readonly body: string;
  readonly path: string;
}
