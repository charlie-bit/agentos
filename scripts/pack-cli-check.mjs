#!/usr/bin/env node
/**
 * spec #145/#299 acceptance: the packed CLI is usable WITHOUT a checkout.
 * Packs cli/, extracts into a temp dir, and runs a data-only command from
 * there. The kernel SDK is the one runtime dependency (declared in the
 * tarball); `preset validate` must work even before it is installed, which is
 * why `serve` is a lazy chunk.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packDir = mkdtempSync(join(tmpdir(), "agentos-pack-"));
const xDir = mkdtempSync(join(tmpdir(), "agentos-unpack-"));
try {
  const out = execFileSync("npm", ["pack", "--pack-destination", packDir], { cwd: join(repoRoot, "cli"), encoding: "utf8" }).trim();
  const tarball = join(packDir, out.split("\n").pop());
  execFileSync("tar", ["-xzf", tarball, "-C", xDir]);
  const pkgDir = join(xDir, "package");
  const files = readdirSync(pkgDir);
  if (!files.includes("main.mjs") || !files.includes("dist")) {
    throw new Error(`tarball missing main.mjs/dist: ${files.join(", ")}`);
  }
  const preset = resolve(repoRoot, "config/presets/example.yml");
  const result = execFileSync("node", [join(pkgDir, "main.mjs"), "preset", "validate", preset], {
    cwd: xDir,
    encoding: "utf8",
  });
  if (!result.includes('preset "example" resolves')) throw new Error("validate did not report resolution");
  process.stdout.write("✓ pack check: tarball installs standalone; `agentos preset validate` works without a checkout\n");
} catch (err) {
  process.stdout.write(`✗ pack check failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(xDir, { recursive: true, force: true });
}
