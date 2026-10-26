/** Console shell: three contract surfaces, one row each, around the chat. */
import { useCallback, useEffect, useState } from "react";
import { webExternalKey } from "@agentos/contracts/session-key";
import { deleteSession, getEscalations, getSessions, getStatus, HttpError, renameSession, setAccessToken, type SessionRow, type StatusResponse } from "./lib/api";
import { useAgentChat } from "./lib/useAgentChat";
import { emptyVariant } from "./lib/empty-state";
import { ChatStream } from "./components/ChatStream";
import { Composer } from "./components/Composer";
import { ConfirmModal } from "./components/ConfirmModal";
import { SessionSidebar } from "./components/SessionSidebar";
import { StatusStrip } from "./components/StatusStrip";
import { TokenGate } from "./components/TokenGate";
import { FilePanel } from "./components/FilePanel";
import { DraftInbox } from "./components/DraftInbox";
import { LogsPanel } from "./components/LogsPanel";
import { UsageBar } from "./components/UsageBar";

/** Sidebar polling cadence — a session running from another tab/device must
 * become visible here without the viewer having to complete a turn of their
 * own (previously the ledger only refreshed after `state.turns` changed). */
const SESSIONS_POLL_MS = 4000;

export default function App() {
  const { state, send, stop, sessionId, pickSession, newSession, resolveConfirm } = useAgentChat();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [escalations, setEscalations] = useState(0);
  const [quote, setQuote] = useState<{ text: string; nonce: number } | undefined>();
  const [needsToken, setNeedsToken] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [clearNonce, setClearNonce] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [s, l, e] = await Promise.all([getStatus(sessionId), getSessions(), getEscalations()]);
      setStatus(s);
      setSessions(l.sessions);
      setEscalations(e.count);
    } catch (err) {
      // 403 = the local token gate (spec #287); everything else is a server
      // that is (re)starting and the next poll recovers.
      if (err instanceof HttpError && err.status === 403) setNeedsToken(true);
    }
  }, [sessionId]);

  // Keyboard paths (spec #281): Esc clears the draft, Alt+↑/↓ walks sessions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClearNonce((n) => n + 1);
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const keys = sessions.map((s) => s.external_key.replace(/^web-/, ""));
        const at = keys.indexOf(sessionId);
        if (keys.length === 0) return;
        const next = e.key === "ArrowUp" ? Math.max(0, at - 1) : Math.min(keys.length - 1, at + 1);
        if (keys[next] !== undefined && next !== at) pickSession(keys[next] as string);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessions, sessionId, pickSession]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), SESSIONS_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);
  // after every completed turn, the ledger + drift picture changes
  useEffect(() => {
    if (state.turns > 0) void refresh();
  }, [state.turns, refresh]);

  const handleRename = useCallback(
    async (id: string, title: string) => {
      await renameSession(id, title);
      void refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void (async () => {
        // If the row being deleted is the one currently open, don't leave the
        // console pointed at a session that no longer exists in the ledger.
        const row = sessions.find((s) => s.id === id);
        const deletingActive = row && row.external_key === webExternalKey(sessionId);
        await deleteSession(id).catch(() => undefined);
        if (deletingActive) newSession();
        void refresh();
      })();
    },
    [sessions, sessionId, newSession, refresh],
  );

  return (
    <div className="flex h-full flex-col">
      <StatusStrip
        status={status}
        onToggleFiles={() => setShowFiles((v) => !v)}
        onToggleDrafts={() => setShowDrafts((v) => !v)}
        onToggleLogs={() => setShowLogs((v) => !v)}
      />
      <div className="flex min-h-0 flex-1">
        <SessionSidebar
          sessions={sessions}
          activeKey={sessionId}
          onPick={pickSession}
          onNew={newSession}
          onRename={handleRename}
          onDelete={handleDelete}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
          <ChatStream
            state={state}
            onQuote={(text) => setQuote({ text, nonce: Date.now() })}
            empty={emptyVariant({
              sessionCount: sessions.length,
              mountCount: status?.mounts.filter((m) => m.degraded !== true).length ?? 0,
              hasKnowledge: Boolean(status?.knowledge),
            })}
          />
          {/* key=sessionId: creating/switching sessions (sidebar "+", a row
              click) must be visible immediately, not only once a reply comes
              back — remounting drops stale draft text and refires autoFocus,
              which is the click's whole user-visible feedback. */}
          <Composer
            key={sessionId}
            sessionId={sessionId}
            busy={state.conn !== "idle"}
            onSend={(t) => void send(t)}
            onStop={() => void stop()}
            quote={quote}
            clearNonce={clearNonce}
          />
            </div>
            {showFiles && <FilePanel sessionId={sessionId} onClose={() => setShowFiles(false)} />}
            {showDrafts && <DraftInbox sessionId={sessionId} onClose={() => setShowDrafts(false)} />}
            {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
          </div>
        </div>
      </div>
      <UsageBar usage={state.usage} live={state.live} escalations={escalations} sessionId={sessionId} onEscalated={setEscalations} modelShort={state.modelShort} />
      <ConfirmModal pending={state.pending} onResolved={resolveConfirm} />
      {needsToken && (
        <TokenGate
          onSubmit={(token) => {
            setAccessToken(token);
            setNeedsToken(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
