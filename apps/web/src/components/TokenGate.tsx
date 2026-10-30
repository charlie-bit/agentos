import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "./ui/button";

/**
 * The local access-token door (spec #287). Shown only when the server answered
 * 403: the token printed by `agentos serve --web` is pasted once and kept in
 * this browser. No accounts, no password reset — the boundary is the machine.
 */
export function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4">
      <form
        className="w-[min(420px,100%)] rounded-lg border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim().length > 0) onSubmit(value.trim());
        }}
      >
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> Local access token
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Paste the token printed by <code className="font-mono">agentos serve --web</code>. It is stored in this
          browser only; the console never phones home.
        </p>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="token"
            autoFocus
          />
          <Button type="submit" disabled={value.trim().length === 0}>
            Unlock
          </Button>
        </div>
      </form>
    </div>
  );
}
