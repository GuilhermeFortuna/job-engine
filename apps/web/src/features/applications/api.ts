import { getApiBaseUrl } from "@/lib/env";
import {
  APPLICANT_PROFILE_FIELD_NAMES,
  FULL_AUTO_MODE,
  FULL_AUTO_OWNER_CONFIRMATION,
  isStateChangingEvent,
  summarizeChecksum,
  type AnswerBankFilters,
  type ApplicantProfile,
  type ApplicantProfileUpdate,
  type ApplicationRunList,
  type ApplicationRunListOptions,
  type ApplicationRunConflict,
  type CreateApplicationRunInput,
  type ApplicationRunDetail,
  type ApplicationRunEvent,
  type ApplicationRunSummary,
  type CreateApplicationRunResponse,
  type ConfirmedField,
  type EvidenceMetadata,
  type EvidenceType,
  type ResumeRegistrationInput,
  type ResumeUpdateInput,
  type ReusableAnswer,
  type ReusableAnswerInput,
  type ReusableAnswerUpdate,
  type ResolveAnswerItem,
  type SafeException,
  type SafeFieldReport,
  type SafeResume,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly detail?: unknown;

  constructor(status: number, statusText: string, detail?: unknown) {
    const message =
      typeof detail === "string"
        ? detail
        : typeof (detail as { detail?: string })?.detail === "string"
          ? (detail as { detail: string }).detail
          : `API request failed with status ${status} (${statusText})`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

export class ApiNotFoundError extends ApiError {
  constructor(statusText: string, detail?: unknown) {
    super(404, statusText, detail);
    this.name = "ApiNotFoundError";
  }
}

export class ApiConflictError extends ApiError {
  readonly conflicts: ApplicationRunConflict[];
  readonly createdRuns: ApplicationRunSummary[];

  constructor(
    statusText: string,
    body: CreateApplicationRunResponse,
    detail?: unknown,
  ) {
    super(409, statusText, detail ?? body);
    this.name = "ApiConflictError";
    this.conflicts = body.conflicts;
    this.createdRuns = body.created_runs;
  }
}

export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

async function parseDetail(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }
}

function throwForStatus(response: Response, detail: unknown): never {
  if (response.status === 404) {
    throw new ApiNotFoundError(response.statusText, detail);
  }
  throw new ApiError(response.status, response.statusText, detail);
}

async function fetchJson(
  url: string,
  init: RequestInit | undefined,
  networkMessage: string,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError(networkMessage, err);
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function projectFieldReport(raw: Record<string, unknown>): SafeFieldReport {
  return {
    field_fingerprint: asString(raw.field_fingerprint),
    label: asString(raw.label),
    control_type: asString(raw.control_type) as SafeFieldReport["control_type"],
    required: Boolean(raw.required),
    status: asString(raw.status),
    reason_code: asNullableString(raw.reason_code),
    question_intent: asNullableString(
      raw.question_intent,
    ) as SafeFieldReport["question_intent"],
    options: Array.isArray(raw.options)
      ? raw.options.filter((option): option is string => typeof option === "string")
      : [],
    min_length: typeof raw.min_length === "number" ? raw.min_length : null,
    max_length: typeof raw.max_length === "number" ? raw.max_length : null,
    pattern: asNullableString(raw.pattern),
    allow_save_to_answer_bank: Boolean(raw.allow_save_to_answer_bank),
  };
}

function projectException(raw: Record<string, unknown>): SafeException {
  const reports = Array.isArray(raw.field_reports) ? raw.field_reports : [];
  return {
    id: asString(raw.id),
    run_id: asString(raw.run_id),
    exception_type: asString(raw.exception_type) as SafeException["exception_type"],
    status: asString(raw.status) as SafeException["status"],
    field_reports: reports
      .filter((report): report is Record<string, unknown> => Boolean(report) && typeof report === "object")
      .map(projectFieldReport),
    created_at: asString(raw.created_at),
    resolved_at: asNullableString(raw.resolved_at),
  };
}

function projectEvent(raw: Record<string, unknown>): ApplicationRunEvent {
  return {
    id: asString(raw.id),
    run_id: asString(raw.run_id),
    attempt: typeof raw.attempt === "number" ? raw.attempt : 0,
    sequence_num: typeof raw.sequence_num === "number" ? raw.sequence_num : 0,
    event_type: asString(raw.event_type),
    created_at: asString(raw.created_at),
  };
}

function projectEvidence(raw: Record<string, unknown>): EvidenceMetadata {
  return {
    id: asString(raw.id),
    run_id: asString(raw.run_id),
    attempt: typeof raw.attempt === "number" ? raw.attempt : 0,
    evidence_type: asString(raw.evidence_type) as EvidenceType,
    sha256: asString(raw.sha256),
    file_size_bytes:
      typeof raw.file_size_bytes === "number" ? raw.file_size_bytes : null,
    captured_at: asString(raw.captured_at),
  };
}

function projectReceipt(
  raw: unknown,
): ApplicationRunSummary["receipt_summary"] {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const receipt = raw as Record<string, unknown>;
  return {
    platform_adapter_id: asString(receipt.platform_adapter_id),
    final_url: asNullableString(receipt.final_url),
    platform_receipt_id: asNullableString(receipt.platform_receipt_id),
    confirmation_signal: asString(receipt.confirmation_signal),
    capture_timestamp: asString(receipt.capture_timestamp),
    artifact_hash: asString(receipt.artifact_hash),
    summary_notes: asNullableString(receipt.summary_notes),
  };
}

function projectPolicySnapshot(
  raw: unknown,
): ApplicationRunSummary["policy_snapshot"] {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const snapshot = raw as Record<string, unknown>;
  return {
    profile_version:
      typeof snapshot.profile_version === "number"
        ? snapshot.profile_version
        : undefined,
    resume_id:
      typeof snapshot.resume_id === "string" ? snapshot.resume_id : undefined,
    answer_bank_hash:
      typeof snapshot.answer_bank_hash === "string"
        ? snapshot.answer_bank_hash
        : undefined,
  };
}

function projectRunSummary(raw: Record<string, unknown>): ApplicationRunSummary {
  return {
    id: asString(raw.id),
    job_group_id: asString(raw.job_group_id),
    canonical_application_url: asString(raw.canonical_application_url),
    application_url: asString(raw.application_url),
    platform_adapter_id: asString(raw.platform_adapter_id),
    resume_asset_id: asString(raw.resume_asset_id),
    resume_sha256: asString(raw.resume_sha256),
    automation_mode: asString(
      raw.automation_mode,
    ) as ApplicationRunSummary["automation_mode"],
    automatic_submission_authorized_at: asNullableString(
      raw.automatic_submission_authorized_at,
    ),
    automatic_submission_authorized:
      raw.automatic_submission_authorized === true,
    status: asString(raw.status) as ApplicationRunSummary["status"],
    current_step: asNullableString(raw.current_step),
    current_checkpoint: asNullableString(raw.current_checkpoint),
    submit_attempted_at: asNullableString(raw.submit_attempted_at),
    terminal_reason: asNullableString(raw.terminal_reason),
    receipt_summary: projectReceipt(raw.receipt_summary),
    policy_snapshot: projectPolicySnapshot(raw.policy_snapshot),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
    started_at: asNullableString(raw.started_at),
    completed_at: asNullableString(raw.completed_at),
  };
}

export function projectApplicationRunDetail(
  raw: Record<string, unknown>,
): ApplicationRunDetail {
  const events = Array.isArray(raw.events) ? raw.events : [];
  const exceptions = Array.isArray(raw.exceptions) ? raw.exceptions : [];
  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  return {
    ...projectRunSummary(raw),
    events: events
      .filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object")
      .map(projectEvent),
    exceptions: exceptions
      .filter(
        (exception): exception is Record<string, unknown> =>
          Boolean(exception) && typeof exception === "object",
      )
      .map(projectException),
    evidence: evidence
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map(projectEvidence),
  };
}

function projectCreateResponse(raw: Record<string, unknown>): CreateApplicationRunResponse {
  const created = Array.isArray(raw.created_runs) ? raw.created_runs : [];
  const conflicts = Array.isArray(raw.conflicts) ? raw.conflicts : [];
  return {
    created_runs: created
      .filter((run): run is Record<string, unknown> => Boolean(run) && typeof run === "object")
      .map(projectRunSummary),
    conflicts: conflicts
      .filter(
        (conflict): conflict is Record<string, unknown> =>
          Boolean(conflict) && typeof conflict === "object",
      )
      .map((conflict) => ({
        job_group_id: asString(conflict.job_group_id),
        canonical_application_url: asString(conflict.canonical_application_url),
        existing_run_id: asString(conflict.existing_run_id),
        existing_status: asString(
          conflict.existing_status,
        ) as ApplicationRunConflict["existing_status"],
        message: asString(conflict.message),
      })),
  };
}

export async function createApplicationRun(
  input: CreateApplicationRunInput,
): Promise<CreateApplicationRunResponse> {
  const url = `${getApiBaseUrl()}/api/v1/application-runs`;
  const requestBody = {
    job_group_ids: input.job_group_ids,
    resume_id: input.resume_id,
    automation_mode: input.automation_mode,
    ...(input.automation_mode === FULL_AUTO_MODE
      ? { owner_confirmation: FULL_AUTO_OWNER_CONFIRMATION }
      : {}),
  };
  const response = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  }, "Failed to create application run");

  const detail = await parseDetail(response);
  const body =
    detail && typeof detail === "object"
      ? projectCreateResponse(detail as Record<string, unknown>)
      : { created_runs: [], conflicts: [] };

  if (response.status === 409 || (body.created_runs.length === 0 && body.conflicts.length > 0)) {
    throw new ApiConflictError(response.statusText, body, detail);
  }
  if (!response.ok) {
    throwForStatus(response, detail);
  }
  if (body.created_runs.length === 0) {
    throw new ApiError(response.status, response.statusText, detail);
  }
  return body;
}

export async function fetchApplicationRuns(
  options: ApplicationRunListOptions = {},
  init?: RequestInit,
): Promise<ApplicationRunList> {
  const query = new URLSearchParams();
  for (const status of options.statuses ?? []) {
    query.append("status", status);
  }
  for (const mode of options.modes ?? []) {
    query.append("mode", mode);
  }
  const scalarOptions: Array<[string, string | number | undefined]> = [
    ["job_group_id", options.job_group_id],
    ["platform_adapter_id", options.platform_adapter_id],
    ["created_after", options.created_after],
    ["created_before", options.created_before],
    ["page", options.page],
    ["page_size", options.page_size],
  ];
  for (const [name, value] of scalarOptions) {
    if (value !== undefined) {
      query.append(name, String(value));
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await fetchJson(
    `${getApiBaseUrl()}/api/v1/application-runs${suffix}`,
    init,
    "Failed to fetch application runs",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items: items.filter(isRecord).map(projectRunSummary),
    total: asNumber(raw.total),
    page: asNumber(raw.page, 1),
    page_size: asNumber(raw.page_size, 25),
    total_pages: asNumber(raw.total_pages, 1),
  };
}

export async function fetchApplicationRunDetail(
  runId: string,
  init?: RequestInit,
): Promise<ApplicationRunDetail> {
  const url = `${getApiBaseUrl()}/api/v1/application-runs/${encodeURIComponent(runId)}`;
  const response = await fetchJson(
    url,
    init,
    `Failed to fetch application run ${runId}`,
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as Record<string, unknown>;
  return projectApplicationRunDetail(raw);
}

function projectConfirmedField(raw: unknown): ConfirmedField {
  const field = isRecord(raw) ? raw : {};
  return {
    state: asString(field.state) as ConfirmedField["state"],
    value: field.value ?? null,
    source: asNullableString(field.source) as ConfirmedField["source"],
    last_confirmed_at: asNullableString(field.last_confirmed_at),
    policy_category: asString(
      field.policy_category,
    ) as ConfirmedField["policy_category"],
  };
}

function projectApplicantProfile(raw: Record<string, unknown>): ApplicantProfile {
  const fields = Object.fromEntries(
    APPLICANT_PROFILE_FIELD_NAMES.map((name) => [
      name,
      projectConfirmedField(raw[name]),
    ]),
  ) as Pick<ApplicantProfile, (typeof APPLICANT_PROFILE_FIELD_NAMES)[number]>;
  return {
    id: asString(raw.id),
    version: asNumber(raw.version),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
    ...fields,
  };
}

function projectResume(raw: Record<string, unknown>): SafeResume {
  const sha256 = asString(raw.sha256);
  return {
    id: asString(raw.id),
    resume_id: asString(raw.resume_id),
    label: asString(raw.label),
    sha256,
    checksum_summary: summarizeChecksum(sha256),
    language: asString(raw.language),
    is_default: Boolean(raw.is_default),
    file_size_bytes:
      typeof raw.file_size_bytes === "number" ? raw.file_size_bytes : null,
    last_verified_at: asNullableString(raw.last_verified_at),
    version: asNumber(raw.version, 1),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
  };
}

function projectAnswer(raw: Record<string, unknown>): ReusableAnswer {
  return {
    id: asString(raw.id),
    answer_id: asString(raw.answer_id),
    question_intent: asString(
      raw.question_intent,
    ) as ReusableAnswer["question_intent"],
    jurisdiction: asNullableString(raw.jurisdiction),
    platform_scope: asNullableString(raw.platform_scope),
    answer_text: asString(raw.answer_text),
    policy_category: asString(
      raw.policy_category,
    ) as ReusableAnswer["policy_category"],
    provenance: asString(raw.provenance),
    last_confirmed_at: asString(raw.last_confirmed_at),
    expires_at: asNullableString(raw.expires_at),
    version: asNumber(raw.version, 1),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
  };
}

async function requestProjectedJson<T>(
  url: string,
  init: RequestInit | undefined,
  networkMessage: string,
  project: (raw: Record<string, unknown>) => T,
): Promise<T> {
  const response = await fetchJson(url, init, networkMessage);
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  return project((await response.json()) as Record<string, unknown>);
}

export async function fetchApplicantProfile(
  init?: RequestInit,
): Promise<ApplicantProfile> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/applicant-profile`,
    init,
    "Failed to fetch applicant profile",
    projectApplicantProfile,
  );
}

export async function updateApplicantProfile(
  input: ApplicantProfileUpdate,
): Promise<ApplicantProfile> {
  const missingFields = APPLICANT_PROFILE_FIELD_NAMES.filter(
    (name) => !Object.hasOwn(input, name) || input[name] === undefined,
  );
  if (missingFields.length > 0) {
    throw new TypeError(
      `A complete applicant profile is required; missing: ${missingFields.join(", ")}`,
    );
  }
  const body: Record<string, unknown> = {
    expected_version: input.expected_version,
  };
  for (const name of APPLICANT_PROFILE_FIELD_NAMES) {
    body[name] = input[name];
  }
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/applicant-profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Failed to update applicant profile",
    projectApplicantProfile,
  );
}

export async function fetchResumes(init?: RequestInit): Promise<SafeResume[]> {
  const url = `${getApiBaseUrl()}/api/v1/resumes`;
  const response = await fetchJson(url, init, "Failed to fetch registered resumes");
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { items?: unknown[] };
  const items = Array.isArray(raw.items) ? raw.items : [];
  return items.filter(isRecord).map(projectResume);
}

export async function registerResume(
  input: ResumeRegistrationInput,
): Promise<SafeResume> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/resumes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Failed to register resume",
    projectResume,
  );
}

export async function updateResume(
  resumeId: string,
  input: ResumeUpdateInput,
): Promise<SafeResume> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/resumes/${encodeURIComponent(resumeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    `Failed to update resume ${resumeId}`,
    projectResume,
  );
}

async function deleteVersionedResource(
  path: string,
  expectedVersion: number,
  networkMessage: string,
): Promise<void> {
  const query = new URLSearchParams({
    expected_version: String(expectedVersion),
  });
  const response = await fetchJson(
    `${getApiBaseUrl()}${path}?${query.toString()}`,
    { method: "DELETE" },
    networkMessage,
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
}

export async function deleteResume(
  resumeId: string,
  expectedVersion: number,
): Promise<void> {
  return deleteVersionedResource(
    `/api/v1/resumes/${encodeURIComponent(resumeId)}`,
    expectedVersion,
    `Failed to delete resume ${resumeId}`,
  );
}

export async function fetchAnswerBank(
  filters: AnswerBankFilters = {},
  init?: RequestInit,
): Promise<ReusableAnswer[]> {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined) {
      query.append(name, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await fetchJson(
    `${getApiBaseUrl()}/api/v1/answer-bank${suffix}`,
    init,
    "Failed to fetch answer bank",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { items?: unknown[] };
  return (Array.isArray(raw.items) ? raw.items : [])
    .filter(isRecord)
    .map(projectAnswer);
}

export async function createAnswer(
  input: ReusableAnswerInput,
): Promise<ReusableAnswer> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/answer-bank`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Failed to create answer-bank entry",
    projectAnswer,
  );
}

export async function updateAnswer(
  answerId: string,
  input: ReusableAnswerUpdate,
): Promise<ReusableAnswer> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/answer-bank/${encodeURIComponent(answerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    `Failed to update answer-bank entry ${answerId}`,
    projectAnswer,
  );
}

export async function deleteAnswer(
  answerId: string,
  expectedVersion: number,
): Promise<void> {
  return deleteVersionedResource(
    `/api/v1/answer-bank/${encodeURIComponent(answerId)}`,
    expectedVersion,
    `Failed to delete answer-bank entry ${answerId}`,
  );
}

async function postRunAction(
  runId: string,
  action: string,
  body: unknown | undefined,
  networkMessage: string,
): Promise<ApplicationRunDetail> {
  const url = `${getApiBaseUrl()}/api/v1/application-runs/${encodeURIComponent(runId)}/${action}`;
  const response = await fetchJson(
    url,
    {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    networkMessage,
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  return projectApplicationRunDetail((await response.json()) as Record<string, unknown>);
}

export async function resolveExceptionAnswers(
  runId: string,
  input: { exception_id: string; answers: ResolveAnswerItem[] },
): Promise<ApplicationRunDetail> {
  const answers = input.answers.map((answer) => {
    const item: ResolveAnswerItem = {
      field_fingerprint: answer.field_fingerprint,
      answer_text: answer.answer_text,
      save_to_answer_bank: answer.save_to_answer_bank,
    };
    if (answer.jurisdiction != null) {
      item.jurisdiction = answer.jurisdiction;
    }
    if (answer.platform_scope != null) {
      item.platform_scope = answer.platform_scope;
    }
    return item;
  });
  return postRunAction(runId, "resolve-answers", {
    exception_id: input.exception_id,
    answers,
  }, `Failed to resolve answers for run ${runId}`);
}

export async function releaseSubmit(
  runId: string,
  ownerConfirmation: string,
): Promise<ApplicationRunDetail> {
  return postRunAction(
    runId,
    "release-submit",
    { owner_confirmation: ownerConfirmation },
    `Failed to release submit for run ${runId}`,
  );
}

export async function resumeApplicationRun(
  runId: string,
): Promise<ApplicationRunDetail> {
  return postRunAction(runId, "resume", undefined, `Failed to resume run ${runId}`);
}

export async function cancelApplicationRun(
  runId: string,
  reason?: string,
): Promise<ApplicationRunDetail> {
  return postRunAction(
    runId,
    "cancel",
    reason ? { reason } : {},
    `Failed to cancel run ${runId}`,
  );
}

export async function overrideDuplicateRun(
  existingRunId: string,
  input: { owner_confirmation: string; reason: string },
): Promise<ApplicationRunDetail> {
  return postRunAction(
    existingRunId,
    "duplicate-override",
    input,
    `Failed to override duplicate for run ${existingRunId}`,
  );
}

export interface StreamApplicationRunCallbacks {
  onConnected?: () => void;
  onLastEventId?: (lastEventId: string) => void;
  onEvent?: (event: ApplicationRunEvent) => void;
  onStateChanging?: (event: ApplicationRunEvent) => void;
  onRejected?: (event: ApplicationRunEvent) => void;
  onError?: (error: Error) => void;
}

export async function streamApplicationRunEvents(options: {
  runId?: string;
  lastEventId?: string;
  signal?: AbortSignal;
  onConnected?: () => void;
  onLastEventId?: (lastEventId: string) => void;
  onEvent?: (event: ApplicationRunEvent) => void;
  onStateChanging?: (event: ApplicationRunEvent) => void;
  onRejected?: (event: ApplicationRunEvent) => void;
  onError?: (error: Error) => void;
}): Promise<string | undefined> {
  const streamPath =
    options.runId === undefined
      ? "/api/v1/application-runs/events/stream"
      : `/api/v1/application-runs/${encodeURIComponent(options.runId)}/events/stream`;
  const url = `${getApiBaseUrl()}${streamPath}`;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (options.lastEventId) {
    headers["Last-Event-ID"] = options.lastEventId;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal?.aborted) {
      return options.lastEventId;
    }
    const error = new NetworkError("Failed to stream application run events", err);
    options.onError?.(error);
    throw error;
  }

  if (!response.ok) {
    const error = new ApiError(
      response.status,
      response.statusText,
      await parseDetail(response),
    );
    options.onError?.(error);
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const error = new NetworkError("No response body available for SSE streaming");
    options.onError?.(error);
    throw error;
  }
  options.onConnected?.();

  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventId = options.lastEventId;
  const seen = new Set<string>();
  if (options.lastEventId) {
    seen.add(options.lastEventId);
  }

  const consumeBlock = (block: string) => {
    if (!block.trim()) {
      return;
    }
    let eventName = "";
    let dataStr = "";
    let id = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataStr = line.slice(5).trim();
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      }
    }
    if (!dataStr) {
      return;
    }
    try {
      const parsed = JSON.parse(dataStr) as Record<string, unknown>;
      const event = projectEvent({
        ...parsed,
        event_type: parsed.event_type ?? eventName,
      });
      if (options.runId !== undefined && event.run_id !== options.runId) {
        options.onRejected?.(event);
        return;
      }
      const key = `${event.run_id}:${event.sequence_num}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      lastEventId = id || key;
      options.onLastEventId?.(lastEventId);
      options.onEvent?.(event);
      if (isStateChangingEvent(event.event_type)) {
        options.onStateChanging?.(event);
      }
    } catch {
      // ignore unparsable chunks
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        consumeBlock(block);
      }
    }
    if (buffer.trim()) {
      consumeBlock(buffer);
    }
  } catch (err) {
    if (options.signal?.aborted) {
      return lastEventId;
    }
    const error = new NetworkError("SSE streaming connection interrupted", err);
    options.onError?.(error);
    throw error;
  }

  return lastEventId;
}
