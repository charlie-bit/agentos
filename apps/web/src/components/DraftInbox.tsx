import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { commitKbDraft, discardKbDraft, getKbDrafts, type KbDraft } from "../lib/api";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

/**
 * KB draft inbox (spec #272): the user side of two-phase writeback (#42).
 * A kb_write draft is invisible to search until it is committed here; the
 * click is the human confirmation the kernel's gate asks for.
 */
export function DraftInbox({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [drafts, setDrafts] = useState<KbDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setDrafts((await getKbDrafts(sessionId)).drafts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "drafts unavailable");
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const act = async (id: string, kind: "commit" | "discard") => {
    setBusy(id);
    try {
      if (kind === "commit") await commitKbDraft(id);
      else await discardKbDraft(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "action failed");
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="knowledge drafts">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">pending drafts ({drafts.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title="close">
          ×
        </button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && drafts.length === 0 && <div className="px-1 text-muted-foreground">no pending drafts</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {drafts.map((d) => (
            <li key={d.receiptId} className="rounded border border-border p-1.5">
              <div className="font-mono text-[11px] text-foreground">{d.pageId || d.title}</div>
              <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{d.preview}</pre>
              <div className="mt-1 flex justify-end gap-1">
                <Button size="sm" variant="outline" disabled={busy === d.receiptId} onClick={() => void act(d.receiptId, "discard")}>
                  <X className="h-3 w-3" /> discard
                </Button>
                <Button size="sm" disabled={busy === d.receiptId} onClick={() => void act(d.receiptId, "commit")}>
                  <Check className="h-3 w-3" /> commit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="px-1 text-[10px] text-muted-foreground">
        Commit writes the page into the knowledge book (git) and consumes the draft; discard deletes it.
      </div>
    </aside>
  );
}
