/**
 * Shared envelope for every manifest. kind + version are pinned at top level so
 * a loader can route to the per-kind schema without parsing the body, and so
 * schema evolution is version-gated in one place.
 * Envelope fields are literals, which lets child schemas narrow `kind` to a
 * single literal via .extend() — the per-kind schemas are then independently
 * discriminable and independently testable.
 */
import { z } from "zod";

export const manifestEnvelopeSchema = z.strictObject({
  /** Routing key: selects the per-kind schema the body is validated against. */
  kind: z.enum(["tool", "model", "knowledge", "preset"]),
  /** Manifest schema version. Only "1" exists; unknown values reject (fail-closed, no guessing). */
  version: z.literal("1"),
});

export type ManifestEnvelope = z.infer<typeof manifestEnvelopeSchema>;
