/**
 * Transcript replay — the SECOND thing in this repo allowed to know a kernel
 * private detail, for the same reason as run.ts: the knowledge has to live
 * somewhere, and the seam is the price of admission.
 *
 * The ledger stores STATE and a POINTER (sdk_session_id); the conversation
 * itself lives in the kernel's own per-session JSONL store. So a browser
 * reload could resume the kernel's memory perfectly and still show an empty
 * chat — the content was never the ledger's to keep. This module reads that
 * store and hands back neutral TranscriptEntry values; every consumer above
 * (entry-rest, apps/web) sees entries only, and greps clean of the file format.
 *
 * DISCIPLINE: no kernel SDK import is needed here — the format is a file
 * layout, not an API. That is deliberate; this file is still adapter-only
 * because the LAYOUT is kernel-private and changes when the kernel does.
 *
 * FAILURE POSTURE: history is a nicety, never load-bearing. A missing store
 * dir, an absent file, a truncated write mid-append, a half-flushed line of
 * JSON — each degrades to "fewer entries" (worst case zero) plus a structured
 * warning on the optional sink. This function does not throw. Losing the
 * scrollback must never cost the user their live session.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { TranscriptEntry } from "@agentos/contracts";

/** Structured, machine-classifiable degradation reason (never a thrown error). */
export interface TranscriptWarning {
  readonly code: "no-store-dir" | "no-transcript-file" | "unreadable-file" | "unparsable-line" | "entry-cap-reached";
  readonly detail: string;
}

export interface ReadTranscriptOptions {
  /** Degradation sink. Absent = warnings dropped (the caller does not care). */
  onWarn?: (warning: TranscriptWarning) => void;
  /** Injectable for tests; real callers let it default to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Injectable for tests; real callers let it default to the OS home dir. */
  homeDir?: string;
  /** Hard cap on returned entries (unbounded replay is a resource risk). */
  maxEntries?: number;
  /** Hard cap on one tool-input rendering, mirroring the console's own. */
  maxToolInputChars?: number;
}

const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_TOOL_INPUT = 400;

/**
 * Kernel session-store root. CLAUDE_CONFIG_DIR is the kernel's documented
 * config-dir override; otherwise the conventional dot-dir under $HOME.
 */
function storeRoot(env: NodeJS.ProcessEnv, home: string): string {
  const base = env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
  return join(base, "projects");
}

/**
 * The kernel derives a per-project directory name from the session cwd by
 * flattening the absolute path into one segment. Reproducing that here is a
 * FAST PATH only — findTranscriptFile falls back to a scan, so an upstream
 * change to the flattening rule costs a few stat calls, not the feature.
 */
export function projectDirName(absCwd: string): string {
  return absCwd.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * Locate the session file. Session ids are uuids — globally unique — so
 * scanning project dirs for the filename is correct, not merely convenient.
 */
function findTranscriptFile(
  sdkSessionId: string,
  workspaceDir: string | undefined,
  root: string,
  warn: (w: TranscriptWarning) => void,
): string | null {
  const file = sdkSessionId + ".jsonl";
  if (!existsSync(root)) {
    warn({ code: "no-store-dir", detail: root });
    return null;
  }
  if (workspaceDir !== undefined) {
    const fast = join(root, projectDirName(resolve(workspaceDir)), file);
    if (existsSync(fast)) return fast;
  }
  let dirs: string[] = [];
  try {
    dirs = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    warn({ code: "no-store-dir", detail: root });
    return null;
  }
  for (const dir of dirs) {
    const candidate = join(root, dir, file);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  warn({ code: "no-transcript-file", detail: file });
  return null;
}

/* The kernel's private record shapes. Structurally validated, NOT typed from
   the SDK: these are file records, so every field is untrusted input. */

interface RawBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

interface RawRecord {
  type?: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { role?: string; content?: unknown };
}

const asBlocks = (content: unknown): RawBlock[] =>
  Array.isArray(content) ? content.filter((b): b is RawBlock => typeof b === "object" && b !== null) : [];

/** ISO-8601 to epoch ms; unparsable or absent stamps simply go missing. */
function toMs(stamp: unknown): number | undefined {
  if (typeof stamp !== "string") return undefined;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Read one session's conversation as neutral entries, oldest first.
 *
 * @param sdkSessionId the ledger's pointer into the kernel session store
 * @param workspaceDir the session cwd when known — a lookup fast path only
 *
 * Never throws. Returns an empty array when nothing is readable, with the
 * reason reported through options.onWarn.
 */
export function readTranscript(
  sdkSessionId: string,
  workspaceDir?: string,
  options: ReadTranscriptOptions = {},
): TranscriptEntry[] {
  const warn = (w: TranscriptWarning): void => {
    try {
      options.onWarn?.(w);
    } catch {
      /* a broken warning sink must not break the read */
    }
  };
  if (typeof sdkSessionId !== "string" || sdkSessionId.length === 0) return [];
  // the id becomes a path segment: refuse anything that could escape the store
  if (/[/\\]/.test(sdkSessionId) || sdkSessionId.includes("..")) return [];

  const env = options.env ?? process.env;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxInput = options.maxToolInputChars ?? DEFAULT_MAX_TOOL_INPUT;
  const path = findTranscriptFile(sdkSessionId, workspaceDir, storeRoot(env, options.homeDir ?? homedir()), warn);
  if (path === null) return [];

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    warn({ code: "unreadable-file", detail: err instanceof Error ? err.message : String(err) });
    return [];
  }

  const records: RawRecord[] = [];
  let badLines = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) records.push(parsed as RawRecord);
    } catch {
      // a partially flushed final line is normal while a turn is in flight
      badLines += 1;
    }
  }
  if (badLines > 0) warn({ code: "unparsable-line", detail: String(badLines) + " line(s) skipped" });

  // Pass 1: tool outcomes keyed by the call they answer. A tool_use and its
  // tool_result are separate records; replay wants them as one entry.
  const outcomes = new Map<string, boolean>();
  for (const rec of records) {
    if (rec.isSidechain === true) continue;
    for (const block of asBlocks(rec.message?.content)) {
      if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        outcomes.set(block.tool_use_id, block.is_error === true);
      }
    }
  }

  // Pass 2: the replayable stream. Everything not user/assistant content is
  // kernel bookkeeping (attachments, queue ops, titles, modes) and is skipped;
  // so is thinking — internal reasoning is never replayed as content.
  const entries: TranscriptEntry[] = [];
  let capped = false;
  const push = (e: TranscriptEntry): void => {
    if (entries.length >= maxEntries) {
      capped = true;
      return;
    }
    entries.push(e);
  };

  for (const rec of records) {
    if (rec.type !== "user" && rec.type !== "assistant") continue;
    if (rec.isSidechain === true) continue; // subagent chatter is not this conversation
    const role = rec.type;
    const ts = toMs(rec.timestamp);
    const stamp = ts === undefined ? {} : { timestampMs: ts };
    const content = rec.message?.content;

    if (typeof content === "string") {
      if (content.trim().length > 0) push({ role, text: content, ...stamp });
      continue;
    }
    for (const block of asBlocks(content)) {
      if (block.type === "text" && typeof block.text === "string") {
        if (block.text.trim().length === 0) continue;
        push({ role, text: block.text, ...stamp });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        const failed = typeof block.id === "string" ? outcomes.get(block.id) : undefined;
        push({
          role: "tool",
          text: JSON.stringify(block.input ?? null).slice(0, maxInput),
          toolName: block.name,
          ...(failed === undefined ? {} : { isError: failed }),
          ...stamp,
        });
      }
      // tool_result blocks were consumed in pass 1; thinking blocks are dropped.
    }
  }
  if (capped) warn({ code: "entry-cap-reached", detail: String(maxEntries) });
  return entries;
}
