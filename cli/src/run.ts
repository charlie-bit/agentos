/**
 * argv dispatch for the `agentos` bin. Arg parsing via node:util parseArgs
 * (no third-party deps, by design). validate/usage stay data-only runners;
 * serve --chat streams interactively and returns only its exit code.
 */
import { parseArgs } from "node:util";
import { runPresetValidate, type CliResult } from "./preset-validate.js";
import { runServe } from "./serve.js";
import { runKbGate } from "./kb-gate.js";

const USAGE = [
  "agentos — pluggable agent platform (P5)",
  "",
  "usage:",
  "  agentos preset validate <file-or-dir>       load + reference-check manifests",
  "  agentos serve --chat [--preset <path>] [--session <key>] [--continue] [--verbose]",
  "                                              interactive REPL (needs a model channel env)",
  "  agentos serve --web [--port 8787] [--preset <path>]",
  "                                              SSE server + web console on 127.0.0.1",
  "  both accept --model <alias|manifest-name> (request-level, beats preset slot)",
  "  agentos kb gate                             P7b trigger: escalations vs window",
];

export async function run(argv: readonly string[]): Promise<CliResult> {
  const [command, ...rest] = argv;
  switch (command) {
    case "preset": {
      const [sub, ...args] = rest;
      if (sub !== "validate") return { exitCode: 2, lines: ["✗ unknown preset subcommand", ...USAGE.slice(2)] };
      const target = args[0];
      if (!target || target.startsWith("-")) return { exitCode: 2, lines: ["✗ preset validate requires <file-or-dir>", ...USAGE.slice(2)] };
      return runPresetValidate(target);
    }
    case "kb": {
      const [sub] = rest;
      if (sub !== "gate") return { exitCode: 2, lines: ["✗ unknown kb subcommand (try: kb gate)", ...USAGE.slice(2)] };
      return runKbGate();
    }
    case "serve": {
      const { values } = parseArgs({
        args: rest,
        options: {
          chat: { type: "boolean" },
          web: { type: "boolean" },
          port: { type: "string" },
          preset: { type: "string", default: "config/presets/example.yml" },
          session: { type: "string" },
          model: { type: "string" },
          continue: { type: "boolean" },
          verbose: { type: "boolean" },
        },
        strict: true,
      });
      if (!values.chat && !values.web) {
        return { exitCode: 2, lines: ["✗ serve requires --chat or --web", ...USAGE.slice(2)] };
      }
      if (values.chat && values.web) {
        return { exitCode: 2, lines: ["✗ --chat and --web are mutually exclusive", ...USAGE.slice(2)] };
      }
      const exitCode = await runServe({
        preset: values.preset ?? "config/presets/example.yml",
        session: values.session,
        model: values.model,
        continue: values.continue,
        verbose: values.verbose,
        web: values.web,
        port: values.port === undefined ? undefined : Number(values.port),
      });
      return { exitCode, lines: [] }; // already streamed by the composition root
    }
    case undefined:
      return { exitCode: 2, lines: USAGE };
    default:
      return { exitCode: 2, lines: [`✗ unknown command ${JSON.stringify(command)}`, ...USAGE.slice(2)] };
  }
}
