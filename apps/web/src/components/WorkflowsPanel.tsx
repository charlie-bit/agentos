import { useEffect, useState } from "react";
import { Bot, CalendarClock, CirclePlay, CircleStop, CircleCheck, CircleAlert, Play, Search, Webhook, Wrench } from "lucide-react";
import { getWorkflowRun, getWorkflowRuns, getWorkflows, runWorkflow, type WorkflowRun, type WorkflowStepOutcome, type WorkflowSummary } from "../lib/api";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const STEP_ICON = { agent: Bot, tool: Wrench, skill: Play, kb_search: Search, human: CirclePlay } as const;
const TRIGGER_ICON = { manual: Play, schedule: CalendarClock, webhook: Webhook } as const;
const STATUS_ICON = { done: CircleCheck, error: CircleAlert, running: CirclePlay, aborted: CircleStop, pending: CirclePlay } as const;

/** Workflows panel (#375) with a read-only vertical step flow (#376) — HTML/CSS only, no graph lib. */
export function WorkflowsPanel({ onClose }: { onClose: () => void }) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [detail, setDetail] = useState<{ id: string; steps: WorkflowStepOutcome[]; run: WorkflowRun } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setWorkflows((await getWorkflows()).workflows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "workflows unavailable");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const openFlow = async (w: WorkflowSummary) => {
    if (open === w.name) return setOpen(null);
    setOpen(w.name);
    setRuns((await getWorkflowRuns(w.name).catch(() => ({ runs: [] }))).runs);
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="workflows">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">workflows ({workflows.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && workflows.length === 0 && (
        <div className="px-1 text-muted-foreground">
          no workflows mounted — add config/workflows/*.yml or run `agentos workflows scaffold`
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {workflows.map((w) => {
            const Trigger = TRIGGER_ICON[w.trigger];
            return (
              <li key={w.name} className="rounded border border-border p-1.5">
                <button className="flex w-full items-center gap-1.5 text-left" onClick={() => void openFlow(w)}>
                  <Trigger className="h-3 w-3 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground">{w.name}</span>
                  <span className="text-[10px] text-muted-foreground">{w.stepCount} steps</span>
                  {typeof w.missed === "number" && w.missed > 0 && (
                    <span className="rounded bg-warn/20 px-1 text-[10px] text-warn" title="windows skipped while down">missed {w.missed}</span>
                  )}
                </button>
                {w.nextRun && <div className="text-[10px] text-muted-foreground">next: {new Date(w.nextRun).toLocaleString()}</div>}
                {open === w.name && (
                  <div className="mt-1 border-t border-border pt-1">
                    <ol className="relative ml-2 border-l border-border pl-3">
                      {(w.steps ?? []).map((type, i) => {
                        const Icon = STEP_ICON[(type as keyof typeof STEP_ICON)] ?? Wrench;
                        return (
                          <li key={i} className="relative py-0.5 text-[10px] text-muted-foreground">
                            <span className="absolute -left-[19px] flex h-3 w-3 items-center justify-center rounded-full border border-border bg-card">
                              <Icon className="h-2 w-2" />
                            </span>
                            {i + 1}. {type}
                          </li>
                        );
                      })}
                      {(w.steps ?? []).length === 0 && <li className="text-[10px] text-muted-foreground">step detail not disclosed</li>}
                    </ol>
                    {runs.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {runs.slice(0, 5).map((r) => {
                          const S = STATUS_ICON[r.status];
                          return (
                            <li key={r.id}>
                              <button
                                className="flex w-full items-center gap-1 text-[10px]"
                                onClick={() =>
                                  void getWorkflowRun(r.id)
                                    .then((d) => setDetail({ id: r.id, steps: d.steps, run: d.run }))
                                    .catch(() => setDetail(null))
                                }
                              >
                                <S className={cn("h-3 w-3", r.status === "error" ? "text-err" : r.status === "done" ? "text-ok" : "text-muted-foreground")} />
                                <span className="font-mono text-muted-foreground">{new Date(r.startedAtMs).toLocaleString()}</span>
                                <span className="text-muted-foreground">{r.status}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => void runWorkflow(w.name).then(refresh)}>
                      run now
                    </Button>
                    {detail && (
                      <div className="mt-1 rounded border border-border p-1">
                        <div className="mb-1 text-[10px] text-muted-foreground">instance {detail.id.slice(0, 8)} · {detail.run.status}</div>
                        <ol className="space-y-0.5">
                          {detail.steps.map((st) => (
                            <li key={st.index} className="flex items-center gap-1 text-[10px]">
                              <span className={cn("w-1.5 h-1.5 rounded-full", st.status === "ok" ? "bg-ok" : st.status === "error" ? "bg-err" : st.status === "denied" ? "bg-warn" : "bg-muted")} />
                              <span className="font-mono">{st.index + 1}. {st.type}</span>
                              <span className="text-muted-foreground">{st.status} · {st.durationMs}ms</span>
                              {st.error && <span className="truncate text-err" title={st.error}>{st.error.slice(0, 40)}</span>}
                            </li>
                          ))}
                        </ol>
                        {detail.run.resumeFrom !== null && detail.run.resumeFrom !== undefined && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1"
                            onClick={() => void runWorkflow(w.name, detail.run.resumeFrom as number).then(refresh)}
                          >
                            resume from step {(detail.run.resumeFrom as number) + 1}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </aside>
  );
}
