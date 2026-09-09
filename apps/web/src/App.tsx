/** Console shell: wires the reducer to the SSE client + status/sidebars. */
import { useCallback, useEffect, useReducer, useState } from "react";
import { reducer, initial } from "./state";
import { answerConfirm, chat, getEscalations, getSessions, getStatus, sessionId, escalate, type SessionsResponse, type StatusResponse } from "./api";
import { ChatStream, Composer, ConfirmModal, SessionSidebar, StatusStrip, UsageBar } from "./components";

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessions, setSessions] = useState<SessionsResponse["sessions"]>([]);
  const [browserSession, setBrowserSession] = useState<string>(sessionId());
  const [escalations, setEscalations] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [s, l, e] = await Promise.all([getStatus(), getSessions(), getEscalations()]);
      setStatus(s);
      setSessions(l.sessions);
      setEscalations(e.count);
    } catch {
      /* server restarted mid-view: next action re-fetches */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const send = async (text: string) => {
    dispatch({ type: "send", text });
    try {
      await chat(browserSession, text, (frame) => dispatch({ type: "frame", frame }));
    } catch {
      // transport-level failure: synthesize the result frame the server never got to send
      dispatch({ type: "frame", frame: { type: "result", payload: { subtype: "network-error", isError: true } } });
    } finally {
      dispatch({ type: "turn_end" });
      void refresh();
    }
  };

  const answer = async (approved: boolean) => {
    if (!state.confirm) return;
    await answerConfirm(state.confirm.requestId, approved).catch(() => undefined);
    dispatch({ type: "confirm_answered" });
  };

  const pickSession = (id: string) => {
    setBrowserSession(id); // next chat resumes through the ledger pointer of this row
    dispatch({ type: "frame", frame: { type: "session.picked" } });
  };

  return (
    <div className="app">
      <StatusStrip status={status} />
      <div className="body">
        <SessionSidebar sessions={sessions} active={browserSession} onPick={pickSession} />
        <div className="chat-col">
          <ChatStream state={state} />
          <Composer busy={state.busy} onSend={(t) => void send(t)} />
        </div>
      </div>
      <UsageBar
        usage={state.usage}
        escalations={escalations}
        canEscalate={true}
        onEscalate={() => void escalate(browserSession).then(() => void refresh())}
      />
      <ConfirmModal pending={state.confirm} onAnswer={(a) => void answer(a)} />
      {state.resumed ? <div className="resumed-toast">resumed prior session (server-side history)</div> : null}
    </div>
  );
}
