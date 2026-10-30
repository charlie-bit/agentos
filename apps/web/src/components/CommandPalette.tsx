import { useEffect, useMemo, useState } from "react";
import {
  getAgents,
  getProjectInstances,
  getSessions,
  getTodos,
  getWorkflows,
  type AgentInfo,
  type ProjectInstance,
  type SessionRow,
  type Todo,
  type WorkflowSummary,
} from "../lib/api";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { cn } from "../lib/utils";

interface Item {
  group: "sessions" | "roles" | "workflows" | "projects" | "todos";
  key: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * ⌘K palette (#426): pure client-side filter over the five catalogues. Opens
 * with the modifier, fetches on open (cheap metadata endpoints), Enter picks.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onPickSession,
  onPickRole,
  onOpenPanel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPickSession: (browserId: string) => void;
  onPickRole: (agent: string) => void;
  onOpenPanel: (panel: "workflows" | "projects" | "todos") => void;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ sessions: SessionRow[]; roles: AgentInfo[]; workflows: WorkflowSummary[]; projects: ProjectInstance[]; todos: Todo[] }>({
    sessions: [],
    roles: [],
    workflows: [],
    projects: [],
    todos: [],
  });

  useEffect(() => {
    if (!open) return;
    setQ("");
    void Promise.all([
      getSessions().catch(() => ({ sessions: [] })),
      getAgents().catch(() => ({ agents: [] })),
      getWorkflows().catch(() => ({ workflows: [] })),
      getProjectInstances().catch(() => ({ instances: [] })),
      getTodos().catch(() => ({ todos: [] })),
    ]).then(([s, a, w, p, t]) =>
      setData({ sessions: s.sessions, roles: a.agents, workflows: w.workflows, projects: p.instances, todos: t.todos }),
    );
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const strip = (k: string) => (k.startsWith("web-") ? k.slice(4) : k);
    return [
      ...data.sessions.map((s) => ({ group: "sessions" as const, key: s.id, label: s.title?.trim() || strip(s.external_key), hint: s.agent ?? undefined, run: () => onPickSession(strip(s.external_key)) })),
      ...data.roles.map((a) => ({ group: "roles" as const, key: a.name, label: a.name, hint: a.chain.join(" → "), run: () => onPickRole(a.name) })),
      ...data.workflows.map((w) => ({ group: "workflows" as const, key: w.name, label: w.name, hint: w.trigger, run: () => onOpenPanel("workflows") })),
      ...data.projects.map((p) => ({ group: "projects" as const, key: p.id, label: p.title, hint: p.template, run: () => onOpenPanel("projects") })),
      ...data.todos.map((t) => ({ group: "todos" as const, key: t.id, label: t.title, hint: t.status, run: () => onOpenPanel("todos") })),
    ];
  }, [data, onPickSession, onPickRole, onOpenPanel]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? items.filter((i) => i.label.toLowerCase().includes(needle) || (i.hint ?? "").toLowerCase().includes(needle)) : items;
    return filtered.slice(0, 40);
  }, [items, q]);

  const pick = (item: Item | undefined) => {
    if (!item) return;
    item.run();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,92vw)] p-2">
        <DialogTitle className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">quick open</DialogTitle>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pick(visible[0])}
          placeholder="search sessions / roles / workflows / projects / todos…"
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <ul className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
          {visible.length === 0 && <li className="px-1 py-1 text-xs text-muted-foreground">nothing matches</li>}
          {visible.map((i) => (
            <li key={`${i.group}-${i.key}`}>
              <button onClick={() => pick(i)} className={cn("flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-card")}>
                <span className="w-16 shrink-0 text-[10px] uppercase text-muted-foreground">{i.group}</span>
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {i.hint && <span className="shrink-0 text-[10px] text-muted-foreground">{i.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
