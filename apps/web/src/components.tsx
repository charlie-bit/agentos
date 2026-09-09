/**
 * Console widgets — each maps to one contract surface:
 * StatusStrip=assembly/mounts+drift, SessionSidebar=ledger, ChatStream=
 * RenderEvent vocabulary, ConfirmModal=confirm verb, UsageBar=result usage
 * + escalation telemetry. Plain CSS classes, no styled lib (whitelist).
 */
import { useEffect, useRef, useState } from "react";
import type { Block, ConsoleState, PendingConfirm, Usage } from "./state";
import type { StatusResponse, SessionsResponse } from "./api";

export function StatusStrip({ status }: { status: StatusResponse | null }) {
  if (!status) return <header className="strip dim">loading status…</header>;
  return (
    <header className="strip">
      <span className="chip">preset {status.preset}</span>
      <span className="chip">model {status.model.provider}</span>
      <span className="chip">
        tools{" "}
        {status.mounts.length === 0
          ? "none"
          : status.mounts
              .map((m) => `${m.degraded ? "✗" : "✓"} ${m.key}`)
              .join("  ")}
      </span>
      {status.lastDrift && (status.lastDrift.missing.length > 0 || status.lastDrift.undeclared.length > 0) ? (
        <span className="chip warn" title={JSON.stringify(status.lastDrift)}>
          drift {status.lastDrift.missing.length + status.lastDrift.undeclared.length}
        </span>
      ) : (
        <span className="chip ok">drift 0</span>
      )}
    </header>
  );
}

export function SessionSidebar({
  sessions,
  active,
  onPick,
}: {
  sessions: SessionsResponse["sessions"];
  active: string;
  onPick: (browserId: string) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="side-title">sessions (ledger)</div>
      {sessions.length === 0 && <div className="dim side-empty">none yet</div>}
      <ul>
        {sessions.map((row) => {
          const browserId = row.external_key.startsWith("web-") ? row.external_key.slice(4) : row.external_key;
          return (
            <li key={row.id}>
              <button
                className={browserId === active ? "row active" : "row"}
                onClick={() => onPick(browserId)}
                title={`resume ${row.external_key}`}
              >
                <span className={`dot ${row.status}`} />
                <span className="row-name">{browserId.slice(0, 8)}</span>
                <span className="row-meta">
                  {row.status} · {new Date(row.last_active_ms).toLocaleTimeString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function ToolCallBlock({ block }: { block: Extract<Block, { kind: "tool" }> }) {
  return (
    <details className="tool" data-status={block.status}>
      <summary>
        <span className={`badge ${block.status}`}>{block.status}</span>
        <code>{block.name}</code>
        <span className="tool-input">{block.input}</span>
      </summary>
      <pre className="tool-args">{block.input}</pre>
    </details>
  );
}

export function ChatStream({ state }: { state: ConsoleState }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.blocks.length, state.noise]);
  return (
    <main className="stream" aria-live="polite">
      {state.drift && (state.drift.missing.length > 0 || state.drift.undeclared.length > 0) && (
        <div className="drift" role="alert">
          <strong>⚠ tool drift</strong> missing: {state.drift.missing.join(", ") || "—"} · undeclared:{" "}
          {state.drift.undeclared.join(", ") || "—"} <em>(warning only — the session continues)</em>
        </div>
      )}
      {state.blocks.length === 0 && <div className="dim empty">Ask the assistant anything it can answer with the mounted tools.</div>}
      {state.blocks.map((b, i) => {
        if (b.kind === "user") return <div className="msg user" key={i}>{b.text}</div>;
        if (b.kind === "assistant")
          return (
            <div className={b.streaming && state.busy ? "msg assistant live" : "msg assistant"} key={i}>
              {b.text}
            </div>
          );
        if (b.kind === "tool") return <ToolCallBlock block={b} key={i} />;
        return <div className={`note ${b.tone}`} key={i}>{b.text}</div>;
      })}
      {state.noise > 0 && <div className="dim noise-line">kernel noise: {state.noise} frame(s) aggregated</div>}
      {state.busy && <div className="dim typing">assistant is working…</div>}
      <div ref={endRef} />
    </main>
  );
}

export function ConfirmModal({
  pending,
  onAnswer,
}: {
  pending: PendingConfirm | null;
  onAnswer: (approved: boolean) => void;
}) {
  if (!pending) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-title">confirmation requested</div>
        <p className="modal-prompt">{pending.prompt}</p>
        {pending.subject ? <pre className="modal-subject">{JSON.stringify(pending.subject, null, 2)}</pre> : null}
        <div className="modal-actions">
          <button className="deny" onClick={() => onAnswer(false)}>
            Deny (N)
          </button>
          <button className="approve" onClick={() => onAnswer(true)}>
            Approve (Y)
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsageBar({
  usage,
  escalations,
  onEscalate,
  canEscalate,
}: {
  usage: Usage;
  escalations: number;
  onEscalate: () => void;
  canEscalate: boolean;
}) {
  return (
    <footer className="usagebar">
      <span>
        in {usage.input} · out {usage.output}
        {usage.cacheRead ? ` · cache_rd ${usage.cacheRead}` : ""}
        {usage.cacheWrite ? ` · cache_wr ${usage.cacheWrite}` : ""} · ≈${usage.cost.toFixed(4)}{" "}
        <em className="dim">(list-price; compat endpoints → channel billing)</em>
      </span>
      <span className="spacer" />
      <span className="dim">escalations: {escalations}</span>
      <button onClick={onEscalate} disabled={!canEscalate} title="record a human-handoff request">
        escalate to human
      </button>
    </footer>
  );
}

/** Composer with local echo of the send action. */
export function Composer({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    setValue("");
    onSend(v);
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        value={value}
        placeholder={busy ? "assistant is working…" : "message the agent"}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <button type="submit" disabled={busy || value.trim() === ""}>
        send
      </button>
    </form>
  );
}
