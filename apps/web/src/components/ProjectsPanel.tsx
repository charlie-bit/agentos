import { useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { runWorkflow, HttpError } from "../lib/api";
import {
  createProjectInstance,
  deleteProjectInstance,
  getProjectDashboard,
  getProjectInstances,
  getProjectTemplates,
  type ProjectDashboard,
  type ProjectInstance,
  type ProjectTemplate,
} from "../lib/api";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "../lib/utils";

/** Templates (config) beside instances (data) — the ruling-A split made visible (#400). */
export function ProjectsPanel({
  onStartRole,
}: {
  /** Pick a template-declared role: the next turn runs scoped to it (#403). */
  onStartRole?: (agent: string, project: string) => void;
}) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [instances, setInstances] = useState<ProjectInstance[]>([]);
  const [draft, setDraft] = useState<{ template: string; title: string }>({ template: "", title: "" });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [tab, setTab] = useState<"sessions" | "runs" | "todos">("sessions");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [t, i] = await Promise.all([getProjectTemplates(), getProjectInstances()]);
      setTemplates(t.templates);
      setInstances(i.instances);
      setDraft((d) => ({ ...d, template: d.template || t.templates[0]?.name || "" }));
      setError(null);
    } catch (err) {
      // 501 = this deployment wires no project catalogue (no templates under
      // config/projects); that is an empty state, not a failure to shout about.
      if (err instanceof HttpError && err.status === 501) {
        setTemplates([]);
        setInstances([]);
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : "projects unavailable");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? instances.filter((i) => i.title.toLowerCase().includes(q) || i.template.toLowerCase().includes(q)) : instances;
  }, [instances, query]);

  const create = async () => {
    if (!draft.template || draft.title.trim().length === 0) return;
    await createProjectInstance(draft.template, draft.title.trim()).catch(() => undefined);
    setDraft((d) => ({ ...d, title: "" }));
    void refresh();
  };

  const openProject = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    setDashboard(await getProjectDashboard(id).catch(() => null));
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 md:p-6" aria-label="projects">
      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={draft.template}
            onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            aria-label="project template"
          >
            {templates.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="Project title…"
            className="min-w-0 flex-1 basis-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <Button size="sm" onClick={() => void create()} disabled={!draft.template || draft.title.trim().length === 0}>
            <Plus className="h-3 w-3" /> New project
          </Button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary sm:w-48"
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {instances.length} instances · {templates.length} templates
          </span>
        </div>
      )}

      {error && <div className="text-sm text-err">{error}</div>}

      {templates.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No templates mounted. Run <code>agentos projects scaffold</code> and add the yml under <code>config/projects</code>.
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 && templates.length > 0 && (
          <div className="pb-2 text-sm text-muted-foreground">No instances yet — create one from a template above.</div>
        )}
        <ul className="grid grid-cols-1 gap-3 pb-2 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => {
            const expanded = open === i.id;
            return (
              <li key={i.id} className={cn("overflow-hidden rounded-lg border border-border bg-card/40", expanded && "md:col-span-2 xl:col-span-3")}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <button className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => void openProject(i.id)} aria-expanded={expanded}>
                    {i.title}
                  </button>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{i.template}</span>
                  <button
                    title="delete instance (template is untouched)"
                    className="text-muted-foreground hover:text-err"
                    onClick={() => void deleteProjectInstance(i.id).then(refresh)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {expanded && dashboard && (
                  <div className="border-t border-border px-3 py-2.5 text-xs">
                    <div className="text-[11px] text-muted-foreground">
                      todos {dashboard.todos.total} · todo {dashboard.todos.todo} · doing {dashboard.todos.doing} · blocked {dashboard.todos.blocked} · done {dashboard.todos.done}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {(["sessions", "runs", "todos"] as const).map((t) => (
                        <button key={t} onClick={() => setTab(t)} className={cn("rounded px-2 py-0.5 text-[11px]", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card")}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                      {tab === "sessions" && dashboard.sessions.map((s) => (
                        <li key={s.id} className="truncate font-mono">{s.externalKey} · {s.agent ?? "self"} · {s.status}</li>
                      ))}
                      {tab === "runs" && dashboard.runs.map((r) => (
                        <li key={r.id} className="truncate font-mono">{r.workflow} · {r.status}</li>
                      ))}
                      {tab === "todos" && <li>{dashboard.todos.total} todo(s) filed to this project</li>}
                      {tab === "sessions" && dashboard.sessions.length === 0 && <li>no sessions yet</li>}
                      {tab === "runs" && dashboard.runs.length === 0 && <li>no runs yet</li>}
                    </ul>
                    {dashboard.template && (
                      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-1">
                          <span>agents:</span>
                          {dashboard.template.agents.length === 0 && <span>—</span>}
                          {dashboard.template.agents.map((a) => (
                            <button
                              key={a}
                              className="rounded border border-border px-1.5 py-0.5 hover:bg-card"
                              title={`talk to ${a} in this project`}
                              onClick={() => onStartRole?.(a, i.id)}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span>workflows:</span>
                          {dashboard.template.workflows.length === 0 && <span>—</span>}
                          {dashboard.template.workflows.map((w) => (
                            <button
                              key={w}
                              className="rounded border border-border px-1.5 py-0.5 hover:bg-card"
                              title={`run ${w} in this project`}
                              onClick={() => void runWorkflow(w, undefined, i.id).then(refresh)}
                            >
                              run {w}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
