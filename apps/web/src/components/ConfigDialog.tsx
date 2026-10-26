import { Info } from "lucide-react";
import type { StatusResponse } from "../lib/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

/** "mcp-remote-example" -> "remote example" — the manifest key is an internal
 * registry name; the dialog shows what a person would call the tool. */
function toolLabel(key: string): string {
  return key.replace(/^mcp-/, "").replace(/-/g, " ");
}

/**
 * Full-detail view of GET /api/status. StatusStrip keeps the always-on badge
 * row terse; this is where "what exactly is this session plugged into" gets
 * an honest answer.
 */
export function ConfigDialog({ status }: { status: StatusResponse | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          disabled={!status}
          title="inspect plugin sockets"
          className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-40"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      {status && (
        <DialogContent className="w-[min(560px,92vw)]">
          <DialogTitle className="text-sm">Plugin sockets — this session</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Env-var names only. Values never reach this dialog, the wire, or the model.
          </DialogDescription>

          <div className="mt-4 space-y-4 text-xs">
            <section>
              <div className="mb-1 font-semibold text-foreground">Preset</div>
              <div className="font-mono text-muted-foreground">{status.preset}</div>
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">Model</div>
              <div className="font-mono text-muted-foreground">
                {status.model.provider}
                {status.dialect ? ` · dialect ${status.dialect}` : ""}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {status.model.baseUrlEnv ? `url env: ${status.model.baseUrlEnv}` : "no url lease"} ·{" "}
                {status.model.credentialsEnv ? `key env: ${status.model.credentialsEnv}` : "no key lease"}
              </div>
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">Channel (entry)</div>
              <div className="font-mono text-muted-foreground">
                {status.entry ? `${status.entry.name} · confirm ${status.entry.confirm ? "capable" : "unavailable (kb read-only)"}` : "not disclosed"}
              </div>
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">Knowledge</div>
              {status.knowledge ? (
                <div className="space-y-0.5 font-mono text-muted-foreground">
                  <div>{status.knowledge.name}</div>
                  <div className="text-[11px]">{status.knowledge.manifestPath ?? "synthesized at runtime"}</div>
                  <div className="text-[11px]">mount type: {status.knowledge.mountType ?? "—"}</div>
                </div>
              ) : (
                <div className="text-muted-foreground">no knowledge socket mounted</div>
              )}
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">Tools</div>
              {status.mounts.length === 0 ? (
                <div className="text-muted-foreground">no tools mounted</div>
              ) : (
                <ul className="space-y-1 font-mono text-muted-foreground">
                  {status.mounts.map((m) => (
                    <li key={m.key}>
                      <div>{toolLabel(m.key)}</div>
                      <div className="text-[11px]">
                        {m.manifestPath ?? "synthesized at runtime"} · {m.transport}
                        {m.degraded ? " · ⚠ absent/degraded" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1 text-[11px] text-muted-foreground">
                Paths are repository-relative. Credentials appear only as env-var NAMES; values are never on the wire.
              </div>
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">System prompt</div>
              {status.systemPrompt ? (
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
                  {status.systemPrompt}
                </pre>
              ) : (
                <div className="text-muted-foreground">not surfaced by this deployment</div>
              )}
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">Registry drift</div>
              {!status.lastDrift || (status.lastDrift.missing.length === 0 && status.lastDrift.undeclared.length === 0) ? (
                <div className="text-ok">none observed this run</div>
              ) : (
                <div className="space-y-0.5 font-mono text-warn">
                  <div>missing: {status.lastDrift.missing.join(", ") || "—"}</div>
                  <div>undeclared: {status.lastDrift.undeclared.join(", ") || "—"}</div>
                </div>
              )}
            </section>

            <section>
              <div className="mb-1 font-semibold text-foreground">Confirmations awaiting the human gate</div>
              <div className="font-mono text-muted-foreground">{status.waitingConfirms}</div>
            </section>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

