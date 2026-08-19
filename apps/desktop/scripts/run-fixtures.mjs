#!/usr/bin/env node
/**
 * Runs the Electron fixture suite, forwarding an optional file filter.
 *
 * `pnpm run test:fixtures -- generic` hands vitest a bare `--` before the
 * filter, and vitest 4 ignores every positional argument after it. Stripping
 * the separator here keeps the documented command working.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const vitestBin = path.join(packageRoot, "node_modules", ".bin", "vitest");
if (!existsSync(vitestBin)) {
  console.error("vitest binary not found; run pnpm install first");
  process.exit(1);
}

const filters = process.argv.slice(2).filter((arg) => arg !== "--");
const child = spawn(vitestBin, ["run", "--project", "fixtures", ...filters], {
  stdio: "inherit",
  cwd: packageRoot,
});
child.on("close", (code) => process.exit(code ?? 1));
