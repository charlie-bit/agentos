/**
 * Dialect identity display (spec #213). A compatibility endpoint serves a
 * model whose real identity is not the vendor it looks like; the console must
 * say so instead of letting the badge imply a native deployment. Bedrock uses
 * the vendor-native credential chain, so it gets no compatibility badge.
 */
export function isCompatDialect(dialect: string | null | undefined): boolean {
  return dialect === "anthropic-compat" || dialect === "openai-compat";
}

/** Short badge label, or null when the deployment is native. */
export function dialectBadge(dialect: string | null | undefined): string | null {
  if (dialect === "anthropic-compat") return "compat endpoint";
  if (dialect === "openai-compat") return "openai-compat";
  return null; // bedrock and unknown: no compat claim to make
}
