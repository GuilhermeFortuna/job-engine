import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiConflictError,
  ApiError,
  ApiNotFoundError,
  NetworkError,
  cancelApplicationRun,
  createApplicationRun,
  fetchApplicationRunDetail,
  fetchResumes,
  overrideDuplicateRun,
  releaseSubmit,
  resolveExceptionAnswers,
  resumeApplicationRun,
  streamApplicationRunEvents,
} from "./api";
import {
  SEMI_AUTO_MODE,
  canReleaseSubmit,
  countFieldReports,
  eventDedupeKey,
  isHttpsApplicationUrl,
  summarizeChecksum,
  workspacePath,
  type ApplicationRunDetail,
  type SafeException,
  type SafeFieldReport,
} from "./types";

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const EXCEPTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXISTING_RUN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const fieldReport: SafeFieldReport = {
  field_fingerprint: "fp_hybrid_work",
  label: "Are you willing to work in hybrid mode?",
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

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 409 ? "Conflict" : status === 201 ? "Created" : "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "Content-Type": "application/json" }),
  } as Response;
}

describe("application URL and launch helpers", () => {
  it("accepts only https application URLs", () => {
    expect(isHttpsApplicationUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      true,
    );
    expect(isHttpsApplicationUrl("http://boards.greenhouse.io/acme/jobs/1")).toBe(
      false,
    );
    expect(isHttpsApplicationUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsApplicationUrl(null)).toBe(false);
  });

  it("builds the workspace path and checksum summary", () => {
    expect(workspacePath(RUN_ID)).toBe(`/applications/${RUN_ID}/workspace`);
    expect(
      summarizeChecksum(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    ).toBe("01234567…cdef");
  });

  it("counts filled, review, and unresolved field reports", () => {
    expect(
      countFieldReports([
        { ...fieldReport, status: "AUTO_FILL" },
        { ...fieldReport, status: "REVIEW_REQUIRED" },
        { ...fieldReport, status: "ABSTAIN" },
        { ...fieldReport, status: "UNRESOLVED" },
      ]),
    ).toEqual({ filled: 1, review: 1, unresolved: 2 });
  });

  it("enables submit only for the matching armed semi-auto run", () => {
    const armed: SafeException = {
      id: EXCEPTION_ID,
      run_id: RUN_ID,
      exception_type: "semi_auto_armed",
      status: "pending",
      field_reports: [{ ...fieldReport, status: "AUTO_FILL" }],
      created_at: "2026-08-19T00:00:00Z",
      resolved_at: null,
    };
    expect(
      canReleaseSubmit({
        status: "needs_input",
        checkpoint: "submit_armed",
        exceptions: [armed],
        openRunId: RUN_ID,
        routeRunId: RUN_ID,
      }),
    ).toBe(true);
    expect(
      canReleaseSubmit({
        status: "needs_input",
        checkpoint: "submit_armed",
        exceptions: [armed],
        openRunId: EXISTING_RUN_ID,
        routeRunId: RUN_ID,
      }),
    ).toBe(false);
  });
});

describe("applications API client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates one semi-auto run with job_group_ids and never sends full_auto", async () => {
    const created = {
      id: RUN_ID,
      job_group_id: JOB_ID,
      canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
      application_url: "https://boards.greenhouse.io/acme/jobs/1",
      platform_adapter_id: "greenhouse",
      resume_asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      resume_sha256: "abc123",
      automation_mode: SEMI_AUTO_MODE,
      status: "queued",
      current_step: "Run queued",
      current_checkpoint: null,
      terminal_reason: null,
      receipt_summary: null,
      policy_snapshot: { resume_id: "res_primary_pdf" },
      created_at: "2026-08-19T00:00:00Z",
      updated_at: "2026-08-19T00:00:00Z",
      started_at: null,
      completed_at: null,
    };
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ created_runs: [created], conflicts: [] }, 201),
    );

    const result = await createApplicationRun({
      jobGroupId: JOB_ID,
      resumeId: "res_primary_pdf",
    });

    expect(result.id).toBe(RUN_ID);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/application-runs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          job_group_ids: [JOB_ID],
          resume_id: "res_primary_pdf",
          automation_mode: SEMI_AUTO_MODE,
        }),
      }),
    );
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.automation_mode).not.toBe("full_auto");
    expect(body).not.toHaveProperty("job_group_id");
  });

  it("throws ApiConflictError with existing_run_id on duplicate 409", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          created_runs: [],
          conflicts: [
            {
              job_group_id: JOB_ID,
              canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
              existing_run_id: EXISTING_RUN_ID,
              existing_status: "queued",
              message: "An active run already exists",
            },
          ],
        },
        409,
      ),
    );

    await expect(
      createApplicationRun({ jobGroupId: JOB_ID, resumeId: "res_primary_pdf" }),
    ).rejects.toMatchObject({
      name: "ApiConflictError",
      status: 409,
      conflicts: [
        expect.objectContaining({ existing_run_id: EXISTING_RUN_ID }),
      ],
    });
    expect(ApiConflictError).toBeDefined();
  });

  it("projects run detail without unsafe payloads, values, or evidence paths", async () => {
    const rawDetail = {
      id: RUN_ID,
      job_group_id: JOB_ID,
      canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
      application_url: "https://boards.greenhouse.io/acme/jobs/1",
      platform_adapter_id: "greenhouse",
      resume_asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      resume_sha256: "aa".repeat(32),
      automation_mode: SEMI_AUTO_MODE,
      status: "needs_input",
      current_step: "Waiting for owner",
      current_checkpoint: "questions_answered",
      terminal_reason: null,
      receipt_summary: null,
      policy_snapshot: { resume_id: "res_primary_pdf" },
      created_at: "2026-08-19T00:00:00Z",
      updated_at: "2026-08-19T00:00:00Z",
      started_at: "2026-08-19T00:00:01Z",
      completed_at: null,
      events: [
        {
          id: "evt-1",
          run_id: RUN_ID,
          attempt: 1,
          sequence_num: 4,
          event_type: "exception_raised",
          event_payload: { secret: "should-not-leak" },
          created_at: "2026-08-19T00:00:02Z",
        },
      ],
      exceptions: [
        {
          id: EXCEPTION_ID,
          run_id: RUN_ID,
          exception_type: "unresolved_question",
          status: "pending",
          context_payload: { raw_dom: "<input value='secret'>" },
          resolution_payload: { answer_text: "plaintext-should-not-reach-ui" },
          field_reports: [fieldReport],
          created_at: "2026-08-19T00:00:02Z",
          resolved_at: null,
        },
      ],
      evidence: [
        {
          id: "ev-1",
          run_id: RUN_ID,
          attempt: 1,
          evidence_type: "receipt",
          relative_path: "/var/lib/job-engine/runs/secret.log",
          sha256: "bb".repeat(32),
          file_size_bytes: 12,
          captured_at: "2026-08-19T00:00:03Z",
          metadata_payload: { cookie: "session" },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(rawDetail));

    const detail = await fetchApplicationRunDetail(RUN_ID);
    expect(detail.id).toBe(RUN_ID);
    expect(detail.exceptions[0]).not.toHaveProperty("context_payload");
    expect(detail.exceptions[0]).not.toHaveProperty("resolution_payload");
    expect(detail.exceptions[0].field_reports[0]).not.toHaveProperty("value");
    expect(detail.exceptions[0].field_reports[0]).not.toHaveProperty(
      "proposed_answer",
    );
    expect(detail.events[0]).not.toHaveProperty("event_payload");
    expect(detail.evidence[0]).not.toHaveProperty("relative_path");
    expect(detail.evidence[0]).not.toHaveProperty("metadata_payload");
    expect(JSON.stringify(detail)).not.toContain("plaintext-should-not-reach-ui");
    expect(JSON.stringify(detail)).not.toContain("/var/lib/job-engine");
    expect(detail as ApplicationRunDetail).toBeTruthy();
  });

  it("throws ApiNotFoundError for missing runs", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ detail: "not found" }),
    } as Response);
    await expect(fetchApplicationRunDetail(RUN_ID)).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
  });

  it("lists resumes with label and checksum summary and without filesystem paths", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            resume_id: "res_primary_pdf",
            label: "Primary resume",
            source_markdown_path: "/home/owner/resume.md",
            upload_pdf_path: "/home/owner/resume.pdf",
            preview_html_path: null,
            sha256: "cc".repeat(32),
            language: "en",
            is_default: true,
            file_size_bytes: 1024,
            version: 1,
          },
        ],
      }),
    );

    const resumes = await fetchResumes();
    expect(resumes[0].label).toBe("Primary resume");
    expect(resumes[0].resume_id).toBe("res_primary_pdf");
    expect(resumes[0].checksum_summary).toBe("cccccccc…cccc");
    expect(resumes[0]).not.toHaveProperty("source_markdown_path");
    expect(resumes[0]).not.toHaveProperty("upload_pdf_path");
    expect(JSON.stringify(resumes)).not.toContain("/home/owner");
  });

  it("posts resolve-answers with fingerprints only and no policy fields", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: RUN_ID,
        job_group_id: JOB_ID,
        canonical_application_url: "https://example.com",
        application_url: "https://example.com",
        platform_adapter_id: "greenhouse",
        resume_asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        resume_sha256: "aa".repeat(32),
        automation_mode: SEMI_AUTO_MODE,
        status: "queued",
        current_step: "Run queued",
        current_checkpoint: null,
        terminal_reason: null,
        receipt_summary: null,
        policy_snapshot: null,
        created_at: "2026-08-19T00:00:00Z",
        updated_at: "2026-08-19T00:00:00Z",
        started_at: null,
        completed_at: null,
        events: [],
        exceptions: [],
        evidence: [],
      }),
    );

    await resolveExceptionAnswers(RUN_ID, {
      exception_id: EXCEPTION_ID,
      answers: [
        {
          field_fingerprint: "fp_hybrid_work",
          answer_text: "Yes, hybrid is fine",
          save_to_answer_bank: true,
        },
      ],
    });

    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body).toEqual({
      exception_id: EXCEPTION_ID,
      answers: [
        {
          field_fingerprint: "fp_hybrid_work",
          answer_text: "Yes, hybrid is fine",
          save_to_answer_bank: true,
        },
      ],
    });
    expect(body.answers[0]).not.toHaveProperty("question_intent");
    expect(body.answers[0]).not.toHaveProperty("policy_category");
    expect(global.fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api/v1/application-runs/${RUN_ID}/resolve-answers`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts release-submit, resume, cancel, and duplicate-override to the live contracts", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: RUN_ID,
        job_group_id: JOB_ID,
        canonical_application_url: "https://example.com",
        application_url: "https://example.com",
        platform_adapter_id: "greenhouse",
        resume_asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        resume_sha256: "aa".repeat(32),
        automation_mode: SEMI_AUTO_MODE,
        status: "queued",
        current_step: "Run queued",
        current_checkpoint: null,
        terminal_reason: null,
        receipt_summary: null,
        policy_snapshot: null,
        created_at: "2026-08-19T00:00:00Z",
        updated_at: "2026-08-19T00:00:00Z",
        started_at: null,
        completed_at: null,
        events: [],
        exceptions: [],
        evidence: [],
      }),
    );

    await releaseSubmit(RUN_ID, "Submit this application");
    await resumeApplicationRun(RUN_ID);
    await cancelApplicationRun(RUN_ID, "Owner cancelled");
    await overrideDuplicateRun(EXISTING_RUN_ID, {
      owner_confirmation: "Create a new run",
      reason: "Previous attempt stalled",
    });

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe(
      `http://127.0.0.1:8000/api/v1/application-runs/${RUN_ID}/release-submit`,
    );
    expect(JSON.parse(calls[0][1].body as string)).toEqual({
      owner_confirmation: "Submit this application",
    });
    expect(calls[1][0]).toBe(
      `http://127.0.0.1:8000/api/v1/application-runs/${RUN_ID}/resume`,
    );
    expect(calls[1][1].body).toBeUndefined();
    expect(calls[2][0]).toBe(
      `http://127.0.0.1:8000/api/v1/application-runs/${RUN_ID}/cancel`,
    );
    expect(JSON.parse(calls[3][1].body as string)).toEqual({
      owner_confirmation: "Create a new run",
      reason: "Previous attempt stalled",
    });
  });

  it("throws NetworkError when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(fetchResumes()).rejects.toBeInstanceOf(NetworkError);
    await expect(fetchApplicationRunDetail(RUN_ID)).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("throws ApiError on unexpected status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({ detail: "boom" }),
    } as Response);
    await expect(fetchResumes()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("application run SSE", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";
  });

  function sseResponse(payload: string): Response {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: stream,
    } as Response;
  }

  it("sends Last-Event-ID, deduplicates, rejects other runs, and flags state-changing events", async () => {
    const payload = [
      `id: ${RUN_ID}:1\nevent: run_created\ndata: ${JSON.stringify({
        id: "e1",
        run_id: RUN_ID,
        attempt: 1,
        sequence_num: 1,
        event_type: "run_created",
        created_at: "2026-08-19T00:00:00Z",
      })}\n\n`,
      `id: ${RUN_ID}:1\nevent: run_created\ndata: ${JSON.stringify({
        id: "e1-dup",
        run_id: RUN_ID,
        attempt: 1,
        sequence_num: 1,
        event_type: "run_created",
        created_at: "2026-08-19T00:00:00Z",
      })}\n\n`,
      `id: ${EXISTING_RUN_ID}:2\nevent: status_changed\ndata: ${JSON.stringify({
        id: "e-other",
        run_id: EXISTING_RUN_ID,
        attempt: 1,
        sequence_num: 2,
        event_type: "status_changed",
        created_at: "2026-08-19T00:00:01Z",
      })}\n\n`,
      `id: ${RUN_ID}:3\nevent: status_changed\ndata: ${JSON.stringify({
        id: "e3",
        run_id: RUN_ID,
        attempt: 1,
        sequence_num: 3,
        event_type: "status_changed",
        created_at: "2026-08-19T00:00:02Z",
      })}\n\n`,
    ].join("");

    const mockFetch = vi.fn().mockResolvedValue(sseResponse(payload));
    vi.stubGlobal("fetch", mockFetch);

    const onEvent = vi.fn();
    const onStateChanging = vi.fn();
    const onRejected = vi.fn();

    const lastId = await streamApplicationRunEvents({
      runId: RUN_ID,
      lastEventId: `${RUN_ID}:0`,
      onEvent,
      onStateChanging,
      onRejected,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api/v1/application-runs/${RUN_ID}/events/stream`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          "Last-Event-ID": `${RUN_ID}:0`,
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onStateChanging).toHaveBeenCalledTimes(1);
    expect(onStateChanging.mock.calls[0][0].event_type).toBe("status_changed");
    expect(lastId).toBe(eventDedupeKey(RUN_ID, 3));
  });
});
