import { useEffect, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { getWorkspaceFiles, readWorkspaceFile, type WorkspaceFile } from "../lib/api";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

const PREVIEW_MAX = 100_000;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Session workspace panel (spec #258), the user-side exit of large-result
 * offload (#206): list what the session wrote, preview text inline (#275),
 * download anything. Files only — this panel never leaves the workspace.
 */
export function FilePanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ path: string; content: string; size: number; truncated: boolean } | null>(null);

  const refresh = async () => {
    try {
      const body = await getWorkspaceFiles(sessionId);
      setFiles(body.files);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "workspace unavailable");
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const open = async (path: string) => {
    try {
      setSelected(await readWorkspaceFile(sessionId, path));
    } catch (err) {
      setError(err instanceof Error ? err.message : "file unreadable");
    }
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="workspace files">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">workspace</span>
        <div className="flex items-center gap-1">
          <button title="refresh" onClick={() => void refresh()} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button title="close" onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && files.length === 0 && <div className="px-1 text-muted-foreground">no files written yet</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-0.5">
          {files.map((f) => (
            <li key={f.path}>
              <button
                onClick={() => void open(f.path)}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-card"
                title={f.path}
              >
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{humanSize(f.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      {selected && (
        <div className="flex min-h-0 flex-1 flex-col gap-1 border-t border-border pt-1">
          <div className="flex items-center justify-between gap-1 px-1">
            <span className="truncate font-mono text-[11px]" title={selected.path}>
              {selected.path}
            </span>
            <a
              href={`/api/workspace/file?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(selected.path)}`}
              download={selected.path.split("/").pop()}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="download"
            >
              <Download className="h-3 w-3" />
            </a>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <pre className="whitespace-pre-wrap break-words bg-background p-2 font-mono text-[11px] text-muted-foreground">
              {selected.content.length > PREVIEW_MAX ? `${selected.content.slice(0, PREVIEW_MAX)}\n…(truncated preview)` : selected.content}
            </pre>
          </ScrollArea>
          {selected.truncated && <div className="px-1 text-[10px] text-warn">large file — preview truncated</div>}
          <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
            close preview
          </Button>
        </div>
      )}
    </aside>
  );
}
