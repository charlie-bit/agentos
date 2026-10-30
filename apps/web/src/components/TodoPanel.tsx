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
export function TodoPanel({
  onOpenSession,
  onClose,
}: {
  /** Jump to the session a todo came from (#315). */
  onOpenSession?: (sessionKey: string) => void;
  /** Present when the board is a drawer over the work area rather than a page. */
  onClose?: () => void;
}) {
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
    <div
      className={
        onClose
          ? "flex w-full shrink-0 flex-col gap-2 border-l border-border bg-card/20 p-3 text-xs md:w-[26rem]"
          : "flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 md:p-6"
      }
      aria-label="todos"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="Add a todo…"
          className="min-w-0 flex-1 basis-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <Button size="sm" onClick={() => void create()} disabled={draft.trim().length === 0}>
          <Plus className="h-3 w-3" /> Add
        </Button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary sm:w-56"
        />
        <button
          onClick={() => setTodayOnly((v) => !v)}
          className={cn(
            "rounded-md border border-border px-2.5 py-1.5 text-xs",
            todayOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card",
          )}
          title="due within 24h, not done"
        >
          Today
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">{visible.length} shown</span>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="close todos">
            ×
          </button>
        )}
      </div>

      {error && <div className="text-sm text-err">{error}</div>}

      <ScrollArea className="min-h-0 flex-1">
        <div className={cn("grid gap-3 pb-2", onClose ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4")}>
          {COLUMNS.map((col) => {
            const items = visible.filter((t) => t.status === col.key);
            return (
              <section key={col.key} className="flex min-h-24 flex-col rounded-lg border border-border bg-card/40 p-2 sm:min-h-40">
                <div className="mb-2 flex items-center justify-between px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>{col.label}</span>
                  <span>{items.length}</span>
                </div>
                {items.length === 0 && <div className="px-1 text-[11px] text-muted-foreground">—</div>}
                <ul className="space-y-1.5">
                  {items.map((t) => (
                    <li key={t.id} className="rounded-md border border-border bg-background px-2.5 py-2 text-sm">
                      <button
                        className="block w-full text-left"
                        title={`click to move: ${t.status} → ${NEXT[t.status]}`}
                        onClick={() => void patchTodo(t.id, { status: NEXT[t.status] }).then(refresh).catch(() => undefined)}
                      >
                        <span className={cn(t.status === "done" && "line-through opacity-60")}>{t.title}</span>
                      </button>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {t.priority && <span className={cn("rounded px-1", t.priority === "P0" ? "bg-err/20 text-err" : t.priority === "P1" ? "bg-warn/20 text-warn" : "")}>{t.priority}</span>}
                        <span>{t.sourceKind}</span>
                        {t.sourceRef && /^(web-|wf-)/.test(t.sourceRef) && onOpenSession && (
                          <button
                            className="text-primary underline decoration-dotted"
                            title="open the session this todo came from"
                            onClick={() => onOpenSession(t.sourceRef as string)}
                          >
                            source
                          </button>
                        )}
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
            );
          })}
        </div>
      </ScrollArea>

      <p className="text-[11px] text-muted-foreground">
        Todos are local user data. The model can also add them with the <code>todo_*</code> tools; changes replay in the transcript.
      </p>
    </div>
  );
}
