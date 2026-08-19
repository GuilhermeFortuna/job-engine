#!/usr/bin/env node
/**
 * Runs Playwright, forwarding an optional file filter.
 *
 * `pnpm --filter @job-engine/web run test:e2e -- jobs.spec.ts` hands
 * Playwright a bare `--` before the filter, and Playwright then ignores the
 * intended spec path and runs the whole suite. Stripping the separator keeps
 * the documented scoped command working.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const playwrightBin = path.join(packageRoot, "node_modules", ".bin", "playwright");
if (!existsSync(playwrightBin)) {
  console.error("playwright binary not found; run pnpm install first");
  process.exit(1);
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const child = spawn(playwrightBin, ["test", ...args], {
  stdio: "inherit",
  cwd: packageRoot,
});
child.on("close", (code) => process.exit(code ?? 1));
