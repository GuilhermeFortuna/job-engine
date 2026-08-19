import { describe, expect, it } from "vitest";

import { runElectronSuite } from "../electron-harness";

describe("Greenhouse platform adapter in real Electron", () => {
  it("drives synthetic Greenhouse HTTPS forms through the real isolated world", async () => {
    const outcome = await runElectronSuite({
      runner: "greenhouse/greenhouse-runtime-runner",
      timeoutMs: 90_000,
    });

    if (outcome.exitCode !== 0 || outcome.result === null) {
      console.error(outcome.stdout);
      console.error(outcome.stderr);
    }

    expect(outcome.result, "runner did not report a structured result").not.toBeNull();
    expect(
      outcome.result!.cases.filter((c) => !c.passed),
      "failing fixture cases",
    ).toEqual([]);
    expect(outcome.result!.passed).toBeGreaterThanOrEqual(14);
    expect(outcome.exitCode).toBe(0);
  }, 120_000);
});
