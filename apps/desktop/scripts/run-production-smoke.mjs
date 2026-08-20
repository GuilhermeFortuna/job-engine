#!/usr/bin/env node
/**
 * CROSS-012 production smoke: compile both graphs, refuse a stale
 * dist/main/index.js, then run the production vitest project.
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionEntry = path.join(packageRoot, "dist", "main", "index.js");
const indexSource = path.join(packageRoot, "src", "main", "index.ts");
const coordinatorSource = path.join(
  packageRoot,
  "src",
  "main",
  "runtime",
  "coordinator.ts",
);

if (!existsSync(productionEntry)) {
  console.error("dist/main/index.js is missing; tsc must run first");
  process.exit(1);
}

const artifactMtime = statSync(productionEntry).mtimeMs;
for (const source of [indexSource, coordinatorSource]) {
  if (!existsSync(source)) {
    console.error(`Missing source ${source}`);
    process.exit(1);
  }
  if (statSync(source).mtimeMs > artifactMtime + 50) {
    console.error(
      `${productionEntry} is older than ${source}. Refusing to smoke a stale binary.`,
    );
    process.exit(1);
  }
}

const vitestBin = path.join(packageRoot, "node_modules", ".bin", "vitest");
if (!existsSync(vitestBin)) {
  console.error("vitest binary not found; run pnpm install first");
  process.exit(1);
}

const child = spawn(vitestBin, ["run", "--project", "production"], {
  stdio: "inherit",
  cwd: packageRoot,
});
child.on("close", (code) => process.exit(code ?? 1));
