import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { uploadAttachment } from "../lib/api";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

/** Enter sends; streaming disables send but the queue hint keeps intent visible. */
export function Composer({
  busy,
  onSend,
  onStop,
  quote,
  onAttach,
  sessionId,
  clearNonce,
}: {
  busy: boolean;
  onSend: (text: string) => void;
  /** Stop the in-flight turn (spec #255). Absent = no stop affordance. */
  onStop?: () => void;
  /** Bumping `nonce` appends `text` as a quote block — additive, never overwrites a draft in progress. */
  quote?: { text: string; nonce: number };
  /** Uploads attachments into the session workspace (spec #276–#278). */
  onAttach?: (file: File) => Promise<{ path: string; size: number }>;
  sessionId?: string;
  /** Bumping this clears the draft (Esc, spec #281). */
  clearNonce?: number;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Array<{ path: string; size: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attach = onAttach ?? (sessionId ? (file: File) => uploadAttachment(sessionId, file) : undefined);
  useEffect(() => {
    if (clearNonce !== undefined && clearNonce > 0) setValue("");
  }, [clearNonce]);
  useEffect(() => {
    if (!quote) return;
    // Composer is a single-line input by design — a multi-line selection
    // collapses to one quoted line rather than growing the control.
    const collapsed = quote.text.replace(/\s+/g, " ").trim();
    setValue((v) => (v ? `${v} "${collapsed}" ` : `"${collapsed}" `));
    inputRef.current?.focus();
  }, [quote?.nonce]);
  const submit = () => {
    const v = value.trim();
    if ((!v && attachments.length === 0) || busy) return;
    // Attachments enter the turn as workspace pointers (spec #277): the agent
    // reads them with the Read tool, so no payload rides in the prompt.
    const pointerBlock =
      attachments.length > 0
        ? `\n\nAttached files (session workspace, read with the Read tool):\n${attachments.map((a) => `- ${a.path}`).join("\n")}`
        : "";
    setValue("");
    setAttachments([]);
    onSend(v + pointerBlock);
  };
  return (
    <form
      className="flex items-center gap-2 border-t border-border px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {attachments.map((a) => (
            <span key={a.path} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {a.path.replace(/^attachments\//, "")}
            </span>
          ))}
        </div>
      )}
      {attach && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              void attach(file)
                .then((up: { path: string; size: number }) => setAttachments((prev) => [...prev, up]))
                .catch(() => undefined)
                .finally(() => {
                  setUploading(false);
                  if (fileRef.current) fileRef.current.value = "";
                });
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading || busy} onClick={() => fileRef.current?.click()} aria-label="attach file">
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      <input
        ref={inputRef}
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground",
          "focus:border-primary focus:ring-1 focus:ring-primary/40",
          busy && "opacity-60",
        )}
        value={value}
        placeholder={
          busy ? "streaming — finish this turn first" : "message the agent  (Esc clears · Alt+↑/↓ switches session)"
        }
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      {busy && onStop ? (
        <Button type="button" variant="outline" onClick={onStop} aria-label="stop">
          <Square className="h-3.5 w-3.5" /> Stop
        </Button>
      ) : (
        <Button type="submit" disabled={busy || value.trim() === ""} aria-label="send">
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </form>
  );
}
