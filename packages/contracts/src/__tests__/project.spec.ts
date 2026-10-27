/** spec #388 — project template shape: four optional reference lists, strict. */
import { describe, expect, it } from "vitest";
import { projectManifestSchema } from "../project.js";

const base = { kind: "project", version: "1", name: "web-revamp" };

describe("project template (#388)", () => {
  it("accepts a bare template and one with every reference list", () => {
    expect(projectManifestSchema.safeParse(base).success).toBe(true);
    expect(
      projectManifestSchema.safeParse({ ...base, description: "d", agents: ["a"], workflows: ["w"], tools: ["t"], knowledge: ["k"] }).success,
    ).toBe(true);
  });
  it("rejects unknown fields and non-string entries", () => {
    expect(projectManifestSchema.safeParse({ ...base, instances: [] }).success).toBe(false);
    expect(projectManifestSchema.safeParse({ ...base, agents: [1] }).success).toBe(false);
    expect(projectManifestSchema.safeParse({ kind: "project", version: "1" }).success).toBe(false);
  });
});
