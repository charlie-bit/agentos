import { cn, relTime } from "../lib/utils";
import type { SessionRow } from "../lib/api";

const dotColor: Record<string, string> = {
  idle: "bg-ok",
  running: "bg-run",
  error: "bg-err",
  aborted: "bg-warn",
};

/** GET /api/sessions — the ledger. Click = switch the client key; the server
 * resumes through that row's sdk_session_id pointer (contract-side truth). */
export function SessionSidebar({
  sessions,
  activeKey,
  onPick,
}: {
  sessions: SessionRow[];
  activeKey: string;
  onPick: (browserId: string) => void;
}) {
  return (
    <aside className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2">
      <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted">sessions (ledger)</div>
      {sessions.length === 0 && <div className="px-1 text-xs text-muted">none yet</div>}
      {sessions.map((row) => {
        const browserId = row.external_key.startsWith("web-") ? row.external_key.slice(4) : row.external_key;
        return (
          <button
            key={row.id}
            onClick={() => onPick(browserId)}
            title={`resume ${row.external_key}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card",
              browserId === activeKey && "bg-card ring-1 ring-primary/40",
            )}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor[row.status] ?? "bg-muted")} />
            <span className="font-mono truncate">{browserId.slice(0, 8)}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted">{relTime(row.last_active_ms)}</span>
          </button>
        );
      })}
    </aside>
  );
}
