import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Shared plumbing for suites that run inside a real Electron process.
 *
 * Both the binary path and the pass/fail signal used to be hard-coded here --
 * a pinned `node_modules/.pnpm/electron@43.2.0/...` path and an exact
 * `"Results: 8 passed, 0 failed."` string, either of which breaks the moment a
 * test is added or Electron is bumped. The binary is now resolved through the
 * package, and runners report a structured result instead.
 */

export const RESULT_MARKER = "__ELECTRON_HARNESS_RESULT__";

export interface HarnessCase {
  name: string;
  passed: boolean;
  error?: string;
}

export interface HarnessResult {
  cases: HarnessCase[];
  passed: number;
  failed: number;
}

/** Absolute path to the Electron binary this workspace installed. */
export function resolveElectronBinary(): string {
  const require = createRequire(__filename);
  const binary = require("electron") as unknown as string;
  if (typeof binary !== "string" || !existsSync(binary)) {
    throw new Error("Could not resolve the Electron binary from the workspace");
  }
  return binary;
}

/** Compiled entry point for an Electron-side runner, by module basename. */
export function resolveCompiledRunner(basename: string): string {
  const roots = [
    path.resolve(__dirname, "..", "..", "dist", "tests", "fixtures"),
    path.resolve(__dirname, "..", "..", "dist", "src", "tests", "fixtures"),
  ];
  for (const root of roots) {
    const candidate = path.join(root, `${basename}.js`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Compiled runner ${basename}.js not found. Run the desktop build first.`,
  );
}

export interface RunElectronOptions {
  runner: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface RunElectronOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  result: HarnessResult | null;
}

/** Spawn an Electron-side runner and collect its structured result. */
export async function runElectronSuite(
  options: RunElectronOptions,
): Promise<RunElectronOutcome> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: "test",
    ELECTRON_ENABLE_LOGGING: "1",
    ...options.env,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    resolveElectronBinary(),
    [
      "--no-sandbox",
      resolveCompiledRunner(options.runner),
      "--ozone-platform=headless",
      "--disable-gpu",
      "--headless",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += String(data);
  });
  child.stderr.on("data", (data) => {
    stderr += String(data);
  });

  const timeout = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 60_000);
  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
  clearTimeout(timeout);

  return { exitCode, stdout, stderr, result: parseHarnessResult(stdout) };
}

export function parseHarnessResult(stdout: string): HarnessResult | null {
  const line = stdout
    .split("\n")
    .reverse()
    .find((l) => l.startsWith(RESULT_MARKER));
  if (!line) {
    return null;
  }
  try {
    return JSON.parse(line.slice(RESULT_MARKER.length)) as HarnessResult;
  } catch {
    return null;
  }
}

/** Emit the structured result. Called from inside the Electron process. */
export function reportHarnessResult(cases: HarnessCase[]): HarnessResult {
  const failed = cases.filter((c) => !c.passed);
  const result: HarnessResult = {
    cases,
    passed: cases.length - failed.length,
    failed: failed.length,
  };
  console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
  return result;
}
