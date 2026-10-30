/** spec #308 + #443 groundwork — todo_item contract: zod and JSON Schema agree. */
import { describe, expect, it } from "vitest";
import { todoItemJsonSchema, todoItemSchema } from "../todo.js";

const full = {
  id: "t-1",
  project: "proj-1",
  title: "Chase the retry storm",
  status: "blocked" as const,
  priority: "P0" as const,
  dueAt: 1_800_000_000_000,
  sourceKind: "mcp" as const,
  sourceRef: "triage-tracker",
  createdAt: 1,
  updatedAt: 2,
};

describe("todo_item contract (#308)", () => {
  it("accepts a fully populated item, with the enum vocabulary pinned", () => {
    expect(todoItemSchema.safeParse(full).success).toBe(true);
    expect(todoItemSchema.safeParse({ ...full, status: "doing", priority: "P2" }).success).toBe(true);
    for (const status of ["todo", "doing", "blocked", "done"]) {
      expect(todoItemSchema.safeParse({ ...full, status }).success).toBe(true);
    }
    for (const sourceKind of ["chat", "mcp", "manual"]) {
      expect(todoItemSchema.safeParse({ ...full, sourceKind }).success).toBe(true);
    }
  });

  it("rejects unknown status/priority/source, extra keys, empty title", () => {
    expect(todoItemSchema.safeParse({ ...full, status: "later" }).success).toBe(false);
    expect(todoItemSchema.safeParse({ ...full, priority: "P9" }).success).toBe(false);
    expect(todoItemSchema.safeParse({ ...full, sourceKind: "email" }).success).toBe(false);
    expect(todoItemSchema.safeParse({ ...full, secret: "sk-x" }).success).toBe(false);
    expect(todoItemSchema.safeParse({ ...full, title: "" }).success).toBe(false);
  });

  it("the JSON Schema mirror has the same required set and enum vocabulary", () => {
    expect(new Set(todoItemJsonSchema.required)).toEqual(
      new Set(["id", "title", "status", "sourceKind", "createdAt", "updatedAt"]),
    );
    expect(todoItemJsonSchema.properties.status.enum).toEqual(["todo", "doing", "blocked", "done"]);
    expect(todoItemJsonSchema.properties.sourceKind.enum).toEqual(["chat", "mcp", "manual"]);
    // every property in the JSON Schema exists in the zod shape
    const zodKeys = new Set(Object.keys(todoItemSchema.shape));
    for (const key of Object.keys(todoItemJsonSchema.properties)) expect(zodKeys.has(key)).toBe(true);
  });
});
