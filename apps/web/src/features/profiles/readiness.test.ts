import { describe, expect, it } from "vitest";
import { composeProductReadiness } from "./readiness";
import type { ApplicantProfile, LocalAiReadiness, ProfileResume } from "./types";
import { APPLICANT_PROFILE_FIELD_NAMES } from "./types";

function emptyField(value: unknown = null) {
  return {
    state: value == null ? ("unknown" as const) : ("provided" as const),
    value,
    source: value == null ? null : ("owner" as const),
    last_confirmed_at: value == null ? null : "2026-01-01T00:00:00Z",
    policy_category: "verified_profile" as const,
  };
}

function profile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  const fields = Object.fromEntries(
    APPLICANT_PROFILE_FIELD_NAMES.map((name) => [name, emptyField()]),
  ) as unknown as ApplicantProfile;
  return {
    ...fields,
    id: "profile-1",
    display_name: "Ada",
    avatar_asset_id: null,
    onboarding_step: "ready",
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    automation_preferences: {},
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    first_name: emptyField("Ada"),
    last_name: emptyField("Lovelace"),
    email: emptyField("ada@example.com"),
    ...overrides,
  };
}

const resume: ProfileResume = {
  id: "r1",
  applicant_profile_id: "profile-1",
  managed_asset_id: "a1",
  resume_id: "res_1",
  label: "Primary",
  sha256: "abc",
  checksum_summary: "abc",
  language: "en",
  is_default: true,
  file_size_bytes: 10,
  last_verified_at: null,
  version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const readyAi: LocalAiReadiness = {
  local_ai_configured: true,
  local_ai_ready: true,
  local_ai_failure_code: null,
  model: "mock",
  last_self_test_passed: true,
  exceptions: [],
};

describe("composeProductReadiness", () => {
  it("requires setup when identity, resume, or desktop is missing", () => {
    expect(
      composeProductReadiness({
        profile: null,
        resumes: [],
        desktopReady: false,
        localAi: null,
      }).label,
    ).toBe("Setup required");

    expect(
      composeProductReadiness({
        profile: profile({ email: emptyField() }),
        resumes: [resume],
        desktopReady: true,
        localAi: readyAi,
      }).label,
    ).toBe("Setup required");
  });

  it("returns ready with exceptions when optional gaps or local AI fail", () => {
    const result = composeProductReadiness({
      profile: profile(),
      resumes: [resume],
      desktopReady: true,
      localAi: {
        ...readyAi,
        local_ai_ready: false,
        local_ai_failure_code: "runtime_unreachable",
      },
    });
    expect(result.label).toBe("Ready with exceptions");
    expect(result.exceptions.some((item) => item.includes("unreachable"))).toBe(
      true,
    );
  });

  it("returns Ready for Auto Apply when required checks pass", () => {
    const result = composeProductReadiness({
      profile: profile({
        work_authorizations: emptyField([{ authorized: true }]),
        compensation_expectation: emptyField({ currency: "USD" }),
      }),
      resumes: [resume],
      desktopReady: true,
      localAi: readyAi,
    });
    expect(result.label).toBe("Ready for Auto Apply");
    expect(result.actions).toEqual([]);
  });
});
