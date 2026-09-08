/**
 * argv dispatch for the `agentos` bin. Arg parsing via node:util parseArgs
 * (no third-party deps, by design). Returns data; main.mjs prints.
 */
import { runPresetValidate, type CliResult } from "./preset-validate.js";

const USAGE = [
  "agentos — pluggable agent platform (P1b)",
  "",
  "usage:",
  "  agentos preset validate <file-or-dir>   load + reference-check manifests",
  "  agentos serve                           placeholder (P2 delivers this)",
];

export function run(argv: readonly string[]): CliResult {
  const [command, sub, ...rest] = argv;
  switch (command) {
    case "preset": {
      if (sub !== "validate") {
        return { exitCode: 2, lines: ["✗ unknown preset subcommand", ...USAGE.slice(2)] };
      }
      const target = rest[0];
      if (!target || target.startsWith("-")) {
        return { exitCode: 2, lines: ["✗ preset validate requires <file-or-dir>", ...USAGE.slice(2)] };
      }
      return runPresetValidate(target);
    }
    case "serve":
      return { exitCode: 1, lines: ["P2 delivers this"] };
    case undefined:
      return { exitCode: 2, lines: USAGE };
    default:
      return { exitCode: 2, lines: [`✗ unknown command ${JSON.stringify(command)}`, ...USAGE.slice(2)] };
  }
}
