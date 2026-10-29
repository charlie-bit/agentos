import { useEffect, useState } from "react";
import { Boxes, MoreHorizontal, Search, TriangleAlert } from "lucide-react";
import type { StatusResponse } from "../lib/api";
import { dialectBadge } from "../lib/dialect";
import { NotificationsBell } from "./NotificationsBell";
import { Badge } from "./ui/badge";
import { ConfigDialog } from "./ConfigDialog";

/**
 * GET /api/status, read as a quiet top bar: the state that changes decisions
 * (mounts, drift, scheduler) sits on the left as one line; the console's
 * secondary panels collapse into one overflow menu so the work area can open
 * with a title instead of a wall of links.
 */
export function StatusStrip({
  status,
  hideBrand,
  onSearch,
  onToggleFiles,
  onToggleDrafts,
  onToggleLogs,
  onToggleTools,
  onToggleEscalations,
  onToggleTimeline,
  onToggleTodos,
  onToggleAgents,
  onToggleUsage,
  onToggleWorkflows,
  onToggleProjects,
}: {
  status: StatusResponse | null;
  /** The shell's rail carries the wordmark; the bar then starts at the state. */
  hideBrand?: boolean;
  /** Opens the command palette (⌘K), which also lists roles and panels. */
  onSearch?: () => void;
  onToggleFiles?: () => void;
  onToggleDrafts?: () => void;
  onToggleLogs?: () => void;
  onToggleTools?: () => void;
  onToggleEscalations?: () => void;
  onToggleTimeline?: () => void;
  onToggleTodos?: () => void;
  onToggleAgents?: () => void;
  onToggleUsage?: () => void;
  onToggleWorkflows?: () => void;
  onToggleProjects?: () => void;
}) {
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!more) return;
    const close = () => setMore(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [more]);

  if (!status) {
    return (
      <header className="flex items-center gap-2 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
        loading status…
      </header>
    );
  }

  const driftCount = status.lastDrift ? status.lastDrift.missing.length + status.lastDrift.undeclared.length : 0;
  const healthOf = (key: string) => status.mcpHealth?.find((h) => h.key === key);
  const isDown = (m: { key: string; degraded?: boolean }) => m.degraded === true || healthOf(m.key)?.ok === false;
  const degraded = status.mounts.filter((m) => isDown(m)).length;
  const healthy = status.mounts.length - degraded;
  const dialect = dialectBadge(status.dialect);
  const menus: Array<{ label: string; hint: string; run?: () => void }> = [
    { label: "Files", hint: "session workspace", run: onToggleFiles },
    { label: "Drafts", hint: "pending knowledge writes", run: onToggleDrafts },
    { label: "Todos", hint: "todo data plane", run: onToggleTodos },
    { label: "Roles", hint: "mounted agent roles", run: onToggleAgents },
    { label: "Workflows", hint: "catalogue + runs", run: onToggleWorkflows },
    { label: "Projects", hint: "templates + instances", run: onToggleProjects },
    { label: "Tools", hint: "mounted provider registry", run: onToggleTools },
    { label: "Usage", hint: "cost by role", run: onToggleUsage },
    { label: "Timeline", hint: "current turn", run: onToggleTimeline },
    { label: "Escalations", hint: "human handoff history", run: onToggleEscalations },
    { label: "Logs", hint: "server log tail", run: onToggleLogs },
  ].filter((m) => m.run !== undefined);

  return (
    <header className="flex items-center gap-2.5 border-b border-border px-3 py-2 md:px-4">
      {!hideBrand && (
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Boxes className="h-4 w-4 text-primary" /> AgentOS
        </span>
      )}

      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span
          className={
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full " +
            (degraded > 0 ? "bg-warn" : status.mounts.length > 0 ? "bg-ok" : "bg-muted-foreground")
          }
        />
        <span className="truncate">
          {status.mounts.length === 0 ? "no tools" : `${healthy}/${status.mounts.length} mounts`}
          <span className="mx-1 opacity-40">·</span>
          {status.model.provider}
        </span>
      </span>

      {status.mounts.length > 0 && (
        <div className="hidden items-center gap-1 xl:flex">
          {status.mounts.map((m) => {
            const h = healthOf(m.key);
            const down = isDown(m);
            const unknown = !down && (h === undefined || h.ok === null);
            return (
              <Badge
                key={m.key}
                className={down ? "border-err/40 text-err" : unknown ? "text-muted-foreground" : "border-ok/40 text-ok"}
                title={h?.error ?? (unknown ? "not probed yet" : "")}
              >
                {down ? "✗" : unknown ? "?" : "✓"} {m.key}
                <span className="opacity-50">·{m.transport}</span>
              </Badge>
            );
          })}
        </div>
      )}

      {dialect && (
        <Badge className="hidden border-warn text-warn lg:inline-flex" title="compatibility endpoint: the served model is not the vendor it resembles">
          {dialect}
        </Badge>
      )}
      {driftCount > 0 && (
        <Badge className="border-warn text-warn" title={JSON.stringify(status.lastDrift)}>
          <TriangleAlert className="h-3 w-3" /> drift {driftCount}
        </Badge>
      )}
      {status.scheduler && !status.scheduler.alive && (
        <Badge className="border-err/40 text-err" title="workflow scheduler heartbeat (60s window)">
          scheduler dead
        </Badge>
      )}

      <span className="flex-1" />

      {onSearch && (
        <button
          onClick={onSearch}
          title="command palette (⌘K)"
          aria-label="search"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      )}

      {menus.length > 0 && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMore((v) => !v);
            }}
            title="panels"
            aria-label="more panels"
            aria-expanded={more}
            className={
              "rounded-md p-1.5 hover:bg-card " +
              (more ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {more && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
            >
              {menus.map((m) => (
                <button
                  key={m.label}
                  onClick={() => {
                    setMore(false);
                    m.run?.();
                  }}
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card"
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{m.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <NotificationsBell />
      <ConfigDialog status={status} />
    </header>
  );
}
