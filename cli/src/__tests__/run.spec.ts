/**
 * Runner-level tests (no process spawn): the runners return data, so these
 * assert exit codes and rendered lines directly. Bad fixtures are generated in
 * a temp dir — negative samples never land in the repo.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../run.js";

const tempDirs: string[] = [];
function makeTempConfig(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-cli-test-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

describe("agentos preset validate — happy", () => {
  it("accepts the repo example preset and prints the four-slot summary", () => {
    // cwd during vitest is cli/; locateTarget walks up to the repo root.
    const r = run(["preset", "validate", "config/presets/example.yml"]);
    expect(r.exitCode).toBe(0);
    const text = r.lines.join("\n");
    for (const slot of ["local-markdown", "deepseek", "mcp-filesystem", "console"]) {
      expect(text, `summary must name the ${slot} reference`).toContain(slot);
    }
    expect(text).toContain("6 manifests validated");
  });
});

describe("agentos preset validate — sad", () => {
  it("fails a preset referencing a tool that was never declared", () => {
    const dir = makeTempConfig({
      "presets/broken.yml": [
        "kind: preset",
        'version: "1"',
        "name: broken",
        "knowledge: nowhere-kb",
        "model: nowhere-model",
        "tools: [ghost-tool]",
        "entry: console",
        "",
      ].join("\n"),
    });
    const r = run(["preset", "validate", join(dir, "presets/broken.yml")]);
    expect(r.exitCode).toBe(1);
    const text = r.lines.join("\n");
    expect(text).toContain("ghost-tool");
    expect(text).toContain("tools.0");
    expect(text).toContain("nowhere-kb");
    expect(text).toContain("knowledge");
  });

  it("reports humanized field errors from an invalid manifest (not a stack trace)", () => {
    const dir = makeTempConfig({
      "presets/badtool.yml": [
        "kind: tool",
        'version: "1"',
        "name: bad",
        "transport: grpc", // unknown discriminator
        "auth: { mode: none }",
        "schemaExchange: json-schema",
        "",
      ].join("\n"),
    });
    const r = run(["preset", "validate", join(dir, "presets/badtool.yml")]);
    expect(r.exitCode).toBe(1);
    const text = r.lines.join("\n");
    expect(text).toContain("transport"); // field path present in human error
    expect(text).not.toContain("at run"); // never a stack trace
  });

  it("target that exists nowhere returns exit 1, still without a stack trace", () => {
    const r = run(["preset", "validate", "no/such/thing.yml"]);
    expect(r.exitCode).toBe(1);
    expect(r.lines.join("\n")).toContain("target not found");
  });
});

describe("agentos serve — placeholder", () => {
  it("refuses with exit 1 and points at P2", () => {
    const r = run(["serve"]);
    expect(r.exitCode).toBe(1);
    expect(r.lines.join("\n")).toContain("P2 delivers this");
  });

  it("unknown subcommands exit 2 with usage", () => {
    const r = run(["frobnicate"]);
    expect(r.exitCode).toBe(2);
    expect(r.lines.join("\n")).toContain("usage:");
  });
});
