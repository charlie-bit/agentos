#!/usr/bin/env node
/**
 * Scheduler/fence micro-benchmarks (spec #448): the budget table says the
 * window decision must stay under 10ms. Pure functions, no I/O.
 */
import { parseCron, windowVerdict } from "../packages/core/dist/index.js";

const N = 10_000;
const spec = parseCron("*/5 * * * *");
const now = Date.now();
let dueCount = 0;

const t0 = performance.now();
for (let i = 0; i < N; i += 1) {
  if (windowVerdict(spec, now - (i % 60) * 60_000, now).due) dueCount += 1;
}
const perVerdict = (performance.now() - t0) / N;

const t1 = performance.now();
for (let i = 0; i < N; i += 1) parseCron("*/15 9-17 * * 1-5");
const perParse = (performance.now() - t1) / N;

process.stdout.write(
  `windowVerdict: ${perVerdict.toFixed(4)} ms/call (${dueCount}/${N} due)\n` +
    `parseCron:    ${perParse.toFixed(4)} ms/call\n` +
    `budget:       < 10 ms per window decision -> ${perVerdict < 10 ? "PASS" : "FAIL"}\n`,
);
process.exit(perVerdict < 10 ? 0 : 1);
