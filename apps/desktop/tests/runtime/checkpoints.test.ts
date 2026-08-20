import { describe, expect, it } from "vitest";

import {
  isAuthorizedForFullAutoSubmit,
  isCheckpoint,
  isReleasedForSubmit,
  resumePhaseFor,
  shouldRecord,
  submitAlreadyAttempted,
} from "../../src/main/runtime/checkpoints";

const run = (overrides: Partial<Parameters<typeof resumePhaseFor>[0]> = {}) => ({
  status: "running",
  currentCheckpoint: null,
  submitAttemptedAt: null,
  automationMode: "semi_auto_pause_before_submit",
  automaticSubmissionAuthorized: false,
  ...overrides,
});

describe("checkpoint ordering", () => {
  it("records forward progress", () => {
    expect(shouldRecord(null, "form_discovered")).toBe(true);
    expect(shouldRecord("form_discovered", "resume_attached")).toBe(true);
  });

  it("never records a regression or a repeat", () => {
    expect(shouldRecord("resume_attached", "form_discovered")).toBe(false);
    expect(shouldRecord("submit_armed", "submit_armed")).toBe(false);
  });

  it("rejects values outside the backend enum", () => {
    expect(isCheckpoint("submit_armed")).toBe(true);
    expect(isCheckpoint("almost_done")).toBe(false);
    expect(isCheckpoint(null)).toBe(false);
  });
});

describe("submit attempt detection", () => {
  it("treats a recorded attempt timestamp as attempted", () => {
    expect(
      submitAlreadyAttempted(run({ submitAttemptedAt: "2026-08-18T00:00:00Z" })),
    ).toBe(true);
  });

  it("treats the submitting checkpoint as attempted even without a timestamp", () => {
    expect(submitAlreadyAttempted(run({ currentCheckpoint: "submitting" }))).toBe(
      true,
    );
  });

  it("treats a fresh run as not attempted", () => {
    expect(submitAlreadyAttempted(run())).toBe(false);
    expect(
      submitAlreadyAttempted(run({ currentCheckpoint: "submit_armed" })),
    ).toBe(false);
  });
});

describe("release detection", () => {
  it("requires the armed checkpoint and a claimable status together", () => {
    expect(
      isReleasedForSubmit(
        run({ status: "queued", currentCheckpoint: "submit_armed" }),
      ),
    ).toBe(true);
    expect(
      isReleasedForSubmit(
        run({ status: "claimed", currentCheckpoint: "submit_armed" }),
      ),
    ).toBe(true);
  });

  it("rejects an armed run that is still waiting for the owner", () => {
    expect(
      isReleasedForSubmit(
        run({ status: "needs_input", currentCheckpoint: "submit_armed" }),
      ),
    ).toBe(false);
  });

  it("rejects a queued run that is not armed", () => {
    expect(
      isReleasedForSubmit(
        run({ status: "queued", currentCheckpoint: "questions_answered" }),
      ),
    ).toBe(false);
  });

  it("never treats a full_auto run as released", () => {
    expect(
      isReleasedForSubmit(
        run({
          status: "queued",
          currentCheckpoint: "submit_armed",
          automationMode: "full_auto",
        }),
      ),
    ).toBe(false);
  });
});

describe("restart recovery", () => {
  it("reconciles instead of resubmitting after an attempt", () => {
    expect(
      resumePhaseFor(
        run({
          status: "queued",
          currentCheckpoint: "submit_armed",
          submitAttemptedAt: "2026-08-18T00:00:00Z",
        }),
      ),
    ).toBe("reconcile_submit");
  });

  it("submits a released run after reclaim changes status to claimed", () => {
    expect(
      resumePhaseFor(run({ status: "claimed", currentCheckpoint: "submit_armed" })),
    ).toBe("submit");
  });

  it("resumes filling otherwise", () => {
    expect(resumePhaseFor(run({ currentCheckpoint: "profile_filled" }))).toBe(
      "fill",
    );
  });

  it("submits authorized full-auto at submit_armed without a release", () => {
    expect(
      resumePhaseFor(
        run({
          status: "running",
          currentCheckpoint: "submit_armed",
          automationMode: "full_auto",
          automaticSubmissionAuthorized: true,
        }),
      ),
    ).toBe("submit");
    expect(
      isAuthorizedForFullAutoSubmit(
        run({
          status: "running",
          currentCheckpoint: "submit_armed",
          automationMode: "full_auto",
          automaticSubmissionAuthorized: true,
        }),
      ),
    ).toBe(true);
  });

  it("does not submit unauthorized full-auto", () => {
    expect(
      resumePhaseFor(
        run({
          status: "running",
          currentCheckpoint: "submit_armed",
          automationMode: "full_auto",
          automaticSubmissionAuthorized: false,
        }),
      ),
    ).toBe("fill");
  });
});
