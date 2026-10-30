/** spec #392 — template fence: narrows, never widens. */
import { describe, expect, it } from "vitest";
import type { ProjectManifest } from "@agentos/contracts";
import { fenceError, fenceIntersect, projectAllows } from "../project-fence.js";

const tpl = { kind: "project", version: "1", name: "web-revamp", agents: ["analyst"], workflows: ["daily"], tools: [], knowledge: [] } as ProjectManifest;

describe("project fence (#392)", () => {
  it("allows only declared names; an empty list allows nothing", () => {
    expect(projectAllows(tpl, "agents", "analyst")).toBe(true);
    expect(projectAllows(tpl, "agents", "writer")).toBe(false);
    expect(projectAllows(tpl, "tools", "any")).toBe(false);
  });

  it("intersection narrows the mounted surface", () => {
    expect(fenceIntersect(tpl, "agents", ["analyst", "writer"])).toEqual(["analyst"]);
    expect(fenceIntersect(tpl, "workflows", ["daily", "weekly"])).toEqual(["daily"]);
  });

  it("the refusal names the fence and the template", () => {
    expect(fenceError("agents", "writer", "web-revamp").message).toContain('project "web-revamp" does not allow agent "writer"');
  });
});

describe("fence matrix (spec #446): role tools × project template", () => {
  it("the strictest intersection wins across agent/tool/project layers", () => {
    // role fence = declared bare tools; project fence = template lists.
    const roleTools = ["kb_search", "todo_add"];
    const template = { kind: "project", version: "1", name: "p", agents: ["analyst"], tools: [], knowledge: [] } as ProjectManifest;
    // role tools are intersected with what the project template permits; an
    // empty project tools list permits nothing, so the effective set is empty.
    const effective = fenceIntersect(template, "tools", roleTools);
    expect(effective).toEqual([]);
    const generous = { ...template, tools: ["kb_search"] } as ProjectManifest;
    expect(fenceIntersect(generous, "tools", roleTools)).toEqual(["kb_search"]);
    expect(projectAllows(template, "agents", "analyst")).toBe(true);
    expect(projectAllows(template, "agents", "outsider")).toBe(false);
  });
});
