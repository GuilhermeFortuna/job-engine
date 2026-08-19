import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ExceptionResolver } from "./ExceptionResolver";
import { FieldReviewPanel } from "./FieldReviewPanel";
import { JobContextPanel } from "./JobContextPanel";
import { SubmissionReceipt } from "./SubmissionReceipt";
import type { SafeException, SafeFieldReport, SafeResume } from "../types";

const report: SafeFieldReport = {
  field_fingerprint: "fp_hybrid_work",
  label: "Hybrid work?",
  control_type: "text",
  required: true,
  status: "REVIEW_REQUIRED",
  reason_code: "no_applicable_answer",
  question_intent: "location_preference",
  options: [],
  min_length: 1,
  max_length: 200,
  pattern: null,
  allow_save_to_answer_bank: true,
};

const resume: SafeResume = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  resume_id: "res_primary_pdf",
  label: "Primary resume",
  sha256: "cc".repeat(32),
  checksum_summary: "cccccccc…cccc",
  language: "en",
  is_default: true,
  file_size_bytes: 1024,
  version: 1,
};

describe("workspace review panels", () => {
  it("shows job, resume checksum, and backend status without sensitive values", () => {
    renderWithProviders(
      <JobContextPanel
        title="Staff Engineer"
        company="Apex"
        sourceName="Greenhouse"
        applicationOrigin="https://boards.greenhouse.io"
        resume={resume}
        status="needs_input"
        checkpoint="questions_answered"
        currentStep="Waiting for owner"
      />,
    );
    expect(screen.getByText("Staff Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Primary resume \(cccccccc…cccc\)/)).toBeInTheDocument();
    expect(screen.queryByText("/home/")).not.toBeInTheDocument();
  });

  it("counts field identity and reason codes without values", () => {
    renderWithProviders(
      <FieldReviewPanel
        reports={[
          report,
          { ...report, field_fingerprint: "fp2", status: "AUTO_FILL", label: "Name" },
        ]}
      />,
    );
    expect(screen.getByText(/Filled 1. Review 1. Unresolved 0./)).toBeInTheDocument();
    expect(screen.getByText("Hybrid work?")).toBeInTheDocument();
    expect(screen.queryByText("Yes, hybrid")).not.toBeInTheDocument();
  });

  it("resolves pending questions with fingerprints and never asks for credentials", () => {
    const onResolve = vi.fn();
    const exception: SafeException = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exception_type: "unresolved_question",
      status: "pending",
      field_reports: [report],
      created_at: "2026-08-19T00:00:00Z",
      resolved_at: null,
    };
    renderWithProviders(
      <ExceptionResolver
        runStatus="needs_input"
        exceptions={[exception]}
        submitting={false}
        onResolve={onResolve}
        onResume={() => {}}
      />,
    );
    const input = screen.getByLabelText("Hybrid work?");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Yes, hybrid is fine" } });
    fireEvent.click(screen.getByLabelText(/save to answer bank/i));
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    expect(onResolve).toHaveBeenCalledWith(exception.id, [
      {
        field_fingerprint: "fp_hybrid_work",
        answer_text: "Yes, hybrid is fine",
        save_to_answer_bank: true,
      },
    ]);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("instructs CAPTCHA completion in the embedded page then resumes", () => {
    const onResume = vi.fn();
    renderWithProviders(
      <ExceptionResolver
        runStatus="paused_auth"
        exceptions={[
          {
            id: "ex-auth",
            run_id: "run",
            exception_type: "captcha_required",
            status: "pending",
            field_reports: [],
            created_at: "2026-08-19T00:00:00Z",
            resolved_at: null,
          },
        ]}
        submitting={false}
        onResolve={() => {}}
        onResume={onResume}
      />,
    );
    expect(screen.getByText(/never asks for credentials/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resume application/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("renders distinct submitted, unknown, failed, and cancelled outcomes", () => {
    const { rerender } = renderWithProviders(
      <SubmissionReceipt
        status="submitted"
        receipt={{
          platform_adapter_id: "greenhouse",
          final_url: "https://boards.greenhouse.io/thanks",
          platform_receipt_id: "r1",
          confirmation_signal: "thank_you_page",
          capture_timestamp: "2026-08-19T00:00:00Z",
          artifact_hash: "aa".repeat(32),
          summary_notes: null,
        }}
        evidence={[]}
        terminalReason={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "Submitted" })).toBeInTheDocument();

    rerender(
      <SubmissionReceipt
        status="submission_unknown"
        receipt={null}
        evidence={[
          {
            id: "ev1",
            run_id: "run",
            attempt: 1,
            evidence_type: "receipt",
            sha256: "bb".repeat(32),
            file_size_bytes: 12,
            captured_at: "2026-08-19T00:00:01Z",
          },
        ]}
        terminalReason={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "Submission unknown" })).toBeInTheDocument();
    expect(screen.queryByText(/relative_path/i)).not.toBeInTheDocument();

    rerender(
      <SubmissionReceipt
        status="failed_final"
        receipt={null}
        evidence={[]}
        terminalReason="Adapter error"
      />,
    );
    expect(screen.getByRole("heading", { name: "Failed" })).toBeInTheDocument();

    rerender(
      <SubmissionReceipt
        status="cancelled"
        receipt={null}
        evidence={[]}
        terminalReason="Owner cancelled"
      />,
    );
    expect(screen.getByRole("heading", { name: "Cancelled" })).toBeInTheDocument();
  });
});
