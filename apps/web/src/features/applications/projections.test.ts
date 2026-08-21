import { describe, expect, it } from "vitest";
import {
  CHECKING_CAPABILITY,
  applyRuntimeState,
  groupDurableStatus,
  inferViewAttached,
  resolveApplicationCapability,
  runtimeReasonText,
  safeRunStatusPresentation,
  selectDurableRunAction,
} from "./projections";
import {
  FULL_AUTO_MODE,
  SEMI_AUTO_MODE,
  type ApplicationRunSummary,
} from "./types";
import type {
  DesktopRuntimeState,
  RuntimePhase,
} from "./desktop-bridge";

function run(
  overrides: Partial<ApplicationRunSummary> = {},
): ApplicationRunSummary {
  return {
    id: "run-1",
    job_group_id: "job-1",
    canonical_application_url: "https://example.test/apply",
    application_url: "https://example.test/apply",
    platform_adapter_id: "generic",
    resume_asset_id: "resume-1",
    resume_sha256: "abc",
    automation_mode: FULL_AUTO_MODE,
    automatic_submission_authorized_at: "2026-08-20T00:00:00Z",
    automatic_submission_authorized: true,
    status: "queued",
    current_step: null,
    current_checkpoint: null,
    submit_attempted_at: null,
    terminal_reason: null,
    receipt_summary: null,
    policy_snapshot: null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function runtime(
  overrides: Partial<DesktopRuntimeState> = {},
): DesktopRuntimeState {
  return {
    runId: "run-1",
    phase: "filling",
    status: "running",
    checkpoint: "profile_filled",
    automationMode: FULL_AUTO_MODE,
    adapterId: "generic",
    reasonCode: null,
    blockingFieldCount: 0,
    ...overrides,
  };
}

describe("resolveApplicationCapability", () => {
  const readyInput = {
    productionRuntimeAvailable: true,
    applicationUrl: "https://example.test/apply",
    profileExists: true,
    registeredResumeExists: true,
    providerTier: "measured" as const,
  };

  it("represents acquisition checks inside the three-state capability contract", () => {
    expect(CHECKING_CAPABILITY).toEqual({
      state: "UNAVAILABLE",
      reasonCode: "CAPABILITY_CHECKING",
      reasonText: "Checking automation availability.",
    });
  });

  it.each([
    [
      { productionRuntimeAvailable: false },
      "RUNTIME_UNAVAILABLE",
    ],
    [{ applicationUrl: null }, "APPLICATION_URL_MISSING"],
    [
      { applicationUrl: "http://example.test/apply" },
      "APPLICATION_URL_NOT_HTTPS",
    ],
    [{ profileExists: false }, "PROFILE_REQUIRED"],
    [{ registeredResumeExists: false }, "RESUME_REQUIRED"],
  ])("returns unavailable for %o", (override, reasonCode) => {
    expect(
      resolveApplicationCapability({ ...readyInput, ...override }),
    ).toMatchObject({
      state: "UNAVAILABLE",
      reasonCode,
    });
  });

  it("returns auto apply when every owned input is ready", () => {
    expect(resolveApplicationCapability(readyInput)).toEqual({
      state: "AUTO_APPLY",
      reasonCode: "READY",
      reasonText: "Ready for automatic application.",
    });
  });

  it("supports the future unmeasured provider tier as assisted", () => {
    expect(
      resolveApplicationCapability({
        ...readyInput,
        providerTier: "unmeasured",
      }),
    ).toEqual({
      state: "ASSISTED",
      reasonCode: "PROVIDER_TIER_UNMEASURED",
      reasonText:
        "Provider automation is not yet measured; assisted application remains available.",
    });
  });
});

describe("durable run projections", () => {
  it.each([
    ["queued", "ACTIVE_QUEUED"],
    ["claimed", "ACTIVE_QUEUED"],
    ["running", "ACTIVE_QUEUED"],
    ["needs_input", "NEEDS_ATTENTION"],
    ["paused_auth", "NEEDS_ATTENTION"],
    ["failed_retryable", "NEEDS_ATTENTION"],
    ["failed_final", "TERMINAL"],
    ["submission_unknown", "TERMINAL"],
    ["submitted", "TERMINAL"],
    ["cancelled", "TERMINAL"],
  ] as const)("groups %s as %s", (status, group) => {
    expect(groupDurableStatus(status)).toBe(group);
  });

  it.each([
    [run({ status: "queued" }), "REOPEN"],
    [run({ status: "claimed" }), "REOPEN"],
    [run({ status: "running" }), "REOPEN"],
    [run({ status: "needs_input" }), "RESOLVE"],
    [
      run({
        status: "needs_input",
        automation_mode: SEMI_AUTO_MODE,
        current_checkpoint: "submit_armed",
      }),
      "RELEASE_SUBMIT",
    ],
    [
      run({
        status: "needs_input",
        automation_mode: FULL_AUTO_MODE,
        current_checkpoint: "submit_armed",
      }),
      "RESOLVE",
    ],
    [run({ status: "failed_retryable" }), "RESUME"],
  ])("selects the durable action independently of runtime", (item, action) => {
    expect(selectDurableRunAction(item, "STEP_RETRYABLE")).toMatchObject({
      action,
      reasonCode: "STEP_RETRYABLE",
    });
  });

  it.each([
    "submitted",
    "submission_unknown",
    "failed_final",
    "cancelled",
  ] as const)("gives terminal status %s no action", (status) => {
    expect(selectDurableRunAction(run({ status }), null).action).toBeNull();
  });

  it("blocks paused authentication", () => {
    expect(
      selectDurableRunAction(run({ status: "paused_auth" }), "AUTH_REQUIRED"),
    ).toEqual({
      action: "BLOCKED",
      reasonCode: "AUTH_REQUIRED",
      reasonText: "Authentication is required before this run can continue.",
    });
  });

  it.each([
    { submit_attempted_at: "2026-08-20T01:00:00Z" },
    { current_checkpoint: "submitting" },
  ])("suppresses activating actions after submission starts: %o", (override) => {
    expect(
      selectDurableRunAction(
        run({
          status: "queued",
          ...override,
        }),
        "RENDERER_CRASHED",
      ).action,
    ).toBeNull();
    expect(
      selectDurableRunAction(
        run({
          status: "needs_input",
          automation_mode: SEMI_AUTO_MODE,
          current_checkpoint: "submit_armed",
          ...override,
        }),
        null,
      ).action,
    ).toBeNull();
  });

  it.each(["STEP_EXHAUSTED", "ADAPTER_UNAVAILABLE"] as const)(
    "keeps failed_retryable resumable while warning for %s",
    (reasonCode) => {
      const selection = selectDurableRunAction(
        run({ status: "failed_retryable" }),
        reasonCode,
      );
      expect(selection.action).toBe("RESUME");
      expect(selection.reasonText).toMatch(/repeat/i);
    },
  );

  it("keeps a renderer-crashed queued run reopen-only", () => {
    expect(
      selectDurableRunAction(
        run({ status: "queued" }),
        "RENDERER_CRASHED",
      ).action,
    ).toBe("REOPEN");
  });

  it.each([
    [
      "needs_input",
      "Owner input required",
      "Open the workspace to provide the information required for this run.",
    ],
    [
      "paused_auth",
      "Authentication required",
      "Authentication or CAPTCHA is blocking automation. Open the workspace to continue safely.",
    ],
    [
      "failed_retryable",
      "Application attempt failed",
      "This run can be resumed from its durable checkpoint.",
    ],
    [
      "failed_final",
      "Application failed",
      "This run cannot be retried. Review the workspace before starting another application.",
    ],
    [
      "submission_unknown",
      "Submission status unknown",
      "Verify the application with the employer before attempting another submission.",
    ],
    [
      "cancelled",
      "Application cancelled",
      "This run was cancelled and will not continue.",
    ],
  ] as const)(
    "provides safe durable guidance for %s without accepting terminal text",
    (status, heading, guidance) => {
      expect(safeRunStatusPresentation(status)).toEqual({
        heading,
        guidance,
      });
    },
  );
});

describe("runtime projections", () => {
  it("applies runtime state only to its matching durable run", () => {
    expect(applyRuntimeState(run(), runtime())).toEqual({
      runtimeState: runtime(),
      viewAttached: true,
    });
    expect(
      applyRuntimeState(run(), runtime({ runId: "another-run" })),
    ).toEqual({
      runtimeState: null,
      viewAttached: false,
    });
  });

  it.each([
    ["idle", false],
    ["claiming", true],
    ["filling", true],
    ["armed", false],
    ["submitting", true],
    ["paused", true],
    ["queued", false],
    ["terminal", false],
  ] satisfies Array<[RuntimePhase, boolean]>)(
    "infers view attachment for %s",
    (phase, attached) => {
      expect(inferViewAttached(phase)).toBe(attached);
    },
  );

  it.each([
    [
      "LOOKALIKE_HOST",
      "Automation unavailable — the page host looks like a known ATS but is not an approved origin.",
    ],
    [
      "AMBIGUOUS_DETECTION",
      "Automation unavailable — more than one platform adapter matched this page.",
    ],
    [
      "MISSING_ADAPTER_EVIDENCE",
      "Automation unavailable — this application platform has no proven adapter evidence yet.",
    ],
    [
      "LEGAL_GATE",
      "Automation unavailable — this platform is blocked by a legal or policy gate.",
    ],
    [
      "PLATFORM_DRIFT",
      "Automation unavailable — the visible page no longer matches the expected application platform.",
    ],
    [
      "FEED_LISTING_UNRESOLVED",
      "Automation unavailable — this URL is a job-feed listing, not a resolved application form.",
    ],
  ] as const)(
    "maps coverage reason %s to a stable owner-facing message without throwing",
    (reasonCode, message) => {
      expect(runtimeReasonText(reasonCode)).toBe(message);
      expect(
        selectDurableRunAction(run({ status: "needs_input" }), reasonCode),
      ).toMatchObject({
        action: "RESOLVE",
        reasonCode,
        reasonText: message,
      });
      expect(
        applyRuntimeState(
          run(),
          runtime({ phase: "paused", reasonCode, status: "needs_input" }),
        ),
      ).toEqual({
        runtimeState: runtime({
          phase: "paused",
          reasonCode,
          status: "needs_input",
        }),
        viewAttached: true,
      });
    },
  );

  it("keeps existing operational reason mappings unchanged", () => {
    expect(runtimeReasonText("AUTH_REQUIRED")).toBe(
      "Authentication is required before this run can continue.",
    );
    expect(runtimeReasonText("CAPTCHA_REQUIRED")).toBe(
      "A CAPTCHA must be completed before this run can continue.",
    );
    expect(runtimeReasonText("UNSUPPORTED_CONTROL")).toBe(
      "The application contains a control that requires owner input.",
    );
    expect(runtimeReasonText("SUBMISSION_UNKNOWN")).toBe(
      "Submission could not be confirmed; do not retry blindly.",
    );
  });
});
