/**
 * TOOL SUITE — loader conformance (contract-level, offline).
 * Black box: everything enters through @agentos/core's public API and every
 * produced plan is re-validated through @agentos/contracts' public schema.
 * No implementation internals are imported; a runtime swap must keep this
 * file green without edits.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toolMountPlanSchema, type ToolProviderManifest } from "@agentos/contracts";
import { loadManifestDir, planTools } from "@agentos/core";

const FIXTURES = fileURLToPath(new URL("./fixtures/tools", import.meta.url));

/** The loaded, schema-valid manifest set of this suite's fixture dir. */
function manifests(): ToolProviderManifest[] {
  const { loaded, failed } = loadManifestDir(FIXTURES);
  expect(failed).toEqual([]); // fixture integrity is itself part of conformance
  return loaded.map((l) => l.manifest).filter((m): m is ToolProviderManifest => m.kind === "tool");
}

const GOOD_ENV = { CONF_TEST_ROOT: "/srv/corpus", CONF_TEST_TOKEN: "conformance-fake-token" };

describe("plans are contract-legal objects", () => {
  it("every produced plan passes the public toolMountPlanSchema unchanged", () => {
    const { plans, errors } = planTools(manifests(), { env: GOOD_ENV });
    expect(errors).toEqual([]);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(toolMountPlanSchema.safeParse(plan).success, `plan ${plan.key} must be contract-legal`).toBe(true);
    }
  });
});

describe("contract behaviors of the assembly line", () => {
  const keys = (plans: { key: string }[]) => plans.map((p) => p.key).sort();

  it("enabled:false manifests are absent from plans while remaining loadable", () => {
    const all = manifests();
    expect(all.some((m) => m.name === "mounted-off")).toBe(true); // declared…
    const { plans } = planTools(all, { env: GOOD_ENV });
    expect(keys(plans)).not.toContain("mounted-off"); // …but unmounted
  });

  it("an unregistered sdk factory degrades to a warning, never an error", () => {
    const { plans, errors, warnings } = planTools(manifests(), { env: GOOD_ENV });
    expect(keys(plans)).not.toContain("sdk-unregistered");
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.key)).toContain("sdk-unregistered");
  });

  it("an unresolvable env lease produces a structured error at the right path and mounts nothing for that entry", () => {
    const { plans, errors } = planTools(manifests(), { env: {} });
    expect(keys(plans)).not.toContain("http-auth");
    expect(keys(plans)).not.toContain("plain-stdio");
    const paths = errors.map((e) => e.path).sort();
    expect(paths).toContain("http-auth.auth.env");
    expect(paths).toContain("plain-stdio.command");
    for (const e of errors) {
      expect(e.path.length).toBeGreaterThan(0);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it("a bearer lease lands its resolved value ONLY in http headers (in-memory), per plan schema", () => {
    const { plans } = planTools(manifests(), { env: GOOD_ENV });
    const gw = plans.find((p) => p.key === "http-auth");
    expect(gw?.http?.headers?.Authorization).toBe("Bearer conformance-fake-token");
    // the credential value exists ONLY under http.headers — never in any spawn surface
    const spawnSurfaces = plans.flatMap((p) => (p.stdio ? [p.stdio.command, ...(p.stdio.args ?? [])] : []));
    expect(spawnSurfaces.some((s) => s.includes("conformance-fake-token"))).toBe(false);
  });
});
