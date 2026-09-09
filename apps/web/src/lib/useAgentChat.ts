/**
 * useAgentChat: the only place the reducer meets the network. Also owns the
 * session pick (sidebar click => switch browser id; server-side resume runs
 * through the ledger pointer — the client just changes which key it sends).
 */
import { useCallback, useReducer, useRef, useState } from "react";
import { chat, sessionId as initialSessionId } from "./api";
import { initialState, reduce, type Frame } from "./chat-reducer";

export function useAgentChat() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [sessionId, setSessionId] = useState<string>(initialSessionId());
  const busy = useRef(false);

  const send = useCallback(
    async (text: string) => {
      if (busy.current) return false;
      busy.current = true;
      dispatch({ t: "send", text });
      dispatch({ t: "stream_start" });
      const onFrame = (frame: Frame) => dispatch({ t: "frame", frame });
      try {
        await chat(sessionId, text, onFrame);
      } catch {
        onFrame({ type: "result", payload: { subtype: "network-error", isError: true } });
      } finally {
        dispatch({ t: "stream_end" });
        busy.current = false;
      }
      return true;
    },
    [sessionId],
  );

  const pickSession = useCallback((browserId: string) => {
    try {
      localStorage.setItem("agentos.web.session", browserId);
    } catch {
      /* ephemeral */
    }
    setSessionId(browserId);
    dispatch({ t: "session_switched" });
  }, []);

  return { state, send, sessionId, pickSession, resolveConfirm: () => dispatch({ t: "confirm_resolved" }) };
}
