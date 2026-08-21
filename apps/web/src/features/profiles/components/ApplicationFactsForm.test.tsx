import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationFactsForm, factsFromProfile } from "./ApplicationFactsForm";
import { APPLICANT_PROFILE_FIELD_NAMES, type ApplicantProfile } from "../types";

function emptyField(value: unknown = null) {
  return {
    state: value == null ? ("unknown" as const) : ("provided" as const),
    value,
    source: value == null ? null : ("owner" as const),
    last_confirmed_at: value == null ? null : "2026-01-01T00:00:00Z",
    policy_category: "verified_profile" as const,
  };
}

function profile(): ApplicantProfile {
  const fields = Object.fromEntries(
    APPLICANT_PROFILE_FIELD_NAMES.map((name) => [name, emptyField()]),
  ) as unknown as ApplicantProfile;
  return {
    ...fields,
    id: "p1",
    display_name: "Ada",
    avatar_asset_id: null,
    onboarding_step: "facts",
    onboarding_completed_at: null,
    archived_at: null,
    automation_preferences: {},
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("ApplicationFactsForm", () => {
  it("keeps sensitive demographic fields blank by default", () => {
    const onChange = vi.fn();
    const draft = factsFromProfile(profile());
    expect(draft.decline_all_optional).toBe(true);
    expect(draft.gender).toBe("");
    expect(draft.race_ethnicity).toBe("");

    renderWithProviders(
      <ApplicationFactsForm value={draft} onChange={onChange} />,
    );

    expect(
      screen.getByText(/never filled in by AI suggestions/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Gender")).not.toBeInTheDocument();
  });
});
