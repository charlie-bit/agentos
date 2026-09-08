/**
 * The ToolProvider manifest describes WHERE a tool server lives and HOW to reach
 * it — never the tool definitions themselves, which are discovered at runtime
 * over the MCP wire protocol (modelcontextprotocol).
 * transport / auth / idempotency are three independent axes combined by the
 * loader, so each is its own strict object. transport-conditional fields use a
 * discriminated union: members omit inapplicable keys, and strictness then
 * rejects e.g. `endpoint` on a stdio entry instead of ignoring it.
 */
import { z } from "zod";
import { manifestEnvelopeSchema } from "./manifest.js";

/**
 * Literal secrets are refused at the schema layer: strict object over
 * { mode, env } — any other key (token / key / value / secret) is a parse error.
 * `env` carries the NAME of an environment variable, never its value.
 */
export const toolAuthSchema = z
  .strictObject({
    /** "none" = local process, no credential. "header-env" = named header sourced from env. */
    mode: z.enum(["none", "bearer-token-env", "header-env"]),
    /** Env var name to read at mount time. Required unless mode = "none". */
    env: z.string().min(1).optional(),
  })
  .refine((a) => a.mode === "none" || a.env !== undefined, {
    message: 'env is required when mode is not "none"',
  });

/** The framework decides auto-retry from this: a tool not declared idempotent is never retried automatically. */
export const toolIdempotencySchema = z.strictObject({
  /** Applies to every discovered tool unless listed in overrides. */
  default: z.boolean(),
  /** tool-name → idempotent. Use to carve out mutating tools from a mostly-read server. */
  overrides: z.record(z.string(), z.boolean()).optional(),
});

const toolManifestBase = manifestEnvelopeSchema.extend({
  kind: z.literal("tool"),
  /** Preset reference key (config/ name). */
  name: z.string().min(1),
  auth: toolAuthSchema,
  idempotent: toolIdempotencySchema.optional(),
  /** Allowlist over discovered tools; absent = mount everything discovered. */
  allowedTools: z.array(z.string().min(1)).optional(),
  /** Labels of environments this entry may mount into; absent = all. */
  envRouting: z.array(z.string().min(1)).optional(),
  /** false = declared but not mounted; kept for diff visibility. */
  enabled: z.boolean().optional(),
  /**
   * Cross-kernel tool schemas are exchanged as JSON Schema only; each side
   * converts to its own dialect. Deliberately a fixed literal: Zod v3/v4
   * schemas are mutually incompatible (per public changelog) and passing them
   * across the adapter seam drops tool fields silently.
   */
  schemaExchange: z.literal("json-schema"),
});

export const toolProviderManifestSchema = z.discriminatedUnion("transport", [
  /** In-process tool server supplied by an adapter; no external process to reach. */
  toolManifestBase.extend({ transport: z.literal("sdk") }),
  /** Local process spawned by the loader; tool traffic over stdio. */
  toolManifestBase.extend({
    transport: z.literal("stdio"),
    /** Full spawn command line (executable + args). Shell interpretation is adapter-side. */
    command: z.string().min(1),
  }),
  /** Remote MCP server; tool traffic over HTTP. */
  toolManifestBase.extend({
    transport: z.literal("http"),
    /** Absolute http(s) URL of the MCP server endpoint. */
    endpoint: z.url(),
  }),
]);

export type ToolAuth = z.infer<typeof toolAuthSchema>;
export type ToolIdempotency = z.infer<typeof toolIdempotencySchema>;
export type ToolProviderManifest = z.infer<typeof toolProviderManifestSchema>;
