/**
 * EntryAdapter is the translation surface between a client's world and the
 * agent's world. Deliberately four methods + one capability declaration:
 * identity, session mapping, presentation, confirmation. Anything richer belongs
 * in the client SDK below this seam, not in the contract.
 * `capabilities.confirm:false` is the pressure valve — an entry that cannot ask
 * a human can still run, but core must downgrade knowledge writes to read-only.
 */
import type { TenantRef } from "./knowledge.js";

/** One stream event handed to render(); event vocabulary is open by design. */
export interface RenderEvent {
  /** Event class (e.g. "assistant.text", "tool.progress"); dot-separated namespaces. */
  readonly type: string;
  /** JSON payload defined by the producer; carries no presentation semantics. */
  readonly payload: unknown;
  /** Unix epoch ms. Live: client clock; history: JSONL timestamp. */
  readonly timestampMs?: number;
}

/**
 * ONE replayable history item — the neutral currency of conversation replay
 * (P5.1 additive). The kernel keeps a session's real transcript in its own
 * private on-disk format; an EntryAdapter that wants to redraw a conversation
 * after a page reload needs that content WITHOUT learning the format. This
 * type is that seam: adapters translate their kernel's storage into these
 * entries, entries carry no presentation semantics, and no consumer of this
 * contract ever parses a kernel file.
 *
 * Deliberately the minimum that renders faithfully: who spoke, what was said,
 * which tool ran, whether it failed, and when. Not a full message model — no
 * ids, no block trees, no usage, no reasoning traces (internal thinking is the
 * kernel's business, never replayed as content).
 */
export interface TranscriptEntry {
  /** "tool" covers a tool invocation and its outcome as one replayable unit. */
  readonly role: "user" | "assistant" | "tool";
  /** Rendered text. For role "tool" this is the (possibly truncated) input. */
  readonly text: string;
  /** Present for role "tool" only. */
  readonly toolName?: string;
  /** role "tool": the call failed. Absent/false = succeeded. */
  readonly isError?: boolean;
  /** Unix epoch ms from the stored history; absent when the record carried none. */
  readonly timestampMs?: number;
}

/** Mapping between the client-side session and the agent session it drives. */
export interface SessionBinding {
  readonly clientSessionId: string;
  readonly agentSessionId: string;
}

export interface ConfirmRequest {
  readonly requestId: string;
  /** Human-readable question shown verbatim to the approver. */
  readonly prompt: string;
  /** What is being approved (e.g. a receipt id, a draft diff ref). Opaque to the contract. */
  readonly subject?: Record<string, unknown>;
  /** After ms elapsed the adapter must resolve a denial-equivalent; absent = no timeout. */
  readonly timeoutMs?: number;
}

export interface ConfirmResult {
  readonly approved: boolean;
  /** Attribution: who/what answered. Absent on automated denial. */
  readonly decidedBy?: string;
  readonly timestampMs?: number;
}

/** The entry socket. Implementations bind one client platform to one agent session flow. */
export interface EntryAdapter {
  /** Resolve caller → stable user + tenant. Throws when identity cannot be established. */
  identity(): Promise<{ userId: string; tenant: TenantRef }>;
  /** Bind the client session to an agent session. Repeat calls for the same client session return the same binding. */
  session(): Promise<SessionBinding>;
  /** Push event batch to the client. Presentation failures must not propagate — render never throws on display glitches. */
  render(events: RenderEvent[]): void | Promise<void>;
  /** Ask a human to gate a consequential action. Deny-timeout is the adapter's duty, not core's. */
  confirm(req: ConfirmRequest): Promise<ConfirmResult>;
  /** confirm:false ⇒ core auto-downgrades knowledge write permission to read-only. */
  readonly capabilities: { confirm: boolean };
}
