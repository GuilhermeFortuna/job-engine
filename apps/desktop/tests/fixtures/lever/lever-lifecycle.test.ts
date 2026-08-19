import { afterAll, describe, expect, it } from "vitest";

import {
  FIXTURE_RUNNER_SECRET,
  seedBackend,
  startApi,
  teardownBackend,
  type RunningApi,
  type SeededBackend,
} from "../backend-harness";
import { runElectronSuite } from "../electron-harness";
import { MockLeverFormServer } from "./lever-form-server";

let forms: MockLeverFormServer | null = null;
let api: RunningApi | null = null;
let seeded: SeededBackend | null = null;

afterAll(async () => {
  await api?.stop();
  await forms?.close();
  if (seeded) {
    teardownBackend(seeded);
  }
});

describe("Lever assisted apply against the real backend", () => {
  it("completes fill, upload, review, release, reclaim, and one confirmed submit", async () => {
    forms = new MockLeverFormServer();
    await forms.start();

    const applicationUrl = forms.urlFor("/lever/lifecycle");
    seeded = seedBackend(applicationUrl);
    api = await startApi(seeded);

    const outcome = await runElectronSuite({
      runner: "lever/lever-lifecycle-runner",
      timeoutMs: 180_000,
      env: {
        JOB_ENGINE_FIXTURE_API: api.baseUrl,
        JOB_ENGINE_FIXTURE_FORM_URL: applicationUrl,
        JOB_ENGINE_FIXTURE_RUN_ID: seeded.runId,
        JOB_ENGINE_FIXTURE_RUNNER_SECRET: FIXTURE_RUNNER_SECRET,
        JOB_ENGINE_FIXTURE_RESUME_SHA: seeded.resumeSha256,
      },
    });

    if (outcome.exitCode !== 0 || outcome.result === null) {
      console.error(outcome.stdout);
      console.error(outcome.stderr);
      console.error("--- API log ---");
      console.error(api.stderr);
    }

    expect(outcome.result, "runner reported no structured result").not.toBeNull();
    expect(
      outcome.result!.cases.filter((c) => !c.passed),
      "failing lifecycle cases",
    ).toEqual([]);
    expect(outcome.result!.passed).toBeGreaterThanOrEqual(10);
    expect(outcome.exitCode).toBe(0);
  }, 300_000);
});
