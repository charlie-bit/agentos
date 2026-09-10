/**
 * Transcript reader tests: a synthetic kernel store in a temp dir with the
 * home directory injected — the real dot-dir is never read and no kernel runs.
 * Emphasis is the FAILURE POSTURE: every degradation path returns entries
 * (possibly none) plus a structured warning, and never throws.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { projectDirName, readTranscript, type TranscriptWarning } from "../index.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SID = "11111111-2222-3333-4444-555555555555";

/** Fake kernel store: <home>/.claude/projects/<flattened cwd>/<id>.jsonl */
function store(lines: unknown[], sid: string = SID): { home: string; workspaceDir: string } {
  const home = mkdtempSync(join(tmpdir(), "agentos-transcript-"));
  dirs.push(home);
  const workspaceDir = join(home, "ws", "web-abc");
  const projectDir = join(home, ".claude", "projects", projectDirName(workspaceDir));
  mkdirSync(projectDir, { recursive: true });
  const body = lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n";
  writeFileSync(join(projectDir, sid + ".jsonl"), body, "utf8");
  return { home, workspaceDir };
}

const userText = (text: string, ts = "2026-09-10T07:00:00.000Z") => ({
  type: "user",
  timestamp: ts,
  message: { role: "user", content: [{ type: "text", text }] },
});

const asstText = (text: string, ts = "2026-09-10T07:00:01.000Z") => ({
  type: "assistant",
  timestamp: ts,
  message: { role: "assistant", content: [{ type: "text", text }] },
});

const collect = (): { list: TranscriptWarning[]; onWarn: (w: TranscriptWarning) => void } => {
  const list: TranscriptWarning[] = [];
  return { list, onWarn: (w) => list.push(w) };
};

describe("readTranscript: the happy path", () => {
  it("returns user and assistant text as neutral entries, oldest first", () => {
    const { home, workspaceDir } = store([userText("hello"), asstText("hi there")]);
    const out = readTranscript(SID, workspaceDir, { homeDir: home, env: {} });
    expect(out.map((e) => [e.role, e.text])).toEqual([
      ["user", "hello"],
      ["assistant", "hi there"],
    ]);
    expect(out[0]?.timestampMs).toBe(Date.parse("2026-09-10T07:00:00.000Z"));
  });

  it("a tool_use plus its tool_result collapse into ONE tool entry with the outcome", () => {
    const { home, workspaceDir } = store([
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "read_file", input: { path: "a.md" } }] },
      },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", is_error: true }] } },
    ]);
    const out = readTranscript(SID, workspaceDir, { homeDir: home, env: {} });
    expect(out).toHaveLength(1);
    expect(out[0]?.role).toBe("tool");
    expect(out[0]?.toolName).toBe("read_file");
    expect(out[0]?.isError).toBe(true);
    expect(out[0]?.text).toContain("a.md");
  });

  it("a successful tool call reports isError false, not undefined", () => {
    const { home, workspaceDir } = store([
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "kb_search", input: {} }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2" }] } },
    ]);
    expect(readTranscript(SID, workspaceDir, { homeDir: home, env: {} })[0]?.isError).toBe(false);
  });

  it("string content (not a block array) still replays", () => {
    const { home, workspaceDir } = store([{ type: "user", message: { role: "user", content: "plain string prompt" } }]);
    expect(readTranscript(SID, workspaceDir, { homeDir: home, env: {} })[0]?.text).toBe("plain string prompt");
  });
});

describe("readTranscript: what must NOT be replayed", () => {
  it("thinking blocks are dropped — internal reasoning is not conversation content", () => {
    const { home, workspaceDir } = store([
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "thinking", thinking: "secret chain" }, { type: "text", text: "answer" }] },
      },
    ]);
    const out = readTranscript(SID, workspaceDir, { homeDir: home, env: {} });
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe("answer");
    expect(JSON.stringify(out)).not.toContain("secret chain");
  });

  it("sidechain (subagent) records are skipped", () => {
    const { home, workspaceDir } = store([{ ...asstText("subagent noise"), isSidechain: true }, asstText("real answer")]);
    expect(readTranscript(SID, workspaceDir, { homeDir: home, env: {} }).map((e) => e.text)).toEqual(["real answer"]);
  });

  it("kernel bookkeeping record types contribute nothing", () => {
    const { home, workspaceDir } = store([
      { type: "attachment", message: { role: "user", content: [{ type: "text", text: "attached" }] } },
      { type: "queue-operation" },
      { type: "ai-title", title: "some title" },
      { type: "mode" },
      userText("only me"),
    ]);
    expect(readTranscript(SID, workspaceDir, { homeDir: home, env: {} }).map((e) => e.text)).toEqual(["only me"]);
  });

  it("empty and whitespace-only text blocks never become entries", () => {
    const { home, workspaceDir } = store([userText("   "), asstText("")]);
    expect(readTranscript(SID, workspaceDir, { homeDir: home, env: {} })).toEqual([]);
  });
});

describe("readTranscript: degradation is structured, never thrown", () => {
  it("no store dir at all: empty array plus no-store-dir", () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-transcript-bare-"));
    dirs.push(home);
    const w = collect();
    expect(readTranscript(SID, join(home, "ws"), { homeDir: home, env: {}, onWarn: w.onWarn })).toEqual([]);
    expect(w.list[0]?.code).toBe("no-store-dir");
  });

  it("store exists but this session has no file: empty array plus no-transcript-file", () => {
    const { home, workspaceDir } = store([userText("hi")]);
    const w = collect();
    const out = readTranscript("99999999-0000-0000-0000-000000000000", workspaceDir, { homeDir: home, env: {}, onWarn: w.onWarn });
    expect(out).toEqual([]);
    expect(w.list.map((x) => x.code)).toContain("no-transcript-file");
  });

  it("a truncated final line (write in flight) loses that line only, and warns", () => {
    const { home, workspaceDir } = store([JSON.stringify(userText("kept")), '{"type":"assistant","message":{"rol']);
    const w = collect();
    const out = readTranscript(SID, workspaceDir, { homeDir: home, env: {}, onWarn: w.onWarn });
    expect(out.map((e) => e.text)).toEqual(["kept"]);
    expect(w.list.map((x) => x.code)).toContain("unparsable-line");
  });

  it("a wholly corrupt file yields no entries and no throw", () => {
    const { home, workspaceDir } = store(["not json at all", "{{{", " "]);
    expect(() => readTranscript(SID, workspaceDir, { homeDir: home, env: {} })).not.toThrow();
    expect(readTranscript(SID, workspaceDir, { homeDir: home, env: {} })).toEqual([]);
  });

  it("a throwing onWarn sink cannot break the read", () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-transcript-sink-"));
    dirs.push(home);
    const boom = () => {
      throw new Error("dead sink");
    };
    expect(() => readTranscript(SID, join(home, "ws"), { homeDir: home, env: {}, onWarn: boom })).not.toThrow();
  });
});

describe("readTranscript: lookup and safety", () => {
  it("finds the file by scanning when workspaceDir does not match the stored project dir", () => {
    const { home } = store([userText("found by scan")]);
    const out = readTranscript(SID, join(home, "some", "other", "place"), { homeDir: home, env: {} });
    expect(out.map((e) => e.text)).toEqual(["found by scan"]);
  });

  it("works with no workspaceDir at all (the ledger pointer is enough)", () => {
    const { home } = store([userText("pointer only")]);
    expect(readTranscript(SID, undefined, { homeDir: home, env: {} }).map((e) => e.text)).toEqual(["pointer only"]);
  });

  it("CLAUDE_CONFIG_DIR overrides the default store root", () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-transcript-cfg-"));
    dirs.push(home);
    const cfg = join(home, "custom-config");
    const workspaceDir = join(home, "ws");
    const projectDir = join(cfg, "projects", projectDirName(workspaceDir));
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, SID + ".jsonl"), JSON.stringify(userText("via env")) + "\n", "utf8");
    const out = readTranscript(SID, workspaceDir, { homeDir: join(home, "unused"), env: { CLAUDE_CONFIG_DIR: cfg } });
    expect(out.map((e) => e.text)).toEqual(["via env"]);
  });

  it("a session id that could escape the store is refused outright", () => {
    const { home, workspaceDir } = store([userText("x")]);
    for (const evil of ["../../etc/passwd", "a/b", "..", ""]) {
      expect(readTranscript(evil, workspaceDir, { homeDir: home, env: {} })).toEqual([]);
    }
  });

  it("maxEntries caps the replay and reports the cap", () => {
    const many = Array.from({ length: 12 }, (_v, i) => userText("m" + String(i)));
    const { home, workspaceDir } = store(many);
    const w = collect();
    const out = readTranscript(SID, workspaceDir, { homeDir: home, env: {}, maxEntries: 5, onWarn: w.onWarn });
    expect(out).toHaveLength(5);
    expect(w.list.map((x) => x.code)).toContain("entry-cap-reached");
  });

  it("tool input rendering is truncated to the configured cap", () => {
    const { home, workspaceDir } = store([
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "tool_use", id: "t", name: "big", input: { blob: "x".repeat(900) } }] },
      },
    ]);
    const out = readTranscript(SID, workspaceDir, { homeDir: home, env: {}, maxToolInputChars: 50 });
    expect(out[0]?.text.length).toBe(50);
  });
});
