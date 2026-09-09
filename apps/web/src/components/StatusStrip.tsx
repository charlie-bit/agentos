import { Boxes, TriangleAlert } from "lucide-react";
import type { StatusResponse } from "../lib/api";
import { Badge } from "./ui/badge";

/** GET /api/status — the plugin sockets as built: mounts + degradation + drift. */
export function StatusStrip({ status }: { status: StatusResponse | null }) {
  if (!status) return <header className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted">loading status…</header>;
  const driftCount = status.lastDrift ? status.lastDrift.missing.length + status.lastDrift.undeclared.length : 0;
  return (
    <header className="flex items-center gap-2 border-b border-border px-4 py-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Boxes className="h-4 w-4 text-primary" /> AgentOS
      </span>
      <Badge>preset {status.preset}</Badge>
      <Badge>model {status.model.provider}</Badge>
      <span className="mx-1 h-4 w-px bg-border" />
      {status.mounts.length === 0 && <Badge>no tools</Badge>}
      {status.mounts.map((m) => (
        <Badge key={m.key} className={m.degraded ? "border-warn text-warn" : "border-ok/40"}>
          {m.degraded ? "✗" : "✓"} {m.key}
          <span className="opacity-60">·{m.transport}</span>
        </Badge>
      ))}
      <span className="flex-1" />
      {driftCount > 0 ? (
        <Badge className="border-warn text-warn" title={JSON.stringify(status.lastDrift)}>
          <TriangleAlert className="h-3 w-3" /> drift {driftCount}
        </Badge>
      ) : (
        <Badge className="border-ok/40 text-ok">drift 0</Badge>
      )}
    </header>
  );
}
