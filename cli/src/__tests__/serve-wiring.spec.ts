/**
 * spec #203 — the composition root reads confirmCapable from the mounted entry
 * adapter instead of hardcoding true. A confirm:false entry must lose the
 * knowledge-write verbs at REGISTRATION time (read-only degradation by
 * omission), which is what these tests pin: the kb mount plan's allowlist is
 * the registration surface the kernel sees.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { wireKnowledge, type Assembly } from "../serve.js";

const roots: string[] = [];

function assembly(knowledgeRoot: string): Assembly {
  return {
    presetName: "test-preset",
    presetModel: "test-model",
    allModels: [],
    knowledge: {
      kind: "knowledge",
      version: "1",
      name: "kb",
      provider: "markdown",
      mount: { type: "path", path: knowledgeRoot },
    },
    plans: [],
    mounts: [],
    toolManifestPaths: {},
    entryName: "cli",
    channelRoutes: {},
    repoRoot: knowledgeRoot,
  };
}

function tempBook(): string {
  const root = mkdtempSync(join(tmpdir(), "agentos-wire-"));
  roots.push(root);
  writeFileSync(
    join(root, "page.md"),
    "---\nowner: team\nlast_verified: 2026-01-01\nstale_after: 2027-01-01\nstatus: published\n---\n# Page\n.body\n",
    "utf8",
  );
  return root;
}

const approve = async () => ({ approved: true, decidedBy: "test", timestampMs: Date.now() });

afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

describe("wireKnowledge — confirm capability is read, never assumed (#203)", () => {
  it("registers kb_write/kb_commit when the entry can ask a human", async () => {
    const book = tempBook();
    const workspace = join(book, "workspace");
    mkdirSync(workspace, { recursive: true });
    const wired = await wireKnowledge(assembly(book), approve, workspace, true);
    expect(wired).not.toBeNull();
    const names = wired?.plan.allowedTools ?? [];
    expect(names).toContain("kb_write");
    expect(names).toContain("kb_commit");
  });

  it("omits every write verb when the entry declares confirm:false", async () => {
    const book = tempBook();
    const workspace = join(book, "workspace");
    mkdirSync(workspace, { recursive: true });
    const wired = await wireKnowledge(assembly(book), approve, workspace, false);
    expect(wired).not.toBeNull();
    const names = wired?.plan.allowedTools ?? [];
    expect(names).toContain("kb_search");
    expect(names).toContain("kb_get_page");
    expect(names).not.toContain("kb_write");
    expect(names).not.toContain("kb_commit");
  });
});

describe("serve assembly has no credential sugar (spec #227)", () => {
  it("does not invent AGENTOS_EXAMPLE_MCP_TOKEN, and the disabled doc mount is skipped", async () => {
    const { assemble } = await import("../serve.js");
    const { locateTarget } = await import("../preset-validate.js");
    const preset = locateTarget("config/presets/example.yml");
    expect(preset).not.toBeNull();

    const saved = process.env.AGENTOS_EXAMPLE_MCP_TOKEN;
    delete process.env.AGENTOS_EXAMPLE_MCP_TOKEN;
    try {
      const asm = assemble({ preset: preset as string });
      expect(asm.ok).toBe(true);
      if (!asm.ok) return;
      expect(process.env.AGENTOS_EXAMPLE_MCP_TOKEN).toBeUndefined();
      // the placeholder http mount is declared enabled:false -> not planned
      expect(asm.value.plans.map((p) => p.key)).not.toContain("mcp-remote-example");
      expect(asm.value.plans.map((p) => p.key)).toContain("mcp-filesystem");
    } finally {
      if (saved === undefined) delete process.env.AGENTOS_EXAMPLE_MCP_TOKEN;
      else process.env.AGENTOS_EXAMPLE_MCP_TOKEN = saved;
    }
  });
});

describe("single-tool failure isolation (spec #204)", () => {
  it("a tool with an unresolvable env var degrades to a warning; the rest still mount", async () => {
    const { assemble } = await import("../serve.js");
    const dir = mkdtempSync(join(tmpdir(), "agentos-iso-"));
    roots.push(dir);
    mkdirSync(join(dir, "presets"), { recursive: true });
    mkdirSync(join(dir, "knowledge"), { recursive: true });
    mkdirSync(join(dir, "models"), { recursive: true });
    mkdirSync(join(dir, "tools"), { recursive: true });
    writeFileSync(
      join(dir, "presets", "p.yml"),
      ["kind: preset", 'version: "1"', "name: p", "knowledge: k", "model: m", "tools: [good, broken]", "entry: cli", ""].join("\n"),
    );
    writeFileSync(
      join(dir, "knowledge", "k.yml"),
      ["kind: knowledge", 'version: "1"', "name: k", "provider: markdown", "mount: { type: path, path: ./kb }", ""].join("\n"),
    );
    writeFileSync(
      join(dir, "models", "m.yml"),
      ["kind: model", 'version: "1"', "name: m", "provider: vendor-x", "models: { a: real-a }", ""].join("\n"),
    );
    writeFileSync(
      join(dir, "tools", "good.yml"),
      ["kind: tool", 'version: "1"', "name: good", "transport: stdio", "command: npx -y good-server", "auth: { mode: none }", "schemaExchange: json-schema", ""].join("\n"),
    );
    writeFileSync(
      join(dir, "tools", "broken.yml"),
      ["kind: tool", 'version: "1"', "name: broken", "transport: stdio", "command: npx -y broken-server ${AGENTOS_TEST_MISSING_VAR}", "auth: { mode: none }", "schemaExchange: json-schema", ""].join("\n"),
    );

    const saved = process.env.AGENTOS_TEST_MISSING_VAR;
    delete process.env.AGENTOS_TEST_MISSING_VAR;
    try {
      const asm = assemble({ preset: join(dir, "presets", "p.yml") });
      expect(asm.ok).toBe(true);
      if (!asm.ok) return;
      expect(asm.value.plans.map((p) => p.key)).toEqual(["good"]);
      const broken = asm.value.mounts.find((m) => m.key === "broken");
      expect(broken).toMatchObject({ degraded: true });
    } finally {
      if (saved !== undefined) process.env.AGENTOS_TEST_MISSING_VAR = saved;
    }
  });
});

describe("preset catalogue (spec #288)", () => {
  it("lists config/presets/*.yml as name + repo-relative path", async () => {
    const { listPresetFiles } = await import("../serve.js");
    const { locateTarget } = await import("../preset-validate.js");
    const preset = locateTarget("config/presets/example.yml");
    expect(preset).not.toBeNull();
    const repoRoot = preset!.replace(/\/config\/presets\/example\.yml$/, "");
    const presets = listPresetFiles(repoRoot);
    expect(presets).toContainEqual({ name: "example", path: "config/presets/example.yml" });
  });

  it("a repo without config/presets gets an empty catalogue", async () => {
    const { listPresetFiles } = await import("../serve.js");
    const dir = mkdtempSync(join(tmpdir(), "agentos-nopresets-"));
    roots.push(dir);
    expect(listPresetFiles(dir)).toEqual([]);
  });
});

describe("preset validation path fence (spec #289)", () => {
  it("bare names resolve inside config/presets; escapes are refused", async () => {
    const { resolvePresetTarget } = await import("../serve.js");
    const { locateTarget } = await import("../preset-validate.js");
    const preset = locateTarget("config/presets/example.yml");
    const repoRoot = preset!.replace(/\/config\/presets\/example\.yml$/, "");

    expect(resolvePresetTarget(repoRoot, "example")).toBe(join(repoRoot, "config", "presets", "example.yml"));
    expect(resolvePresetTarget(repoRoot, "../../etc/passwd")).toBeNull();
    expect(resolvePresetTarget(repoRoot, "/etc/passwd")).toBeNull();
    expect(resolvePresetTarget(repoRoot, "nope")).toBeNull();
  });

  it("validating the example through the same runner the CLI uses is exit 0", async () => {
    const { runPresetValidate } = await import("../preset-validate.js");
    const { resolvePresetTarget } = await import("../serve.js");
    const { locateTarget } = await import("../preset-validate.js");
    const preset = locateTarget("config/presets/example.yml");
    const repoRoot = preset!.replace(/\/config\/presets\/example\.yml$/, "");
    const target = resolvePresetTarget(repoRoot, "example");
    expect(target).not.toBeNull();
    expect(runPresetValidate(target as string).exitCode).toBe(0);
  });
});
