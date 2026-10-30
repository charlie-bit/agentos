/**
 * Todo item contract (spec #308, v4 ruling B): a neutral, boundary-safe shape.
 * The kernel owns NO todo domain model — this type exists so the `todo_*`
 * tool family, the ledger and the web panel speak one vocabulary. Cross-
 * boundary exchange is JSON Schema (the literal below); the zod schema is the
 * in-process mirror (v4 lock stays in this package, as everywhere).
 */
import { z } from "zod";

export const TODO_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_PRIORITIES = ["P0", "P1", "P2"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

/** chat = captured in conversation; mcp = derived from a tool result; manual = web-created. */
export const TODO_SOURCES = ["chat", "mcp", "manual"] as const;
export type TodoSource = (typeof TODO_SOURCES)[number];

export const todoItemSchema = z.strictObject({
  id: z.string().min(1),
  /** Project instance id (data-plane); absent = unfiled. */
  project: z.string().min(1).optional(),
  title: z.string().min(1).max(300),
  status: z.enum(TODO_STATUSES),
  priority: z.enum(TODO_PRIORITIES).optional(),
  /** Unix epoch ms. */
  dueAt: z.number().int().nonnegative().optional(),
  sourceKind: z.enum(TODO_SOURCES),
  /** Provenance pointer: session id, tool name, or URL — opaque to the kernel. */
  sourceRef: z.string().max(500).optional(),
  /** Unix epoch ms. */
  createdAt: z.number().int().nonnegative(),
  /** Unix epoch ms. */
  updatedAt: z.number().int().nonnegative(),
});

export type TodoItem = z.infer<typeof todoItemSchema>;

/**
 * JSON Schema (2020-12 subset) for the cross-boundary shape. Kept literal and
 * in lockstep with the zod schema; the contracts test asserts both accept the
 * same samples.
 */
export const todoItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "status", "sourceKind", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", minLength: 1 },
    project: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1, maxLength: 300 },
    status: { type: "string", enum: [...TODO_STATUSES] },
    priority: { type: "string", enum: [...TODO_PRIORITIES] },
    dueAt: { type: "integer", minimum: 0 },
    sourceKind: { type: "string", enum: [...TODO_SOURCES] },
    sourceRef: { type: "string", maxLength: 500 },
    createdAt: { type: "integer", minimum: 0 },
    updatedAt: { type: "integer", minimum: 0 },
  },
} as const;
