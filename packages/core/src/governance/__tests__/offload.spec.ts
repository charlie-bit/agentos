/**
 * spec #206 — large tool results leave context and become a workspace file
 * plus a one-line pointer. The threshold is a hard byte cap on the inline
 * payload; nothing about the pointer leaks outside the session workspace.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OFFLOAD_THRESHOLD_BYTES, offloadIfLarge } from "../offload.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-offload-"));
  roots.push(dir);
  return dir;
}

describe("offloadIfLarge (#206)", () => {
  it("small results stay inline and untouched", () => {
    const ws = workspace();
    const value = { hits: [{ id: "a.md", title: "A" }] };
    const out = offloadIfLarge(value, { workspaceDir: ws, toolName: "kb_search" });
    expect(out.offloaded).toBe(false);
    expect(out.value).toBe(value);
    expect(readdirSync(ws)).toEqual([]); // nothing written
  });

  it(">10KB writes the full payload to the session workspace and returns a pointer", () => {
    const ws = workspace();
    const big = { body: "x".repeat(OFFLOAD_THRESHOLD_BYTES + 100) };
    const out = offloadIfLarge(big, { workspaceDir: ws, toolName: "kb_get_page", now: () => 42 });

    expect(out.offloaded).toBe(true);
    const pointer = out.pointer!;
    expect(pointer.path.startsWith(ws + sep)).toBe(true);
    expect(pointer.bytes).toBeGreaterThan(OFFLOAD_THRESHOLD_BYTES);
    expect(pointer.preview.length).toBeLessThanOrEqual(200);

    // the file holds the ORIGINAL payload, byte-identical after parse
    expect(JSON.parse(readFileSync(pointer.path, "utf8"))).toEqual(big);

    // what the model sees is a small envelope with a read instruction
    const envelope = out.value as { offloaded: boolean; pointer: string; note: string };
    expect(envelope.offloaded).toBe(true);
    expect(envelope.pointer).toBe(pointer.path);
    expect(envelope.note).toContain("Read tool");
    expect(JSON.stringify(envelope).length).toBeLessThan(600);
  });

  it("a hostile tool name cannot escape the tool-results directory", () => {
    const ws = workspace();
    const out = offloadIfLarge({ body: "y".repeat(OFFLOAD_THRESHOLD_BYTES + 1) }, {
      workspaceDir: ws,
      toolName: "../../etc/passwd",
    });
    const path = out.pointer!.path;
    expect(path.startsWith(join(ws, "tool-results") + sep)).toBe(true);
    expect(path.includes("..")).toBe(false);
  });

  it("the threshold is configurable but defaults to 10KB", () => {
    expect(OFFLOAD_THRESHOLD_BYTES).toBe(10 * 1024);
    const ws = workspace();
    const out = offloadIfLarge({ body: "z".repeat(50) }, { workspaceDir: ws, toolName: "t", thresholdBytes: 10 });
    expect(out.offloaded).toBe(true);
  });
});
