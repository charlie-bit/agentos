/**
 * `agentos kb gate` — the content-legislation trigger QUERY (P7b door), not a
 * decision machine. Reads the escalation JSONL (written by entry-rest) and the
 * gate values from the knowledge manifest's escalationGate (deployment DATA;
 * absent = {minPerWeek:3, windowDays:7}) and prints whether the sliding
 * window says it is time to legislate knowledge (taxonomy, first pages, CI
 * lint). Informational: exit is always 0; humans decide.
 *
 * GATE FILE SEMANTICS (D-0910-8, ratified): the window reads EXACTLY ONE
 * canonical file — `.agentos/escalations.log`. Backup files
 * (`escalations.log.acceptance-noise-*` and any other renamed siblings) are
 * NEVER counted: renaming a log out of the way is an archival action by a
 * human, and silently re-reading backups would both resurrect data the human
 * retired and let a mover forget the past. `--include <file>` merges one
 * explicitly named extra file into the count — opt-in, per invocation,
 * never persisted.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadManifestDir, type AnyManifest } from "@agentos/core";
import type { KnowledgeManifest } from "@agentos/contracts";
import type { CliResult } from "./preset-validate.js";

const DAY = 86_400_000;

export const DEFAULT_GATE = { minPerWeek: 3, windowDays: 7 };

interface Escalation {
  ts: number;
  sessionId?: string;
  reason?: string | null;
}

function loadEscalations(path: string): Escalation[] {
  if (!existsSync(path)) return [];
  const out: Escalation[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as Escalation;
      if (typeof rec.ts === "number") out.push(rec);
    } catch {
      /* malformed line: skip, the counter is informational */
    }
  }
  return out;
}

function loadGate(configDir: string, now: () => number): { minPerWeek: number; windowDays: number; source: string } {
  const dir = join(configDir, "knowledge");
  if (existsSync(dir)) {
    const { loaded } = loadManifestDir(dir);
    for (const l of loaded) {
      const m = l.manifest as AnyManifest;
      if (m.kind === "knowledge") {
        const gate = (m as KnowledgeManifest).escalationGate;
        if (gate) return { ...gate, source: l.source };
      }
    }
  }
  void now;
  return { ...DEFAULT_GATE, source: "default (manifest carries no escalationGate)" };
}

export function runKbGate(
  configDir = "config",
  escalationsPath = join(".agentos", "escalations.log"),
  now: () => number = Date.now,
  includePaths: readonly string[] = [],
): CliResult {
  const gate = loadGate(resolve(configDir), now);
  const all = [...loadEscalations(escalationsPath), ...includePaths.flatMap((p) => loadEscalations(p))];
  const since = now() - gate.windowDays * DAY;
  const inWindow = all.filter((e) => e.ts >= since);
  const fired = inWindow.length >= gate.minPerWeek;
  const lines = [
    `escalations in window: ${inWindow.length}/${gate.minPerWeek} (${gate.windowDays}d) — ${
      fired ? "已触发 → 召开 P7b 知识定稿会" : "未触发（P7b 定稿会等闸到）"
    }`,
    `gate 来源: ${gate.source} · log: ${escalationsPath}`,
    ...inWindow.map((e) => `  · ${new Date(e.ts).toISOString()}  ${e.sessionId ?? "?"}  ${e.reason ?? "(no reason)"}`),
    ...(all.length > inWindow.length ? [`  (${all.length - inWindow.length} 条在窗口外，未计入)`] : []),
    // D-0910-8 clause made visible on every run: the window is the canonical
    // file alone; backups stay archived until a human names them via --include.
    ...(includePaths.length === 0
      ? [`  (备份文件未计入 — 窗口只读 canonical: ${escalationsPath}; 如需并档用 --include <file>)`]
      : [`  (--include 已并入: ${includePaths.join(", ")})`]),
  ];
  return { exitCode: 0, lines };
}
