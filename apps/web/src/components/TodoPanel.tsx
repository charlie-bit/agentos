import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addTodo, deleteTodo, getTodos, patchTodo, type Todo } from "../lib/api";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "../lib/utils";

const COLUMNS: Array<{ key: Todo["status"]; label: string }> = [
  { key: "todo", label: "Todo" },
  { key: "doing", label: "Doing" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];
const NEXT: Record<Todo["status"], Todo["status"]> = { todo: "doing", doing: "done", done: "todo", blocked: "todo" };
const DAY = 86_400_000;

/** "Today" (#322): due within 24h and not done. */
export function isTodayFocus(t: Todo, now = Date.now()): boolean {
  if (t.status === "done") return false;
  return t.dueAt !== undefined && t.dueAt <= now + DAY;
}

/** Four-column board (#321) with a today focus toggle (#322), 5s polling. */
export function TodoPanel({ onClose }: { onClose: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setTodos((await getTodos()).todos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "todos unavailable");
    }
  };
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todos.filter((t) => {
      if (todayOnly && !isTodayFocus(t)) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || t.status.includes(q) || (t.sourceKind ?? "").includes(q) || (t.project ?? "").toLowerCase().includes(q);
    });
  }, [todos, query, todayOnly]);

  const create = async () => {
    if (draft.trim().length === 0) return;
    await addTodo(draft.trim()).catch(() => undefined);
    setDraft("");
    void refresh();
  };

  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 border-l border-border p-2 text-xs md:w-96" aria-label="todos">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">todos ({visible.length})</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTodayOnly((v) => !v)}
            className={cn("rounded border border-border px-1.5 py-0.5 text-[10px]", todayOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            title="due within 24h, not done"
          >
            today
          </button>
          <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
        </div>
      </div>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="add a todo…"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
        />
        <Button size="sm" onClick={() => void create()} disabled={draft.trim().length === 0} aria-label="add todo">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter title / status / source / project…"
        className="rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
      />
      {error && <div className="px-1 text-err">{error}</div>}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-2 gap-2">
          {COLUMNS.map((col) => (
            <section key={col.key} className="min-h-24 rounded border border-border p-1">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {col.label} ({visible.filter((t) => t.status === col.key).length})
              </div>
              <ul className="space-y-1">
                {visible
                  .filter((t) => t.status === col.key)
                  .map((t) => (
                    <li key={t.id} className="rounded bg-background px-1.5 py-1">
                      <button
                        className="block w-full text-left"
                        title={`click to move: ${t.status} → ${NEXT[t.status]}`}
                        onClick={() => void patchTodo(t.id, { status: NEXT[t.status] }).then(refresh).catch(() => undefined)}
                      >
                        <span className={cn(t.status === "done" && "line-through opacity-60")}>{t.title}</span>
                      </button>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        {t.priority && <span className={cn("rounded px-1", t.priority === "P0" ? "bg-err/20 text-err" : t.priority === "P1" ? "bg-warn/20 text-warn" : "")}>{t.priority}</span>}
                        <span>{t.sourceKind}</span>
                        {t.dueAt && <span>due {new Date(t.dueAt).toISOString().slice(5, 10)}</span>}
                        <span className="flex-1" />
                        <button
                          className="text-muted-foreground hover:text-err"
                          title="delete"
                          onClick={() => void deleteTodo(t.id).then(refresh).catch(() => undefined)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </ScrollArea>
      <div className="px-1 text-[10px] text-muted-foreground">
        Todos are local user data (#319–#320). The model can also add them via the todo_* tools; changes replay in the transcript (#311).
      </div>
    </aside>
  );
}
