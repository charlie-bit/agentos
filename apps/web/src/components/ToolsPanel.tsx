import { useEffect, useState } from "react";
import { getTools, type ToolDescriptor } from "../lib/api";
import { ScrollArea } from "./ui/scroll-area";

/** Registry panel (spec #122): what is mounted, from which yml, retry split. */
export function ToolsPanel({ onClose }: { onClose: () => void }) {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getTools()
      .then((b) => setTools(b.tools))
      .catch((err) => setError(err instanceof Error ? err.message : "registry unavailable"));
  }, []);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="tool registry">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">tool registry ({tools.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {tools.map((t) => (
            <li key={t.key} className="rounded border border-border p-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-foreground">{t.key}</span>
                <span className={t.mounted ? "text-ok" : "text-warn"}>{t.mounted ? "mounted" : "absent"}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">{t.transport} · {t.manifestPath ?? "synthesized"}</div>
              <div className="text-[10px] text-muted-foreground">
                {t.idempotent
                  ? `retry: default ${t.idempotent.default ? "safe" : "unsafe"}${t.idempotent.overrides ? ` · overrides ${Object.keys(t.idempotent.overrides).length}` : ""}`
                  : "retry: undeclared (never retried)"}
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
