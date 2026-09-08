/**
 * zod issue → humanized error. One line each: "dotted.path: what is wrong (fix)".
 * Shapes are pinned by the P1a-3 probes (contracts schema-paths.spec.ts):
 * - missing / wrong-typed / bad-literal → issue.path points at the leaf field;
 * - strict-object extra key → issue lands on the CONTAINER path (top-level
 *   objects: path []) with the offending names in issue.keys — one error per key;
 * - discriminated-union miss → invalid_union_discriminator names the
 *   discriminator field, which is exactly the field a human can fix.
 * This module never throws and never prints; every input issue becomes 1..n
 * errors with a non-empty path (empty zod paths are substituted with "$document").
 */
import type { z } from "zod";

export interface ManifestError {
  /** Dotted field path; "$document" when the whole file is unusable. Never empty. */
  path: string;
  /** One-line statement of what is wrong, written for a human reading config. */
  message: string;
  /** Optional actionable fix. */
  hint?: string;
}

type Issue = z.ZodIssue;

/** Extra keys of an unrecognized_keys issue: prefer issue.keys, fall back to the message. */
function extraKeysOf(issue: Issue): string[] {
  const keys = (issue as { keys?: string[] }).keys;
  if (Array.isArray(keys) && keys.length > 0) return keys;
  return [...issue.message.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

/** Literal-typed fields whose wrong value deserves a targeted hint. */
function hintFor(path: string, code: string): string | undefined {
  if (path === "schemaExchange")
    return "cross-kernel tool schemas are exchanged as JSON Schema only (see packages/contracts/src/tool.ts)";
  if (path === "version") return 'only manifest schema version "1" exists';
  if (code === "unrecognized_keys" || path.includes("auth"))
    return "credentials are referenced by ENV VAR NAME (auth.env), never by value";
  if (path === "kind") return "kind selects the schema variant: tool | model | knowledge | preset";
  if (path.endsWith("transport")) return "transport decides which fields are legal: sdk | stdio | http";
  return undefined;
}

export function formatIssues(issues: readonly Issue[]): ManifestError[] {
  const out: ManifestError[] = [];
  for (const issue of issues) {
    const dotted = issue.path.join(".");
    switch (issue.code) {
      case "unrecognized_keys": {
        for (const key of extraKeysOf(issue)) {
          out.push({
            path: dotted ? `${dotted}.${key}` : key,
            message: `key "${key}" is not part of this manifest shape — extra keys are rejected, not ignored`,
            hint: hintFor(dotted ? `${dotted}.${key}` : key, issue.code),
          });
        }
        break;
      }
      case "invalid_type": {
        const got = (issue as { input?: unknown }).input === undefined ? "missing" : String((issue as { received?: unknown }).received);
        out.push({
          path: dotted || "$document",
          message:
            got === "missing"
              ? `is required here (expected ${String((issue as { expected?: unknown }).expected)})`
              : `expected ${String((issue as { expected?: unknown }).expected)}, got ${got}`,
        });
        break;
      }
      case "invalid_value": {
        out.push({
          path: dotted || "$document",
          message: `must be ${JSON.stringify((issue as { values?: unknown[] }).values?.[0] ?? issue.message)}`,
          hint: hintFor(dotted, issue.code),
        });
        break;
      }
      case "invalid_union": {
        // zod v4 folds discriminated-union misses here; discriminatorPath names the
        // field a human can act on when present (e.g. "transport").
        const disc = (issue as { discriminatorPath?: unknown[] }).discriminatorPath;
        const discName = Array.isArray(disc) && disc.length > 0 ? disc.join(".") : "";
        out.push({
          path: dotted || discName || "$document",
          message: "no manifest shape matches this document",
          hint: discName ? `discriminator "${discName}" selected no variant — check its value against the allowed set` : undefined,
        });
        break;
      }
      default:
        out.push({ path: dotted || "$document", message: issue.message, hint: hintFor(dotted, issue.code) });
    }
  }
  return out;
}
