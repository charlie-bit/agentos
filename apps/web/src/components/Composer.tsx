import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

/** Enter sends; streaming disables send but the queue hint keeps intent visible. */
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
      className="flex items-center gap-2 border-t border-border px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted",
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
