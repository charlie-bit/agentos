/** spec #309 — the four todo tools, over a real ledger, with the changed envelope. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLedger, type Ledger } from "../../session/index.js";
import { buildTodoTools } from "../todo-tools.js";

const dirs: string[] = [];
let seq = 0;
function tools(): { led: Ledger; byName: Map<string, (i: Record<string, unknown>) => Promise<unknown>> } {
  const dir = mkdtempSync(join(tmpdir(), "agentos-todotools-"));
  dirs.push(dir);
  const led = openLedger(join(dir, "sessions.db"));
  const built = buildTodoTools({ ledger: led, now: () => 1000 + seq, newId: () => `id-${++seq}` });
  return { led, byName: new Map(built.map((t) => [t.name, t.handler])) };
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? "", { recursive: true, force: true });
});

describe("todo tool family (#309)", () => {
  it("adds with provenance, lists, updates and removes — every result carries todo.changed", async () => {
    const { led, byName } = tools();
    const added = (await byName.get("todo_add")!({ title: "Chase retry storm", sourceKind: "mcp", sourceRef: "triage-tracker" })) as {
      event: string;
      change: string;
      todo: { id: string; status: string; sourceKind: string };
    };
    expect(added).toMatchObject({ event: "todo.changed", change: "added", todo: { status: "todo", sourceKind: "mcp" } });

    const listed = (await byName.get("todo_list")!({})) as { todos: Array<{ id: string }> };
    expect(listed.todos).toHaveLength(1);

    const updated = (await byName.get("todo_update")!({ id: added.todo.id, status: "doing" })) as { change: string; todo: { status: string } };
    expect(updated.change).toBe("updated");
    expect(updated.todo.status).toBe("doing");

    const removed = (await byName.get("todo_remove")!({ id: added.todo.id })) as { change: string };
    expect(removed.change).toBe("removed");
    expect(led.todoList()).toEqual([]);
    led.close();
  });

  it("updating an unknown id reports 'missing' instead of inventing a todo", async () => {
    const { byName, led } = tools();
    expect(await byName.get("todo_update")!({ id: "ghost" })).toMatchObject({ change: "missing" });
    expect(await byName.get("todo_remove")!({ id: "ghost" })).toMatchObject({ change: "missing" });
    led.close();
  });
});
