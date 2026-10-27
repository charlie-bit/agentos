import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getNotifications, type Notification } from "../lib/api";

/** Bell + dropdown (spec #386; the shared centre lands with #427). 30s poll. */
export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const load = () =>
      void getNotifications()
        .then((b) => setItems(b.notifications))
        .catch(() => undefined);
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="notifications"
        className="relative rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <Bell className="h-3.5 w-3.5" />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-40 w-64 rounded border border-border bg-card p-1 text-xs shadow-lg">
          {items.length === 0 && <div className="px-1 py-1 text-muted-foreground">nothing pending</div>}
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {items.map((n, i) => (
              <li key={`${n.kind}-${n.ref ?? i}`} className="flex items-center gap-1 rounded px-1 py-0.5">
                <span className="text-[10px] uppercase text-muted-foreground">{n.kind.replace("workflow-", "wf-")}</span>
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
