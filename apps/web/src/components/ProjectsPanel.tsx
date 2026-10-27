import { useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { runWorkflow } from "../lib/api";
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
export function ProjectsPanel({ onClose }: { onClose: () => void }) {
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
    <aside className="flex w-96 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="projects">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          projects ({instances.length}) · templates ({templates.length})
        </span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}

      {/* New project: pick a template (#402 wizard), name it, create (data plane). */}
      <div className="flex gap-1">
        <select
          value={draft.template}
          onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
          className="rounded border border-border bg-background px-1 py-1"
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
          placeholder="project title…"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
        />
        <Button size="sm" onClick={() => void create()} disabled={!draft.template || draft.title.trim().length === 0} aria-label="create project">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter instances…"
        className="rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
      />

      <ScrollArea className="min-h-0 flex-1">
        {templates.length === 0 && <div className="px-1 text-muted-foreground">no templates — run `agentos projects scaffold`</div>}
        {visible.length === 0 && templates.length > 0 && <div className="px-1 text-muted-foreground">no instances yet</div>}
        <ul className="space-y-1">
          {visible.map((i) => (
            <li key={i.id} className="rounded border border-border p-1.5">
              <div className="flex items-center gap-1">
                <FolderKanban className="h-3 w-3 text-muted-foreground" />
                <button className="min-w-0 flex-1 truncate text-left font-mono text-foreground" onClick={() => void openProject(i.id)}>
                  {i.title}
                </button>
                <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground">{i.template}</span>
                <button
                  title="delete instance (template is untouched)"
                  className="text-muted-foreground hover:text-err"
                  onClick={() => void deleteProjectInstance(i.id).then(refresh)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {open === i.id && dashboard && (
                <div className="mt-1 border-t border-border pt-1 text-[10px]">
                  <div className="text-muted-foreground">
                    todos {dashboard.todos.total} · todo {dashboard.todos.todo} · doing {dashboard.todos.doing} · blocked {dashboard.todos.blocked} · done {dashboard.todos.done}
                  </div>
                  <div className="mt-0.5 flex gap-1">
                    {(["sessions", "runs", "todos"] as const).map((t) => (
                      <button key={t} onClick={() => setTab(t)} className={cn("rounded px-1", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
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
                    <div className="mt-1 space-y-0.5 text-muted-foreground">
                      <div>fence: agents [{dashboard.template.agents.join(", ") || "—"}]</div>
                      <div className="flex flex-wrap items-center gap-1">
                        workflows:
                        {dashboard.template.workflows.length === 0 && <span>—</span>}
                        {dashboard.template.workflows.map((w) => (
                          <button
                            key={w}
                            className="rounded border border-border px-1 hover:bg-card"
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
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
