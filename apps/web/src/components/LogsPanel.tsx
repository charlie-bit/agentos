import { useEffect, useState } from "react";
import { getLogs, type LogFile } from "../lib/api";
import { ScrollArea } from "./ui/scroll-area";

/** Operational log tail (spec #124/#292). Metadata only — server redacts. */
export function LogsPanel({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getLogs(100)
      .then((b) => setFiles(b.files))
      .catch((err) => setError(err instanceof Error ? err.message : "logs unavailable"));
  }, []);
  return (
    <aside className="flex w-96 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="server logs">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">server logs (metadata only)</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && files.length === 0 && <div className="px-1 text-muted-foreground">no log files yet</div>}
      <ScrollArea className="min-h-0 flex-1">
        {files.map((f) => (
          <section key={f.name} className="mb-2">
            <div className="px-1 font-mono text-[11px] text-foreground">{f.name}</div>
            <pre className="whitespace-pre-wrap break-words bg-background p-1 font-mono text-[10px] text-muted-foreground">
              {f.lines.join("\n")}
            </pre>
          </section>
        ))}
      </ScrollArea>
    </aside>
  );
}
