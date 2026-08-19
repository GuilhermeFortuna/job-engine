import { describe, expect, it } from "vitest";

import { runElectronSuite } from "../electron-harness";

describe("Lever platform adapter in real Electron", () => {
  it("drives synthetic Lever HTTPS apply forms through the isolated world", async () => {
    const outcome = await runElectronSuite({
      runner: "lever/lever-runtime-runner",
      timeoutMs: 120_000,
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
    expect(outcome.result!.passed).toBeGreaterThanOrEqual(16);
    expect(outcome.exitCode).toBe(0);
  }, 150_000);
});
