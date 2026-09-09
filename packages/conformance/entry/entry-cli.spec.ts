/**
 * ENTRY SUITE — EntryAdapter contract conformance (offline, no kernel, no
 * credentials). Black box: only the public surface of @agentos/entry-cli is
 * touched; display goes to a captured sink, stdin is injected, the ledger is
 * a throwaway sqlite file. A different terminal entry must pass this file
 * unchanged — that is the point.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { PassThrough, Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RenderEvent } from "@agentos/contracts";
import { openLedger } from "@agentos/core";
import { EntryCli, ENTRY_NAME } from "@agentos/entry-cli";

const tempDirs: string[] = [];

/** Fresh entry with captured output + temp ledger; pass a ledger to share it. */
function harness(
  over: { externalKey?: string; verbose?: boolean; input?: NodeJS.ReadableStream; ledger?: ReturnType<typeof openLedger> } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "agentos-entry-conf-"));
  tempDirs.push(dir);
  const captured: string[] = [];
  const ledger = over.ledger ?? openLedger(join(dir, "sessions.db"));
  const entry = new EntryCli({
    presetName: "conf-preset",
    externalKey: over.externalKey ?? "conf-key",
    ledger,
    write: (chunk) => captured.push(chunk),
    input: over.input,
    verbose: over.verbose,
  });
  return { entry, ledger, captured, text: () => captured.join("") };
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
});

describe("identity — stable process-level facts", () => {
  it("returns the same identity on repeat calls; tenant carries the preset", async () => {
    const { entry } = harness();
    const a = await entry.identity();
    const b = await entry.identity();
    expect(a).toEqual(b);
    expect(a.userId.length).toBeGreaterThan(0);
    expect(a.tenant.tenantId).toBe("conf-preset");
  });
});

describe("session — the idempotency clause (contract: same client session ⇒ same binding)", () => {
  it("repeat calls on one instance return the identical binding", async () => {
    const { entry } = harness();
    const first = await entry.session();
    const second = await entry.session();
    expect(second).toEqual(first);
    expect(first.clientSessionId).toBe("conf-key");
    expect(first.agentSessionId.length).toBeGreaterThan(0);
  });

  it("a fresh instance over the same ledger + same externalKey re-binds to the SAME row", async () => {
    const a = harness();
    const first = await a.entry.session();
    const later = new EntryCli({ presetName: "conf-preset", externalKey: "conf-key", ledger: a.ledger });
    const again = await later.session();
    expect(again).toEqual(first);
  });
});

describe("render — the filter, not a firehose", () => {
  const ev = (type: string, payload?: unknown): RenderEvent => ({ type, payload, timestampMs: 1 });

  it("aggregates kernel noise, streams assistant text verbatim, flags drift loudly, summarizes result", async () => {
    const { entry, text } = harness();
    const events: RenderEvent[] = [
      ...Array.from({ length: 40 }, () => ev("kernel.system.thinking_tokens", {})),
      ev("session.init", { model: "probe-model" }),
      ev("assistant.text", { text: "the exact line | Entry | (code-registered) | `EntryAdapter` |" }),
      ev("tool.call", { tool: "mcp__x__read", input: { p: 1 } }),
      ev("tool.result", { isError: false }),
      ev("kernel.system.drift", { missing: ["a"], undeclared: [] }),
      ev("result", { subtype: "success", isError: false, usage: { input_tokens: 5, output_tokens: 9 }, totalCostUsd: 0.01 }),
    ];
    entry.render(events);
    const out = text();
    expect(out).toContain("the exact line | Entry | (code-registered) | `EntryAdapter` |"); // verbatim
    expect(out).toMatch(/⚠ drift: missing=\[a\]/); // warning surface
    expect(out).toMatch(/kernel noise: 40 event\(s\) aggregated/); // 40 thinking frames, one line; init surfaces separately
    expect(out).toMatch(/· result success — tokens: in=5 out=9 \| cost/); // usage summary + caveat present
    expect(out).not.toMatch(/thinking_tokens[^\n]*\n[^\n]*thinking_tokens/); // never spam line-per-event
  });

  it("unknown events without a result frame are silent (counted), verbose mode shows everything", () => {
    const quiet = harness();
    quiet.entry.render([ev("kernel.system.api_retry", {}), ev("assistant.text", { text: "hi" })]);
    expect(quiet.text()).toBe("hi\n"); // noise invisible until result; text passes

    const loud = harness({ verbose: true });
    loud.entry.render([ev("kernel.system.api_retry", { why: "x" })]);
    expect(loud.text()).toContain("api_retry");
    expect(loud.text()).toContain('"why":"x"');
  });

  it("malformed frames must not throw (contract: render never propagates display faults)", () => {
    const { entry } = harness();
    const junk = [
      {}, // no type
      { type: "assistant.text" }, // no payload
      { type: "result", payload: null }, // null payload
      { type: 42 }, // wrong type
    ] as unknown as RenderEvent[];
    expect(() => entry.render(junk)).not.toThrow();
    expect(() => entry.render(null as unknown as RenderEvent[])).not.toThrow();
  });
});

describe("confirm — y/N with deny-on-timeout as adapter duty", () => {
  it("yes answers approved, no (or anything else) answers denied with attribution", async () => {
    const yes = harness({ input: Readable.from(["yes\n"]) });
    expect(await yes.entry.confirm({ requestId: "r", prompt: "Commit?" })).toMatchObject({ approved: true, decidedBy: "cli-user:yes" });

    const no = harness({ input: Readable.from(["nope\n"]) });
    expect(await no.entry.confirm({ requestId: "r", prompt: "Commit?" })).toMatchObject({ approved: false, decidedBy: "cli-user:nope" });
  });

  it("an unanswered question resolves a denial attributed to timeout", async () => {
    const never = new PassThrough(); // open stream, no data ever
    const { entry } = harness({ input: never });
    const result = await entry.confirm({ requestId: "r", prompt: "Commit?", timeoutMs: 60 });
    expect(result).toMatchObject({ approved: false, decidedBy: "timeout" });
    never.destroy();
  });
});

describe("honest capability declaration", () => {
  it("capabilities.confirm === true — a terminal can ask a human, so it must claim it", () => {
    const { entry } = harness();
    expect(entry.capabilities).toEqual({ confirm: true });
    expect(ENTRY_NAME).toBe("cli");
  });
});
