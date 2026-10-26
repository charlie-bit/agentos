#!/usr/bin/env node
/**
 * spec #240 — a single-language README change is incomplete.
 *
 * Text differs by design (the two files are different languages), so this
 * compares the STRUCTURE instead: the sequence of heading levels and the
 * number of fenced code blocks must match. A new section or snippet added in
 * one language trips the check until the other catches up.
 *
 * Exit 0 = in sync, 1 = drift (prints the first divergence), 2 = file missing.
 * Zero dependencies; runs in CI and locally (`node scripts/check-bilingual.mjs`).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAIR = [["README.md", "README_zh-CN.md"]];

function skeleton(path) {
  const text = readFileSync(path, "utf8");
  const headings = [...text.matchAll(/^(#{1,6})\s+\S/gm)].map((m) => m[1].length);
  const fences = (text.match(/^```/gm) ?? []).length;
  return { headings, fences };
}

let failed = false;
for (const [en, zh] of PAIR) {
  let a;
  let b;
  try {
    a = skeleton(join(repoRoot, en));
    b = skeleton(join(repoRoot, zh));
  } catch (err) {
    process.stdout.write(`✗ bilingual check: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
  if (a.fences !== b.fences) {
    failed = true;
    process.stdout.write(`✗ ${en} has ${a.fences} code fences, ${zh} has ${b.fences}\n`);
  }
  const n = Math.max(a.headings.length, b.headings.length);
  for (let i = 0; i < n; i += 1) {
    if (a.headings[i] !== b.headings[i]) {
      failed = true;
      process.stdout.write(
        `✗ heading #${i + 1} diverges: ${en} is h${a.headings[i] ?? "∅"}, ${zh} is h${b.headings[i] ?? "∅"}\n`,
      );
      break;
    }
  }
}

if (failed) {
  process.stdout.write("✗ bilingual check failed — edit README.md and README_zh-CN.md in the same commit (spec #98)\n");
  process.exit(1);
}
process.stdout.write("✓ bilingual READMEs structurally in sync\n");
