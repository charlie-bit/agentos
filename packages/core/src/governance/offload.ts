/**
 * Large-result offload (spec #206, #44). A tool answer bigger than the
 * threshold never enters the model's context inline: it is written to the
 * SESSION WORKSPACE and the context gets a one-line pointer instead. The
 * pointer is a path the agent can already read (Read + workspace grant), so
 * the information stays reachable without paying for it every turn.
 *
 * Boundary law: offloading is per-TOOL-RESULT, not per-message. The envelope
 * returned here is JSON data like any other tool result — no rendering, no
 * entry semantics.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Context cost cap: at most this many bytes of one tool result stay inline. */
export const OFFLOAD_THRESHOLD_BYTES = 10 * 1024;

export interface OffloadOptions {
  /** Session workspace (the clean-room territory); files land under tool-results/. */
  workspaceDir: string;
  /** Tool name, used for the file name (sanitized — never a path segment). */
  toolName: string;
  thresholdBytes?: number;
  /** Injectable for deterministic tests. */
  now?: () => number;
}

export interface OffloadPointer {
  /** Absolute path of the written file. */
  path: string;
  /** Size of the full serialized result. */
  bytes: number;
  /** First 200 chars of the payload, so the model can decide whether to read it. */
  preview: string;
}

export interface OffloadOutcome {
  /** What the caller should hand to the model: the value, or the pointer envelope. */
  value: unknown;
  offloaded: boolean;
  pointer?: OffloadPointer;
}

/** Tool names are untrusted strings; only a flat, boring file name may result. */
function safeName(toolName: string): string {
  const cleaned = toolName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 60);
  return cleaned.length > 0 ? cleaned : "tool-result";
}

export function offloadIfLarge(value: unknown, opts: OffloadOptions): OffloadOutcome {
  const threshold = opts.thresholdBytes ?? OFFLOAD_THRESHOLD_BYTES;
  const json = JSON.stringify(value ?? null);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes <= threshold) return { value, offloaded: false };

  const dir = join(opts.workspaceDir, "tool-results");
  mkdirSync(dir, { recursive: true });
  const stamp = (opts.now ?? Date.now)();
  const path = join(dir, `${safeName(opts.toolName)}-${stamp}-${randomUUID().slice(0, 8)}.json`);
  writeFileSync(path, json, "utf8");
  const pointer: OffloadPointer = { path, bytes, preview: json.slice(0, 200) };
  return {
    value: {
      offloaded: true,
      pointer: pointer.path,
      bytes: pointer.bytes,
      preview: pointer.preview,
      note: `result too large for context (${bytes} bytes); full payload written to ${pointer.path} — read it with the Read tool`,
    },
    offloaded: true,
    pointer,
  };
}
