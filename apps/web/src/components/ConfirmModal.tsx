import { useEffect, useState } from "react";
import { answerConfirm } from "../lib/api";
import type { PendingConfirm } from "../lib/chat-reducer";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/**
 * confirm verb surface. The SSE frame carries no deadline (the entry-rest
 * contract vocabulary is frozen in this step), so instead of a fake
 * countdown we state the truth: the server denies on its own timeout and the
 * modal closes when the turn's result frame arrives.
 */
export function ConfirmModal({
  pending,
  onResolved,
}: {
  pending: PendingConfirm | null;
  onResolved: () => void;
}) {
  const [sending, setSending] = useState(false);
  useEffect(() => setSending(false), [pending?.requestId]);
  if (!pending) return null;

  const answer = async (approved: boolean) => {
    setSending(true);
    await answerConfirm(pending.requestId, approved).catch(() => undefined);
    onResolved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onResolved()}>
      <DialogContent>
        <DialogTitle className="text-[11px] font-medium uppercase tracking-wide text-muted">
          confirmation requested
        </DialogTitle>
        <p className="my-2 text-sm">{pending.prompt}</p>
        {pending.subject !== null && (
          <pre className="mb-2 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] text-muted">
            {JSON.stringify(pending.subject, null, 2)}
          </pre>
        )}
        <DialogDescription className="mb-3 text-[11px] text-muted">
          unanswered requests are auto-denied by the server (timeout policy lives entry-side).
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={sending} onClick={() => void answer(false)}>
            Deny
          </Button>
          <Button disabled={sending} onClick={() => void answer(true)}>
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
