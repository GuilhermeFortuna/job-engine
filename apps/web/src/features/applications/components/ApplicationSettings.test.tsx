import { fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import {
  ApiError,
  ApiNotFoundError,
  NetworkError,
} from "../api";
import {
  APPLICANT_PROFILE_FIELD_NAMES,
  type ApplicantProfile,
  type ConfirmedField,
  type ReusableAnswer,
  type SafeResume,
} from "../types";
import { ApplicationSettings } from "./ApplicationSettings";

const api = vi.hoisted(() => ({
  fetchApplicantProfile: vi.fn(),
  updateApplicantProfile: vi.fn(),
  fetchResumes: vi.fn(),
  registerResume: vi.fn(),
  updateResume: vi.fn(),
  deleteResume: vi.fn(),
  fetchAnswerBank: vi.fn(),
  createAnswer: vi.fn(),
  updateAnswer: vi.fn(),
  deleteAnswer: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  ...api,
}));

const unknownField = (): ConfirmedField => ({
  state: "unknown",
  value: null,
  source: null,
  last_confirmed_at: null,
  policy_category: "review_required",
});

function profile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  const fields = Object.fromEntries(
    APPLICANT_PROFILE_FIELD_NAMES.map((name) => [name, unknownField()]),
  ) as Pick<ApplicantProfile, (typeof APPLICANT_PROFILE_FIELD_NAMES)[number]>;
  return {
    id: "profile-1",
    version: 3,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    ...fields,
    ...overrides,
  };
}

const resume: SafeResume = {
  id: "asset-private",
  resume_id: "primary",
  label: "Primary",
  sha256: "ab".repeat(32),
  checksum_summary: "abababab…abab",
  language: "en",
  is_default: true,
  file_size_bytes: 2048,
  last_verified_at: "2026-08-20T00:00:00Z",
  version: 2,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};

const answer: ReusableAnswer = {
  id: "answer-private",
  answer_id: "work-auth",
  question_intent: "work_authorization",
  jurisdiction: "US",
  platform_scope: "greenhouse",
  answer_text: "I am authorized.",
  policy_category: "approved_reusable",
  provenance: "owner_authored",
  last_confirmed_at: "2026-08-20T00:00:00Z",
  expires_at: null,
  version: 4,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};

describe("ApplicationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchApplicantProfile.mockResolvedValue(profile());
    api.fetchResumes.mockResolvedValue([resume]);
    api.fetchAnswerBank.mockResolvedValue([answer]);
  });

  it("creates a complete first profile and announces success", async () => {
    api.fetchApplicantProfile.mockRejectedValue(
      new ApiNotFoundError("Not Found"),
    );
    api.updateApplicantProfile.mockImplementation(async (input) =>
      profile({ version: 1, ...input }),
    );
    renderWithProviders(<ApplicationSettings />);

    expect(await screen.findByText(/No applicant profile exists/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("First name state"), {
      target: { value: "provided" },
    });
    fireEvent.change(screen.getByLabelText("First name value"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await waitFor(() => expect(api.updateApplicantProfile).toHaveBeenCalledOnce());
    const input = api.updateApplicantProfile.mock.calls[0][0];
    expect(input.expected_version).toBeNull();
    expect(Object.keys(input)).toHaveLength(APPLICANT_PROFILE_FIELD_NAMES.length + 1);
    expect(input.first_name).toMatchObject({ state: "provided", value: "Ada" });
    expect(screen.getByRole("status")).toHaveTextContent("Profile saved");
  });

  it("replaces the complete profile, preserving structured and omitted fields", async () => {
    const current = profile({
      employment_history: {
        ...unknownField(),
        state: "provided",
        value: [{
          id: "2710fb1f-7607-4eb4-9894-36fcf076bf8b",
          company: "Example",
          title: "Engineer",
          start_date: "2024-01",
          responsibilities: ["Built safe systems"],
          technologies: ["TypeScript"],
        }],
      },
      skills: {
        ...unknownField(),
        state: "provided",
        value: ["TypeScript", "Python"],
      },
    });
    api.fetchApplicantProfile.mockResolvedValue(current);
    api.updateApplicantProfile.mockResolvedValue({ ...current, version: 4 });
    renderWithProviders(<ApplicationSettings />);

    expect(await screen.findByDisplayValue(/"responsibilities"/)).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("First name state"), {
      target: { value: "provided" },
    });
    fireEvent.change(screen.getByLabelText("First name value"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(api.updateApplicantProfile).toHaveBeenCalledOnce());
    expect(api.updateApplicantProfile.mock.calls[0][0]).toMatchObject({
      expected_version: 3,
      employment_history: current.employment_history,
      skills: current.skills,
    });
  });

  it("preserves hidden field metadata when the owner edits state and value", async () => {
    const current = profile({
      first_name: {
        state: "unknown",
        value: null,
        source: "resume_import",
        last_confirmed_at: "2026-08-19T00:00:00Z",
        policy_category: "prohibited_automation",
      },
    });
    api.fetchApplicantProfile.mockResolvedValue(current);
    api.updateApplicantProfile.mockResolvedValue({ ...current, version: 4 });
    renderWithProviders(<ApplicationSettings />);

    await screen.findByText("Applicant profile");
    fireEvent.change(screen.getByLabelText("First name state"), {
      target: { value: "provided" },
    });
    fireEvent.change(screen.getByLabelText("First name value"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(api.updateApplicantProfile).toHaveBeenCalledOnce());
    expect(api.updateApplicantProfile.mock.calls[0][0].first_name).toEqual({
      state: "provided",
      value: "Ada",
      source: "resume_import",
      last_confirmed_at: "2026-08-19T00:00:00Z",
      policy_category: "prohibited_automation",
    });
  });

  it("shows validation and safe conflict guidance", async () => {
    api.updateApplicantProfile.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: "private current value and /home/user/file",
      }),
    );
    renderWithProviders(<ApplicationSettings />);
    await screen.findByText("Applicant profile");
    fireEvent.change(screen.getByLabelText("Skills state"), {
      target: { value: "provided" },
    });
    fireEvent.change(screen.getByLabelText("Skills value"), {
      target: { value: "[broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("valid JSON");
    expect(api.updateApplicantProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Skills value"), {
      target: { value: '["TypeScript"]' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "changed elsewhere",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
  });

  it.each([
    ["Skills", '[{"name":"TypeScript"}]', "array of strings"],
    ["Employment history", '[{"company":"Example"}]', "id, company, title, and start_date"],
    [
      "Location preferences",
      '{"current_city":"Porto","current_region":"Porto","current_country":"PT","travel_percentage":"often"}',
      "travel_percentage",
    ],
  ])("validates %s against its backend shape", async (label, value, guidance) => {
    renderWithProviders(<ApplicationSettings />);
    await screen.findByText("Applicant profile");
    fireEvent.change(screen.getByLabelText(`${label} state`), {
      target: { value: "provided" },
    });
    fireEvent.change(screen.getByLabelText(`${label} value`), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(guidance);
    expect(api.updateApplicantProfile).not.toHaveBeenCalled();
  });

  it.each([
    [
      '[{"id":"not-a-uuid","company":"Example","title":"Engineer","start_date":"2024-01"}]',
      "valid UUID",
    ],
    [
      '[{"id":"2710fb1f-7607-4eb4-9894-36fcf076bf8b","company":"Example","title":"Engineer","start_date":"2024-01","location":42}]',
      "location",
    ],
    [
      '[{"id":"2710fb1f-7607-4eb4-9894-36fcf076bf8b","company":"Example","title":"Engineer","start_date":"2024-01","is_current":"yes"}]',
      "is_current",
    ],
  ])("validates employment UUID and optional field types", async (value, guidance) => {
    renderWithProviders(<ApplicationSettings />);
    await screen.findByText("Applicant profile");
    fireEvent.change(screen.getByLabelText("Employment history state"), {
      target: { value: "provided" },
    });
    fireEvent.change(screen.getByLabelText("Employment history value"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(guidance);
    expect(api.updateApplicantProfile).not.toHaveBeenCalled();
  });

  it("registers relative resume paths, then clears and never redisplays paths", async () => {
    api.fetchResumes.mockResolvedValue([]);
    api.registerResume.mockResolvedValue(resume);
    renderWithProviders(<ApplicationSettings />);
    expect(await screen.findByText("No résumés registered")).toBeInTheDocument();
    expect(screen.getByText(/relative to the configured resume_root/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Résumé ID"), { target: { value: "primary" } });
    fireEvent.change(screen.getByLabelText("Résumé label"), { target: { value: "Primary" } });
    fireEvent.change(screen.getByLabelText("Markdown source path"), {
      target: { value: "ada/resume.md" },
    });
    fireEvent.change(screen.getByLabelText("PDF upload path"), {
      target: { value: "ada/resume.pdf" },
    });
    fireEvent.change(screen.getByLabelText("HTML preview path"), {
      target: { value: "ada/resume.html" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register résumé" }));

    await waitFor(() => expect(api.registerResume).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Markdown source path")).toHaveValue("");
    expect(screen.getByLabelText("PDF upload path")).toHaveValue("");
    expect(screen.getByLabelText("HTML preview path")).toHaveValue("");
    expect(document.body).not.toHaveTextContent("ada/resume.md");
  });

  it("updates default/checksum and deletes with optimistic versions", async () => {
    api.updateResume.mockResolvedValue({ ...resume, label: "Updated", version: 3 });
    api.deleteResume.mockResolvedValue(undefined);
    renderWithProviders(<ApplicationSettings />);
    const card = await screen.findByRole("article", { name: "Résumé Primary" });
    fireEvent.change(within(card).getByLabelText("Label"), {
      target: { value: "Updated" },
    });
    fireEvent.click(within(card).getByLabelText("Default résumé"));
    fireEvent.click(within(card).getByLabelText("Refresh checksum"));
    fireEvent.click(within(card).getByRole("button", { name: "Save résumé" }));
    await waitFor(() =>
      expect(api.updateResume).toHaveBeenCalledWith("primary", {
        expected_version: 2,
        label: "Updated",
        is_default: false,
        refresh_checksum: true,
      }),
    );
    fireEvent.click(within(card).getByRole("button", { name: "Delete résumé" }));
    expect(await screen.findByRole("dialog", { name: /Delete résumé (Primary|Updated)\?/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete résumé" }));
    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith("primary", 3));
  });

  it("makes the résumé delete dialog modal and restores invoking focus", async () => {
    renderWithProviders(<ApplicationSettings />);
    const card = await screen.findByRole("article", { name: "Résumé Primary" });
    const settings = card.closest(".application-settings");
    const pageBoundary = settings?.parentElement;
    const invoke = within(card).getByRole("button", { name: "Delete résumé" });
    invoke.focus();
    fireEvent.click(invoke);
    const dialog = await screen.findByRole("dialog", { name: "Delete résumé Primary?" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm delete résumé" });
    expect(cancel).toHaveFocus();
    expect(dialog.parentElement).toHaveClass("application-modal-backdrop");
    expect(pageBoundary).toHaveAttribute("aria-hidden", "true");
    expect(pageBoundary).toHaveProperty("inert", true);

    invoke.focus();
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(invoke).toHaveFocus();
    expect(pageBoundary).not.toHaveAttribute("aria-hidden");
    expect(pageBoundary).not.toHaveProperty("inert", true);
  });

  it("keeps résumé deletion success available after removing the card", async () => {
    api.deleteResume.mockResolvedValue(undefined);
    renderWithProviders(<ApplicationSettings />);
    const card = await screen.findByRole("article", { name: "Résumé Primary" });
    fireEvent.click(within(card).getByRole("button", { name: "Delete résumé" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm delete résumé" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Résumé Primary" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Résumé deleted");
  });

  it("supports answer CRUD while confining raw text to this settings surface", async () => {
    api.createAnswer.mockResolvedValue({ ...answer, answer_id: "new-answer" });
    api.updateAnswer.mockResolvedValue({ ...answer, answer_text: "Updated", version: 5 });
    api.deleteAnswer.mockResolvedValue(undefined);
    renderWithProviders(<ApplicationSettings />);
    const card = await screen.findByRole("article", { name: "Answer work-auth" });
    expect(card).toHaveTextContent("I am authorized.");
    fireEvent.change(screen.getByLabelText("Answer ID"), {
      target: { value: "new-answer" },
    });
    fireEvent.change(screen.getAllByLabelText("Answer text")[0], {
      target: { value: "A private reusable response." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create answer" }));
    await waitFor(() =>
      expect(api.createAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          answer_id: "new-answer",
          answer_text: "A private reusable response.",
          question_intent: "work_authorization",
          provenance: "owner_authored",
        }),
      ),
    );
    fireEvent.change(within(card).getByLabelText("Answer text"), {
      target: { value: "Updated" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Save answer" }));
    await waitFor(() =>
      expect(api.updateAnswer).toHaveBeenCalledWith(
        "work-auth",
        expect.objectContaining({
          answer_text: "Updated",
          expected_version: 4,
          provenance: "owner_authored",
        }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Answer saved");
    fireEvent.click(within(card).getByRole("button", { name: "Delete answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm delete answer" }));
    await waitFor(() => expect(api.deleteAnswer).toHaveBeenCalledWith("work-auth", 5));
    expect(screen.getByRole("status")).toHaveTextContent("Answer deleted");
  });

  it("announces answer creation and provides modal answer deletion focus behavior", async () => {
    api.createAnswer.mockResolvedValue({ ...answer, answer_id: "new-answer" });
    renderWithProviders(<ApplicationSettings />);
    await screen.findByRole("article", { name: "Answer work-auth" });
    fireEvent.change(screen.getByLabelText("Answer ID"), {
      target: { value: "new-answer" },
    });
    fireEvent.change(screen.getAllByLabelText("Answer text")[0], {
      target: { value: "Reusable response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create answer" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Answer created");

    const card = screen.getByRole("article", { name: "Answer work-auth" });
    const invoke = within(card).getByRole("button", { name: "Delete answer" });
    invoke.focus();
    fireEvent.click(invoke);
    const dialog = screen.getByRole("dialog", { name: "Delete answer work-auth?" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm delete answer" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    expect(invoke).toHaveFocus();
  });

  it("keeps partial load failures distinct and retries only failed sections", async () => {
    api.fetchApplicantProfile
      .mockRejectedValueOnce(new NetworkError("private profile failure"))
      .mockResolvedValueOnce(profile());
    api.fetchResumes
      .mockRejectedValueOnce(new ApiError(500, "Oops", "private resumes"))
      .mockResolvedValueOnce([]);
    api.fetchAnswerBank.mockResolvedValue([]);
    renderWithProviders(<ApplicationSettings />);

    expect(await screen.findByText("No reusable answers saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register résumé" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create answer" })).toBeEnabled();
    expect(screen.queryByText("No applicant profile exists")).not.toBeInTheDocument();
    expect(screen.queryByText("No résumés registered")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry applicant profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry résumés" }));
    expect(await screen.findByRole("button", { name: "Save profile" })).toBeEnabled();
    expect(await screen.findByRole("button", { name: "Register résumé" })).toBeEnabled();
    expect(screen.getByText("No résumés registered")).toBeInTheDocument();
  });

  it("does not fabricate an empty answer bank after a failed load", async () => {
    api.fetchAnswerBank
      .mockRejectedValueOnce(new NetworkError("private answer failure"))
      .mockResolvedValueOnce([]);
    renderWithProviders(<ApplicationSettings />);

    expect(
      await screen.findByRole("button", { name: "Retry answer bank" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create answer" })).not.toBeInTheDocument();
    expect(screen.queryByText("No reusable answers saved")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private answer failure");

    fireEvent.click(screen.getByRole("button", { name: "Retry answer bank" }));
    expect(await screen.findByRole("button", { name: "Create answer" })).toBeEnabled();
    expect(screen.getByText("No reusable answers saved")).toBeInTheDocument();
  });

  it("renders loading, empty, network, and safe API error states", async () => {
    api.fetchApplicantProfile.mockRejectedValue(new NetworkError("offline private detail"));
    api.fetchResumes.mockRejectedValue(new ApiError(500, "Oops", "secret"));
    api.fetchAnswerBank.mockResolvedValue([]);
    renderWithProviders(<ApplicationSettings />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("No reusable answers saved")).toBeInTheDocument();
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((item) => item.textContent?.includes("network"))).toBe(true);
    expect(document.body).not.toHaveTextContent("secret");
    expect(document.body).not.toHaveTextContent("offline private detail");
  });
});
