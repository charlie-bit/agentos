#!/usr/bin/env node
/**
 * Bundle the CLI for npm distribution (spec #145/#299).
 *
 * tsc's output is still emitted (other workspace packages import individual
 * modules from cli/dist). This step then REPLACES cli/dist/run.js with an
 * esbuild bundle that inlines the workspace packages, keeping the kernel SDK
 * external (it is the CLI's one runtime dependency). `serve` is a dynamic
 * import, so the bundle code-splits: `preset validate`, `kb`, and `data`
 * work in an install that has no SDK, and only `serve` requires it.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rmSync } from "node:fs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliRoot = join(repoRoot, "cli");
// Stale chunks from earlier runs would otherwise ship in the tarball.
rmSync(join(cliRoot, "dist", "chunks"), { recursive: true, force: true });

await build({
  entryPoints: [join(cliRoot, "src", "run.ts")],
  outdir: join(cliRoot, "dist"),
  outbase: join(cliRoot, "src"),
  entryNames: "run",
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  external: ["@anthropic-ai/claude-agent-sdk"],
  // Bundled CJS deps (yaml, zod) call require("process") etc. Give the ESM
  // bundle a real require instead of esbuild's throwing shim.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
});

process.stdout.write("✓ bundled cli/dist/run.js (SDK external, serve code-split)\n");
