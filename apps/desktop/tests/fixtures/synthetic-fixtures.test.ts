import { describe, expect, it } from "vitest";

import { runElectronSuite } from "./electron-harness";

describe("Synthetic HTTPS Electron fixtures", () => {
  it("executes the embedded browser lifecycle in a real Electron shell", async () => {
    const outcome = await runElectronSuite({
      runner: "electron-test-runner",
      timeoutMs: 30_000,
    });

    if (outcome.exitCode !== 0) {
      console.error(outcome.stdout);
      console.error(outcome.stderr);
    }

    expect(outcome.result, "runner did not report a structured result").not.toBeNull();
    // Assert on the outcome, not on a hard-coded case count, so adding a case
    // here does not break the wrapper.
    expect(outcome.result!.cases.filter((c) => !c.passed)).toEqual([]);
    expect(outcome.result!.passed).toBeGreaterThan(0);
    expect(outcome.exitCode).toBe(0);
  }, 40_000);
});
