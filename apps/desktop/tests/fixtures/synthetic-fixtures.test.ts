import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Synthetic HTTPS Electron Fixtures Integration Suite", () => {
  it("executes full embedded browser lifecycle in real Electron shell", async () => {
    const electronBinary = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "node_modules",
      ".pnpm",
      "electron@43.2.0",
      "node_modules",
      "electron",
      "dist",
      "electron"
    );

    const runnerCandidate1 = path.resolve(
      __dirname,
      "..",
      "..",
      "dist",
      "tests",
      "fixtures",
      "electron-test-runner.js"
    );
    const runnerCandidate2 = path.resolve(
      __dirname,
      "..",
      "..",
      "dist",
      "src",
      "tests",
      "fixtures",
      "electron-test-runner.js"
    );

    const runnerScript = fs.existsSync(runnerCandidate1)
      ? runnerCandidate1
      : runnerCandidate2;

    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_ENABLE_LOGGING: "1",
    };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(
      electronBinary,
      [
        "--no-sandbox",
        runnerScript,
        "--ozone-platform=headless",
        "--disable-gpu",
        "--headless",
      ],
      {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
    });

    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on("close", (code) => {
        resolve(code ?? 1);
      });
    });

    console.log(stdout);

    if (exitCode !== 0) {
      console.error("Runner Exit Code:", exitCode);
      console.error("STDERR:", stderr);
    }

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Results: 8 passed, 0 failed.");
  }, 30000);
});
