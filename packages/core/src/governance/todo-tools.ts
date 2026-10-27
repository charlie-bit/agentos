/**
 * The todo tool family (spec #309, ruling B): four neutral tools that let the
 * MODEL capture and maintain todos in conversation. The kernel owns no todo
 * domain model — these handlers are thin wrappers over ledger verbs, and the
 * vocabulary comes from contracts (#308). Results carry a `todo.changed`
 * envelope so the model and the console can both see what moved.
 */
import { randomUUID } from "node:crypto";
import type { NeutralTool, TodoItem, TodoPriority, TodoSource, TodoStatus } from "@agentos/contracts";
import { TODO_PRIORITIES, TODO_SOURCES, TODO_STATUSES } from "@agentos/contracts";
import type { Ledger } from "../session/ledger.js";

export interface TodoToolContext {
  ledger: Pick<Ledger, "todoWrite" | "todoList" | "todoDelete">;
  /** Injectable clock/id for deterministic tests. */
  now?: () => number;
  newId?: () => string;
}

const str = { type: "string" } as const;
const num = { type: "number" } as const;

function asStatus(v: unknown): TodoStatus | undefined {
  return TODO_STATUSES.includes(v as TodoStatus) ? (v as TodoStatus) : undefined;
}
function asPriority(v: unknown): TodoPriority | undefined {
  return TODO_PRIORITIES.includes(v as TodoPriority) ? (v as TodoPriority) : undefined;
}
function asSource(v: unknown): TodoSource {
  return TODO_SOURCES.includes(v as TodoSource) ? (v as TodoSource) : "chat";
}

export function buildTodoTools(ctx: TodoToolContext): NeutralTool[] {
  const now = ctx.now ?? Date.now;
  const newId = ctx.newId ?? randomUUID;
  const find = (id: string): TodoItem | undefined => ctx.ledger.todoList().find((t) => t.id === id);

  return [
    {
      name: "todo_list",
      description: "List todos (optionally filtered by status, project or due-before epoch ms).",
      inputSchema: { type: "object", properties: { status: str, project: str, dueBefore: num } },
      handler: async (input) => ({
        todos: ctx.ledger.todoList({
          ...(asStatus(input.status) ? { status: asStatus(input.status) as TodoStatus } : {}),
          ...(typeof input.project === "string" ? { project: input.project } : {}),
          ...(typeof input.dueBefore === "number" ? { dueBefore: input.dueBefore } : {}),
        }),
      }),
    },
    {
      name: "todo_add",
      description:
        "Record an actionable item found in the conversation or a tool result. Use this instead of remembering it only in prose.",
      inputSchema: {
        type: "object",
        properties: { title: str, project: str, priority: str, dueAt: num, sourceKind: str, sourceRef: str },
        required: ["title"],
      },
      handler: async (input) => {
        const ts = now();
        const item: TodoItem = {
          id: newId(),
          title: String(input.title ?? "").slice(0, 300),
          status: "todo",
          ...(typeof input.project === "string" ? { project: input.project } : {}),
          ...(asPriority(input.priority) ? { priority: asPriority(input.priority) as TodoPriority } : {}),
          ...(typeof input.dueAt === "number" ? { dueAt: input.dueAt } : {}),
          sourceKind: asSource(input.sourceKind),
          ...(typeof input.sourceRef === "string" ? { sourceRef: input.sourceRef.slice(0, 500) } : {}),
          createdAt: ts,
          updatedAt: ts,
        };
        ctx.ledger.todoWrite(item);
        return { event: "todo.changed", change: "added", todo: item };
      },
    },
    {
      name: "todo_update",
      description: "Update a todo's status, title, priority or due date. Unknown ids are reported, not invented.",
      inputSchema: { type: "object", properties: { id: str, title: str, status: str, priority: str, dueAt: num }, required: ["id"] },
      handler: async (input) => {
        const id = String(input.id ?? "");
        const existing = find(id);
        if (!existing) return { event: "todo.changed", change: "missing", id };
        const status = asStatus(input.status);
        const priority = asPriority(input.priority);
        const updated: TodoItem = {
          ...existing,
          ...(typeof input.title === "string" && input.title.length > 0 ? { title: input.title.slice(0, 300) } : {}),
          ...(status ? { status } : {}),
          ...(priority ? { priority } : {}),
          ...(typeof input.dueAt === "number" ? { dueAt: input.dueAt } : {}),
          updatedAt: now(),
        };
        ctx.ledger.todoWrite(updated);
        return { event: "todo.changed", change: "updated", todo: updated };
      },
    },
    {
      name: "todo_remove",
      description: "Delete a todo by id. Returns whether it existed.",
      inputSchema: { type: "object", properties: { id: str }, required: ["id"] },
      handler: async (input) => {
        const id = String(input.id ?? "");
        return { event: "todo.changed", change: ctx.ledger.todoDelete(id) ? "removed" : "missing", id };
      },
    },
  ];
}
