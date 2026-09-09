#!/usr/bin/env node
// The single sanctioned output point: turns runner results into stdout and
// sets the exit code. All judgment lives in src/ runners and @agentos/core.
import { run } from "./dist/run.js";

const { exitCode, lines } = await run(process.argv.slice(2));
for (const line of lines) process.stdout.write(`${line}\n`);
process.exitCode = exitCode;
