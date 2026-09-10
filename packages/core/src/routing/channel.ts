/**
 * The neutral model-channel vocabulary crossing the core <-> adapter boundary.
 * Kernel env names (ANTHROPIC_*, CLAUDE_CODE_USE_BEDROCK) NEVER appear here —
 * translating this shape into a kernel's dialect is the adapter's job and
 * only the adapter's (discipline, not preference: rented kernels change).
 * Values (resolved baseUrl/authToken) are runtime-memory-only: never logged,
 * never persisted, never on an event stream — same hygiene law as ToolMountPlan.
 */

/** The manifest subset every dialect consumes. */
export interface ModelLeaseLike {
  provider: string;
  baseUrlEnv?: string;
  credentialsEnv?: string;
}

export interface ModelChannel {
  /** Anthropic-compatible endpoint URL, when leased via env. */
  baseUrl?: string;
  /** Credential value for that URL, read from env at this boundary only. */
  authToken?: string;
  /**
   * Vendor-native credential chain marker (e.g. "bedrock"): no url/key here —
   * the kernel's documented switch owns the chain. Mutually exclusive with a
   * leased baseUrl in practice (selection encodes that rule).
   */
  nativeChain?: string;
}

export type DialectTag = "anthropic-compat" | "bedrock";

/**
 * Dialect selection — one rule, one home:
 * explicit url lease wins even for bedrock; vendor-native switch applies
 * only with no url lease and provider "aws-bedrock".
 * (Semantics carried verbatim from the adapter's P2 resolveChannel: this is
 * a relocation, not a policy change.)
 */
export function selectDialect(lease: ModelLeaseLike): DialectTag {
  return !lease.baseUrlEnv && lease.provider === "aws-bedrock" ? "bedrock" : "anthropic-compat";
}

/** alias → real model id; unknown alias THROWS — misconfiguration, per contract semantics. */
export function resolveModelAlias(models: Readonly<Record<string, string>>, alias: string): string {
  const id = models[alias];
  if (id === undefined) {
    throw new Error(`unknown model alias ${JSON.stringify(alias)} (have: ${Object.keys(models).join(", ") || "none"})`);
  }
  return id;
}
