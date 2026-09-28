import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

/** Enter sends; streaming disables send but the queue hint keeps intent visible. */
export function Composer({
  busy,
  onSend,
  quote,
}: {
  busy: boolean;
  onSend: (text: string) => void;
  /** Bumping `nonce` appends `text` as a quote block — additive, never overwrites a draft in progress. */
  quote?: { text: string; nonce: number };
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (!v || busy) return;
    setValue("");
    onSend(v);
  };
  return (
    <form
      className="flex items-center gap-2 border-t border-border px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={inputRef}
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground",
          "focus:border-primary focus:ring-1 focus:ring-primary/40",
          busy && "opacity-60",
        )}
        value={value}
        placeholder={busy ? "streaming — finish this turn first" : "message the agent"}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <Button type="submit" disabled={busy || value.trim() === ""} aria-label="send">
        <ArrowUp className="h-4 w-4" />
      </Button>
    </form>
  );
}
