/**
 * The AWS Bedrock dialect: vendor-native credential chain (SigV4 / bearer
 * token env — publicly documented product surfaces). No url lease means the
 * kernel owns the chain; this dialect only marks it (neutral vocabulary —
 * the kernel env name translation stays adapter-side).
 */
import {
  resolveModelAlias,
  type ModelChannel,
  type ModelLeaseLike,
  type ProbeResult,
} from "@agentos/core";

/**
 * With an explicit baseUrl lease the generic url+key shape wins (selection
 * never routes here in that case, but parity with the compat dialect is kept
 * on purpose). Without it: the native-chain marker, nothing else — no
 * credential value ever passes through this return.
 */
export function resolveChannel(lease: ModelLeaseLike, env: NodeJS.ProcessEnv = process.env): ModelChannel {
  if (lease.baseUrlEnv !== undefined) {
    return {
      baseUrl: env[lease.baseUrlEnv],
      authToken: lease.credentialsEnv ? env[lease.credentialsEnv] : undefined,
    };
  }
  return { nativeChain: "bedrock" };
}

/**
 * Presence-only health: does the process carry a plausible Bedrock credential
 * chain (profile, region, or documented bearer-token env)? NO network call —
 * a real SigV4/STS probe would need region+role shapes this dialect must not
 * own, and one bad endpoint call says less than presence says here. The
 * kernel validates the chain itself on first use; misconfigurations that
 * presence catches are the ones that matter (empty env).
 */
export async function healthCheck(
  _lease: ModelLeaseLike,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProbeResult> {
  const present = Boolean(env.AWS_PROFILE || env.AWS_REGION || env.AWS_BEARER_TOKEN_BEDROCK);
  return present
    ? { ok: true }
    : { ok: false, reason: "no AWS credential chain in environment (set AWS_PROFILE, AWS_REGION, or AWS_BEARER_TOKEN_BEDROCK)" };
}

export const dialect = {
  tag: "bedrock" as const,
  resolveChannel,
  healthCheck,
  resolveModel: (models: Readonly<Record<string, string>>, alias: string): string => resolveModelAlias(models, alias),
};
