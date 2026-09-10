/**
 * useAgentChat: the only place the reducer meets the network. Also owns the
 * session pick (sidebar click => switch browser id; server-side resume runs
 * through the ledger pointer — the client just changes which key it sends).
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { chat, getMessages, sessionId as initialSessionId } from "./api";
import { initialState, reduce, type Frame } from "./chat-reducer";

export function useAgentChat() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [sessionId, setSessionId] = useState<string>(initialSessionId());
  const busy = useRef(false);

  /**
   * Replay this session's past turns (P5.1). The ledger resumes the kernel's
   * memory on the next turn, but the CONTENT of earlier turns lives in the
   * kernel's own store — without this fetch a reload showed an empty chat over
   * a session that actually remembered everything. Runs on mount and on every
   * session switch. `stale` drops a slow response for a session the user has
   * already left, so histories can never cross-contaminate; a failed fetch
   * leaves the chat empty, which is exactly the old behavior.
   */
  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const { entries } = await getMessages(sessionId);
        if (!stale) dispatch({ t: "hydrate", items: entries ?? [] });
      } catch {
        /* history is a nicety: no replay, live chat unaffected */
      }
    })();
    return () => {
      stale = true;
    };
  }, [sessionId]);

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
