/**
 * Tool assembly line: validated manifests -> neutral ToolMountPlan set.
 * This module owns the two deliberately impure moves P1b's validate refuses:
 * ${VAR} expansion and auth-lease resolution (env values enter here, stay in
 * memory with the plan, and must never be logged/persisted — the plan type
 * carries that contract). Fail-loud policy: an unresolvable variable or
 * unleased credential is a structured ERROR, never a silent empty string —
 * a tool mounted with a hole in its config is worse than a missing one.
 * enabled:false entries are filtered out here (the yml stays committed so
 * git diffs keep showing what the deployment chose to unmount).
 * sdk transports degrade to warnings when their factory is not registered —
 * the entryNames precedent: lookup tables come from the caller, not the schema.
 */
import type { ManifestError } from "../manifest/errors.js";
import { formatIssues } from "../manifest/errors.js";
import { toolMountPlanSchema, type ToolMountPlan, type ToolProviderManifest } from "@agentos/contracts";

export interface PlanOptions {
  /** Env source for expansion/auth; injectable so tests never read real credentials. */
  env?: NodeJS.ProcessEnv;
  /** Registered sdk factories (name -> opaque object; loader never invokes them). */
  sdkFactories?: Record<string, unknown>;
}

export interface MountWarning {
  key: string;
  path: string;
  message: string;
}

export interface PlanToolsResult {
  plans: ToolMountPlan[];
  /** Structured errors, same shape as manifest loading. Non-empty => do not mount. */
  errors: ManifestError[];
  /** Degrade-not-fail notices (unregistered sdk factory). */
  warnings: MountWarning[];
}

const VAR = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Expand ${NAME} occurrences; each missing name appends one error, text kept as-is. */
function expandEnv(value: string, env: NodeJS.ProcessEnv, at: string, errors: ManifestError[]): string {
  return value.replace(VAR, (whole, name: string) => {
    const v = env[name];
    if (v === undefined || v === "") {
      errors.push({ path: at, message: `\${${name}} is not set in the environment`, hint: "export the var or fix the manifest" });
      return whole;
    }
    return v;
  });
}

export function planTools(manifests: readonly ToolProviderManifest[], opts: PlanOptions = {}): PlanToolsResult {
  const env = opts.env ?? process.env;
  const plans: ToolMountPlan[] = [];
  const errors: ManifestError[] = [];
  const warnings: MountWarning[] = [];

  for (const m of manifests) {
    if (m.enabled === false) continue; // declared, deliberately unmounted — kept in config for diff visibility

    const errorsBefore = errors.length;
    let candidate: Record<string, unknown>;

    if (m.transport === "stdio") {
      const raw = expandEnv(m.command, env, `${m.name}.command`, errors);
      const [exe, ...args] = raw.split(/\s+/); // command line tokenized here; no shell re-interpretation downstream
      candidate = { key: m.name, transport: "stdio", stdio: { command: exe, ...(args.length ? { args } : {}) } };
    } else if (m.transport === "http") {
      const url = expandEnv(m.endpoint ?? "", env, `${m.name}.endpoint`, errors);
      let headers: Record<string, string> | undefined;
      if (m.auth.mode === "bearer-token-env" || m.auth.mode === "header-env") {
        const varName = m.auth.env;
        const value = varName ? env[varName] : undefined;
        if (value === undefined || value === "") {
          errors.push({
            path: `${m.name}.auth.env`,
            message: varName ? `\${${varName}} not resolvable — cannot mount` : "auth.env missing",
            hint: "credentials are leased by env-var name; export it or set enabled:false",
          });
        } else {
          // Convention (loader-side, documented): both header-carrying modes land in
          // Authorization — bearer gets the scheme prefix, header-env passes the raw value.
          headers = { Authorization: m.auth.mode === "bearer-token-env" ? `Bearer ${value}` : value };
        }
      }
      candidate = { key: m.name, transport: "http", http: { url, ...(headers ? { headers } : {}) } };
    } else {
      const factoryName = m.name;
      if (!(factoryName in (opts.sdkFactories ?? {}))) {
        warnings.push({
          key: m.name,
          path: "transport",
          message: `sdk factory "${factoryName}" not registered — entry omitted (degraded, not failed)`,
        });
        continue;
      }
      candidate = { key: m.name, transport: "sdk", sdk: { factoryName } };
    }

    if (errors.length > errorsBefore) continue; // this entry failed resolution — never mount with a hole in it

    if (m.allowedTools !== undefined) candidate.allowedTools = m.allowedTools;
    if (m.idempotent !== undefined) candidate.idempotent = m.idempotent;

    const checked = toolMountPlanSchema.safeParse(candidate);
    if (checked.success) plans.push(checked.data);
    else for (const e of formatIssues(checked.error.issues)) errors.push({ ...e, path: `${m.name}.${e.path}` });
  }

  return { plans, errors, warnings };
}
