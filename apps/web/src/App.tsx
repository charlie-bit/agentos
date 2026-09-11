/** Console shell: three contract surfaces, one row each, around the chat. */
import { useCallback, useEffect, useState } from "react";
import { getEscalations, getSessions, getStatus, type SessionRow, type StatusResponse } from "./lib/api";
import { useAgentChat } from "./lib/useAgentChat";
import { ChatStream } from "./components/ChatStream";
import { Composer } from "./components/Composer";
import { ConfirmModal } from "./components/ConfirmModal";
import { SessionSidebar } from "./components/SessionSidebar";
import { StatusStrip } from "./components/StatusStrip";
import { UsageBar } from "./components/UsageBar";

export default function App() {
  const { state, send, sessionId, pickSession, resolveConfirm } = useAgentChat();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [escalations, setEscalations] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [s, l, e] = await Promise.all([getStatus(), getSessions(), getEscalations()]);
      setStatus(s);
      setSessions(l.sessions);
      setEscalations(e.count);
    } catch {
      /* server (re)starting: next refresh recovers */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  // after every completed turn, the ledger + drift picture changes
  useEffect(() => {
    if (state.turns > 0) void refresh();
  }, [state.turns, refresh]);

  return (
    <div className="flex h-full flex-col">
      <StatusStrip status={status} />
      <div className="flex min-h-0 flex-1">
        <SessionSidebar sessions={sessions} activeKey={sessionId} onPick={pickSession} />
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatStream state={state} />
          <Composer busy={state.conn !== "idle"} onSend={(t) => void send(t)} />
        </div>
      </div>
      <UsageBar usage={state.usage} escalations={escalations} sessionId={sessionId} onEscalated={setEscalations} modelShort={state.modelShort} />
      <ConfirmModal pending={state.pending} onResolved={resolveConfirm} />
    </div>
  );
}
