import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { browserSessionId } from "@agentos/contracts/session-key";
import { cn, relTime } from "../lib/utils";
import type { SessionRow } from "../lib/api";
import { filterSessions } from "../lib/session-filter";
import { InlineEditableTitle } from "./InlineEditableTitle";

const dotColor: Record<string, string> = {
  idle: "bg-ok",
  running: "bg-run",
  error: "bg-err",
  aborted: "bg-warn",
};

function SessionItem({
  row,
  active,
  onPick,
  onRename,
  onDelete,
}: {
  row: SessionRow;
  active: boolean;
  onPick: (browserId: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const browserId = browserSessionId(row.external_key);
  const label = row.title?.trim() || browserId.slice(0, 8);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !editing && onPick(browserId)}
      onKeyDown={(e) => e.key === "Enter" && !editing && onPick(browserId)}
      title={editing ? undefined : `resume ${row.external_key}`}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card",
        active && "bg-card ring-1 ring-primary/40",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          dotColor[row.status] ?? "bg-muted",
          row.status === "running" && "animate-pulse",
        )}
      />
      {editing ? (
        <InlineEditableTitle
          value={row.title ?? ""}
          placeholder={browserId.slice(0, 8)}
          onSave={async (next) => {
            await onRename(row.id, next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate font-mono">{label}</span>
          <button
            type="button"
            title="rename"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="delete — immediate, no undo"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.id);
            }}
            className="shrink-0 text-muted-foreground opacity-0 hover:text-err group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
      {!editing && <span className="shrink-0 text-[10px] text-muted-foreground">{relTime(row.last_active_ms)}</span>}
    </div>
  );
}

/** GET /api/sessions — the ledger. Click = switch the client key; the server
 * resumes through that row's sdk_session_id pointer (contract-side truth). */
export function SessionSidebar({
  sessions,
  activeKey,
  onPick,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: SessionRow[];
  activeKey: string;
  onPick: (browserId: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterSessions(sessions, query), [sessions, query]);
  return (
    <aside className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">sessions (ledger)</span>
        <button
          onClick={onNew}
          title="new session"
          className="rounded-md p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter title / status…"
        aria-label="filter sessions"
        className="mx-1 mb-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      {sessions.length === 0 && (
        <div className="px-1 text-xs text-muted-foreground">send your first message to create one</div>
      )}
      {sessions.length > 0 && visible.length === 0 && (
        <div className="px-1 text-xs text-muted-foreground">no session matches "{query}"</div>
      )}
      {visible.map((row) => {
        const browserId = browserSessionId(row.external_key);
        return (
          <SessionItem
            key={row.id}
            row={row}
            active={browserId === activeKey}
            onPick={onPick}
            onRename={onRename}
            onDelete={onDelete}
          />
        );
      })}
    </aside>
  );
}
