/** spec #328/#330/#331/#332/#333 — AgentManifest loading and reference laws. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadManifest, loadManifestDir } from "../load.js";
import { validatePresetRefs } from "../validate.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

function book(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-agent-"));
  dirs.push(dir);
  for (const [k, v] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, k)), { recursive: true });
    writeFileSync(join(dir, k), v);
  }
  return dir;
}
const agent = (name: string, extra = ""): string =>
  ["kind: agent", 'version: "1"', `name: ${name}`, "systemPrompt: You are a helper.", extra, ""].join("\n");
const tool = (name: string): string =>
  ["kind: tool", 'version: "1"', `name: ${name}`, "transport: sdk", "auth: { mode: none }", "schemaExchange: json-schema", ""].join("\n");

describe("AgentManifest (#328/#332)", () => {
  it("loads a valid role; unknown fields and inline secrets are rejected", () => {
    const dir = book({ "a.yml": agent("analyst", "tools: [search]") });
    expect(loadManifest(join(dir, "a.yml")).ok).toBe(true);
    const bad = book({ "a.yml": agent("analyst", "secret: sk-live-123456") });
    expect(loadManifest(join(bad, "a.yml")).ok).toBe(false);
    const wrongKind = book({ "a.yml": 'kind: agent\nversion: "1"\ntransport: stdio\n' });
    expect(loadManifest(join(wrongKind, "a.yml")).ok).toBe(false);
  });
});

describe("agent reference laws (#330/#331/#333)", () => {
  const preset = (agents: string) =>
    ["kind: preset", 'version: "1"', "name: p", "knowledge: k", "model: m", "tools: []", "entry: cli", `agents: [${agents}]`, ""].join("\n");
  const base = {
    "knowledge/k.yml": ["kind: knowledge", 'version: "1"', "name: k", "provider: markdown", "mount: { type: path, path: ./kb }", ""].join("\n"),
    "models/m.yml": ["kind: model", 'version: "1"', "name: m", "provider: v", "models: { a: real }", ""].join("\n"),
  };

  it("a valid base chain and preset agents list pass", () => {
    const dir = book({ ...flat(base, { "a.yml": agent("a"), "b.yml": agent("b", "baseAgent: a"), "p.yml": preset("a, b") }) });
    expect(validatePresetRefs(dirFiles(dir).loaded, { entryNames: ["cli"] })).toEqual([]);
  });

  it("cycle a→b→a is rejected at baseAgent", () => {
    const dir = book({ ...flat(base, { "a.yml": agent("a", "baseAgent: b"), "b.yml": agent("b", "baseAgent: a"), "p.yml": preset("a") }) });
    const errors = validatePresetRefs(dirFiles(dir).loaded, { entryNames: ["cli"] });
    expect(errors.some((e) => e.path === "baseAgent" && /cycle/.test(e.message))).toBe(true);
  });

  it("dangling baseAgent/tools/knowledge/model and preset agents are all rejected", () => {
    const dir = book({
      ...flat(base, {
        "a.yml": agent("a", "baseAgent: ghost\nknowledge: ghost-kb\nmodel: ghost-model"),
        "p.yml": preset("ghost-agent"),
      }),
    });
    const errors = validatePresetRefs(dirFiles(dir).loaded, { entryNames: ["cli"] });
    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining(["baseAgent", "knowledge", "model", "agents.0"]));
  });

  it("baseAgent cannot point at a tool manifest (#418 groundwork)", () => {
    const dir = book({ ...flat(base, { "t.yml": tool("t"), "a.yml": agent("a", "baseAgent: t"), "p.yml": preset("a") }) });
    const errors = validatePresetRefs(dirFiles(dir).loaded, { entryNames: ["cli"] });
    expect(errors.some((e) => e.path === "baseAgent")).toBe(true);
  });
});

/** Collapse path-keyed fixtures into flat names (loadManifestDir is flat). */
function flat(base: Record<string, string>, extra: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, ...extra })) out[k.split("/").pop() as string] = v;
  return out;
}

function dirFiles(dir: string) {
  return loadManifestDir(dir);
}
