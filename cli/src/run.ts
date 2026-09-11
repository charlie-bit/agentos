/**
 * argv dispatch for the `agentos` bin. Arg parsing via node:util parseArgs
 * (no third-party deps, by design). validate/usage stay data-only runners;
 * serve --chat streams interactively and returns only its exit code.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runPresetValidate, type CliResult } from "./preset-validate.js";
import { runServe } from "./serve.js";
import { runKbGate } from "./kb-gate.js";
import { runKbLint } from "./kb-lint.js";
import { runKbStale } from "./kb-stale.js";

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
  "  agentos kb lint <dir> [--json] [--strict]  frontmatter conformance (exit 1 = errors)",
  "  agentos kb stale [<dir>]                    re-verification queue (most overdue first)",
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
      const [sub, ...args] = rest;
      if (sub === "gate") {
        // --include <file>: explicit merge of an archived escalation log
        // (D-0910-8). Backups are never auto-counted; naming one is the opt-in.
        const include: string[] = [];
        for (let i = 0; i < args.length; i += 1) {
          if (args[i] === "--include") {
            const v = args[i + 1];
            if (!v || v.startsWith("-")) return { exitCode: 2, lines: ["✗ --include requires a file path"] };
            include.push(v);
            i += 1;
          } else {
            return { exitCode: 2, lines: [`✗ unknown kb gate flag ${JSON.stringify(args[i])}`] };
          }
        }
        return runKbGate("config", join(".agentos", "escalations.log"), Date.now, include);
      }
      if (sub === "lint") return runKbLint(args);
      if (sub === "stale") return runKbStale(args);
      return { exitCode: 2, lines: ["✗ unknown kb subcommand (try: kb gate | kb lint | kb stale)", ...USAGE.slice(2)] };
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
