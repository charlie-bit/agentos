import { useEffect, useState } from "react";
import { BookOpenText, Bot, CircleAlert, CircleCheck, CirclePlay, FolderKanban, ListTodo, Workflow } from "lucide-react";
import {
  getProjectInstances,
  getSessions,
  getTodos,
  getWorkflowRuns,
  getWorkflows,
  type ProjectInstance,
  type SessionRow,
  type Todo,
  type WorkflowRun,
  type WorkflowSummary,
} from "../lib/api";
import { isTodayFocus } from "./TodoPanel";
import { ScrollArea } from "./ui/scroll-area";

const SCENARIOS = [
  { key: "summarise", label: "Summarise my todos", hint: "today's focus first", Icon: ListTodo, zone: "chats" as const },
  { key: "role", label: "Talk to a role", hint: "pick a mounted agent", Icon: Bot, zone: "chats" as const },
  { key: "workflow", label: "Run a workflow", hint: "manual or scheduled", Icon: Workflow, zone: "workflows" as const },
  { key: "project", label: "Open a project", hint: "templates + instances", Icon: FolderKanban, zone: "projects" as const },
];

/** Home (#424): scenario cards (#423) + today's todos + recents. */
export function HomePanel({
  onZone,
  onPickSession,
  onOpenAgents,
  onOpenTodos,
  onAsk,
}: {
  onZone: (zone: "chats" | "workflows" | "projects") => void;
  onPickSession: (browserId: string) => void;
  /** Role card (#344): chooses a role from the mounted catalogue. */
  onOpenAgents?: () => void;
  /** The full todo board is a drawer; Home shows the daily summary. */
  onOpenTodos?: () => void;
  /** Scenario prompt templates (#314): one click sends a prepared request. */
  onAsk?: (prompt: string) => void;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [projects, setProjects] = useState<ProjectInstance[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [lastRuns, setLastRuns] = useState<Record<string, WorkflowRun | null>>({});
  useEffect(() => {
    void getTodos().then((b) => setTodos(b.todos)).catch(() => undefined);
    void getSessions().then((b) => setSessions(b.sessions.slice(0, 5))).catch(() => undefined);
    void getProjectInstances().then((b) => setProjects(b.instances.slice(0, 5))).catch(() => undefined);
    void getWorkflows()
      .then(async (b) => {
        const list = b.workflows.slice(0, 4);
        setWorkflows(list);
        const entries = await Promise.all(
          list.map(async (w) => {
            const r = await getWorkflowRuns(w.name).catch(() => ({ runs: [] as WorkflowRun[] }));
            return [w.name, r.runs[0] ?? null] as const;
          }),
        );
        setLastRuns(Object.fromEntries(entries));
      })
      .catch(() => undefined);
  }, []);
  const focus = todos.filter((t) => isTodayFocus(t)).slice(0, 5);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 text-sm md:px-6">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {SCENARIOS.map(({ key, label, hint, Icon, zone }) => (
            <button
              key={key}
              onClick={() => {
                if (key === "summarise" && onAsk) {
                  onAsk("Review my open todos, remove anything stale, and propose today's focus. Add any missing follow-ups with todo_add.");
                  return;
                }
                if (key === "role" && onOpenAgents) {
                  onOpenAgents();
                  return;
                }
                onZone(zone);
              }}
              className="rounded-lg border border-border p-3 text-left hover:border-primary"
            >
              <Icon className="mb-1 h-4 w-4 text-primary" />
              <div className="font-medium">{label}</div>
              <div className="text-[11px] text-muted-foreground">{hint}</div>
            </button>
          ))}
        </div>

        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ListTodo className="h-3 w-3" /> today's focus
            {onOpenTodos && (
              <button onClick={onOpenTodos} className="ml-auto normal-case tracking-normal text-primary hover:underline">
                open board
              </button>
            )}
          </div>
          {focus.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              nothing due today — add one from the board, or let the model record it with todo_add.
            </div>
          ) : (
            <ul className="space-y-1">
              {focus.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                  {t.priority && <span className={t.priority === "P0" ? "text-err" : t.priority === "P1" ? "text-warn" : ""}>{t.priority}</span>}
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-[10px] text-muted-foreground">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Workflow className="h-3 w-3" /> workflow runs
            <button onClick={() => onZone("workflows")} className="ml-auto normal-case tracking-normal text-primary hover:underline">
              open
            </button>
          </div>
          {workflows.length === 0 ? (
            <div className="text-xs text-muted-foreground">no workflows mounted</div>
          ) : (
            <ul className="space-y-1">
              {workflows.map((w) => {
                const last = lastRuns[w.name] ?? null;
                const Icon = !last ? CirclePlay : last.status === "done" ? CircleCheck : last.status === "error" ? CircleAlert : CirclePlay;
                return (
                  <li key={w.name} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                    <Icon
                      className={
                        "h-3 w-3 shrink-0 " +
                        (!last ? "text-muted-foreground" : last.status === "done" ? "text-ok" : last.status === "error" ? "text-err" : "text-run")
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">{w.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {last ? `${last.status} · ${new Date(last.startedAtMs).toLocaleString()}` : "never run"}
                    </span>
                    {typeof w.missed === "number" && w.missed > 0 && (
                      <span className="rounded bg-warn/20 px-1 text-[10px] text-warn">missed {w.missed}</span>
                    )}
                    {w.nextRun && <span className="text-[10px] text-muted-foreground">next {new Date(w.nextRun).toLocaleString()}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <section>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">recent sessions</div>
            {sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground">no sessions yet</div>
            ) : (
              <ul className="space-y-0.5">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-card"
                      onClick={() => {
                        onPickSession(s.external_key.replace(/^web-/, ""));
                        onZone("chats");
                      }}
                    >
                      <BookOpenText className="h-3 w-3 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono">{s.title?.trim() || s.external_key}</span>
                      <span className="text-[10px] text-muted-foreground">{s.agent ?? s.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">projects</div>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                no projects yet — create one from a template in the projects panel (`agentos projects scaffold` writes a template).
              </div>
            ) : (
              <ul className="space-y-0.5">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-card" onClick={() => onZone("projects")}>
                      <FolderKanban className="h-3 w-3 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className="text-[10px] text-muted-foreground">{p.template}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </ScrollArea>
  );
}
