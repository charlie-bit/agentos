/**
 * EntryCli — the first EntryAdapter implementation (the terminal door).
 * Dependency discipline (enforced by this file's imports): contracts + core +
 * Node builtins ONLY. It never imports adapters/** and never sees a kernel
 * type — the composition root (cli) pumps RenderEvents into render(); this
 * module's job is presentation + the four contract verbs and nothing else.
 *
 * render() is a FILTER, not a printer: kernel.system.* noise is counted and
 * flushed as one aggregate line on the result frame (live P3 telemetry showed
 * ~34 thinking-token frames per beat — raw streams are unreadable); assistant
 * text streams verbatim; tool frames are single-line compact; drift is the
 * loud warning it deserves to be; result carries the usage summary line with
 * the compat-endpoint billing caveat. `verbose` disables all filtering.
 * The sink is injectable so conformance captures output without TTYs, and
 * repo-wide no-console stays green: every byte goes through write().
 */
import { createInterface } from "node:readline";
import { userInfo } from "node:os";
import type {
  ConfirmRequest,
  ConfirmResult,
  EntryAdapter,
  RenderEvent,
  SessionBinding,
  TenantRef,
} from "@agentos/contracts";
import { openLedger, type Ledger, type SessionRow } from "@agentos/core";

/** Registration name; presets reference this in the entry slot. */
export const ENTRY_NAME = "cli";

export interface EntryCliOptions {
  /** Preset name becomes the tenant identity for this process (one preset per REPL). */
  presetName: string;
  /** Ledger external key for session binding. Default: unique per process. */
  externalKey?: string;
  /** Ledger to bind sessions against. Default: opened from AGENTOS_SESSION_DB. */
  ledger?: Ledger;
  /** Display sink. Default: process.stdout. */
  write?: (chunk: string) => void;
  /** readline source for confirm(). Default: process.stdin. */
  input?: NodeJS.ReadableStream;
  /** Escape hatch: disable filtering, print every event as one raw line. */
  verbose?: boolean;
}

/** Vendor-shaped usage object as it rides in the result event payload (snake_case passthrough). */
interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Shared usage-line formatter (result line + cli cumulative lines speak one dialect). */
export function formatUsageSummary(u: {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}): string {
  const parts = [`in=${u.inputTokens ?? 0}`, `out=${u.outputTokens ?? 0}`];
  if (u.cacheReadTokens) parts.push(`cache_read=${u.cacheReadTokens}`);
  if (u.cacheCreationTokens) parts.push(`cache_write=${u.cacheCreationTokens}`);
  return `tokens: ${parts.join(" ")}`;
}

export class EntryCli implements EntryAdapter {
  readonly capabilities = { confirm: true };

  private readonly opts: Required<Pick<EntryCliOptions, "presetName" | "externalKey">> & EntryCliOptions;
  private readonly ledger: Ledger;
  private readonly ownsLedger: boolean;
  private readonly write: (chunk: string) => void;
  private cachedIdentity?: { userId: string; tenant: TenantRef };
  private cachedBinding?: SessionBinding;
  private noise = new Map<string, number>();

  constructor(o: EntryCliOptions) {
    this.opts = { ...o, externalKey: o.externalKey ?? `cli-${Date.now()}` };
    this.ownsLedger = o.ledger === undefined;
    this.ledger = o.ledger ?? openLedger();
    this.write = o.write ?? ((chunk) => process.stdout.write(chunk));
  }

  /**
   * identity(): stable process-level facts. Failure to resolve the OS user
   * THROWS — a session without identity is not a degraded state, it is a bug.
   */
  async identity(): Promise<{ userId: string; tenant: TenantRef }> {
    if (this.cachedIdentity) return this.cachedIdentity;
    const userId = userInfo().username; // throws on failure, per contract
    this.cachedIdentity = { userId, tenant: { tenantId: this.opts.presetName } };
    return this.cachedIdentity;
  }

  /**
   * session(): get-or-create the ledger row, idempotently — the SAME
   * externalKey always yields the SAME binding (contract clause; locked by
   * conformance). agentSessionId IS the ledger row id; the sdk_session_id
   * pointer on that row is maintained by the composition root.
   */
  async session(): Promise<SessionBinding> {
    if (this.cachedBinding) return this.cachedBinding;
    const key = this.opts.externalKey;
    const row: SessionRow = this.ledger.getByExternalKey(key) ?? this.ledger.createSession({
      entry: ENTRY_NAME,
      externalKey: key,
      preset: this.opts.presetName,
    });
    this.cachedBinding = { clientSessionId: key, agentSessionId: row.id };
    return this.cachedBinding;
  }

  /** The ledger row backing this session (pointer/status bookkeeping for cli). */
  get sessionRow(): SessionRow {
    if (!this.cachedBinding) throw new Error("session() has not been called");
    const row = this.ledger.getByExternalKey(this.cachedBinding.clientSessionId);
    if (!row) throw new Error("ledger row vanished between calls");
    return row;
  }

  /**
   * render(): presentation-only; NEVER throws (contract: display failures
   * don't propagate). Per-event try/catch means one malformed frame cannot
   * kill the rest of the batch.
   */
  render(events: RenderEvent[]): void {
    for (const event of events ?? []) {
      try {
        this.renderOne(event);
      } catch {
        /* a broken line must not break the stream */
      }
    }
  }

  private renderOne(event: RenderEvent): void {
    if (this.opts.verbose) {
      this.write(`· ${event.type} ${JSON.stringify(event.payload ?? null)}\n`);
      return;
    }
    switch (event.type) {
      case "assistant.text":
        this.write(`${String((event.payload as { text?: unknown })?.text ?? "")}\n`);
        return;
      case "tool.call": {
        const p = (event.payload ?? {}) as { tool?: string; input?: unknown };
        this.write(`· tool → ${p.tool ?? "?"} ${safeJson(p.input).slice(0, 140)}\n`);
        return;
      }
      case "tool.result": {
        const p = (event.payload ?? {}) as { isError?: boolean };
        this.write(`· tool ← ${p.isError ? "ERROR" : "ok"}\n`);
        return;
      }
      case "session.init": {
        const p = (event.payload ?? {}) as { model?: string };
        this.write(`· init model=${p.model ?? "?"}\n`);
        return;
      }
      case "kernel.system.drift": {
        const p = (event.payload ?? {}) as { missing?: string[]; undeclared?: string[] };
        this.write(`⚠ drift: missing=[${(p.missing ?? []).join(", ")}] undeclared=[${(p.undeclared ?? []).join(", ")}]\n`);
        return;
      }
      case "result": {
        const p = (event.payload ?? {}) as { subtype?: string; isError?: boolean; usage?: RawUsage | null; totalCostUsd?: number | null };
        const usage = p.usage ?? undefined;
        const summary = usage
          ? formatUsageSummary({
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cacheReadTokens: usage.cache_read_input_tokens,
              cacheCreationTokens: usage.cache_creation_input_tokens,
            })
          : "tokens: n/a (endpoint reported none)";
        const cost =
          typeof p.totalCostUsd === "number"
            ? ` | cost≈$${p.totalCostUsd.toFixed(4)} (list-price; compat endpoints → channel billing is authoritative)`
            : "";
        this.write(`· result ${p.isError ? "ERROR " : ""}${p.subtype ?? "?"} — ${summary}${cost}\n`);
        this.flushNoise();
        return;
      }
      default: {
        // everything else is kernel noise: count, aggregate on the result line
        const kind = event.type.startsWith("kernel.system.") ? event.type : `other:${event.type}`;
        this.noise.set(kind, (this.noise.get(kind) ?? 0) + 1);
      }
    }
  }

  private flushNoise(): void {
    const total = [...this.noise.values()].reduce((a, b) => a + b, 0);
    if (total > 0) this.write(`· kernel noise: ${total} event(s) aggregated (use --verbose to see all)\n`);
    this.noise.clear();
  }

  /**
   * confirm(): ask the human via readline, y/N default DENY. Deny-on-timeout
   * is this adapter's duty (contract): after req.timeoutMs the promise
   * resolves {approved:false, decidedBy:"timeout"} without waiting for input.
   */
  async confirm(req: ConfirmRequest): Promise<ConfirmResult> {
    const rl = createInterface({ input: this.opts.input ?? process.stdin, terminal: false });
    const question = new Promise<ConfirmResult>((resolve) => {
      rl.question(`${req.prompt} [y/N] `, (answer) => {
        const approved = /^(y|yes)$/i.test(answer.trim());
        resolve({ approved, decidedBy: `cli-user:${answer.trim() || "blank"}`, timestampMs: Date.now() });
      });
    });
    try {
      if (req.timeoutMs === undefined) return await question;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<ConfirmResult>((resolve) => {
        timer = setTimeout(() => resolve({ approved: false, decidedBy: "timeout", timestampMs: Date.now() }), req.timeoutMs);
      });
      return await Promise.race([question, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
        rl.close();
      });
    } finally {
      rl.close();
    }
  }

  /** Release the ledger handle if this instance opened it. */
  close(): void {
    if (this.ownsLedger) this.ledger.close();
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "[unserializable]";
  }
}
