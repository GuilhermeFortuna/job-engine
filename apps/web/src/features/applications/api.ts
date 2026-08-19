import { getApiBaseUrl } from "@/lib/env";
import {
  SEMI_AUTO_MODE,
  isStateChangingEvent,
  summarizeChecksum,
  type ApplicationRunConflict,
  type ApplicationRunDetail,
  type ApplicationRunEvent,
  type ApplicationRunSummary,
  type CreateApplicationRunResponse,
  type EvidenceMetadata,
  type EvidenceType,
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
    status: asString(raw.status) as ApplicationRunSummary["status"],
    current_step: asNullableString(raw.current_step),
    current_checkpoint: asNullableString(raw.current_checkpoint),
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

export async function createApplicationRun(input: {
  jobGroupId: string;
  resumeId: string;
}): Promise<ApplicationRunSummary> {
  const url = `${getApiBaseUrl()}/api/v1/application-runs`;
  const response = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_group_ids: [input.jobGroupId],
      resume_id: input.resumeId,
      automation_mode: SEMI_AUTO_MODE,
    }),
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
  const created = body.created_runs[0];
  if (!created) {
    throw new ApiError(response.status, response.statusText, detail);
  }
  return created;
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

export async function fetchResumes(init?: RequestInit): Promise<SafeResume[]> {
  const url = `${getApiBaseUrl()}/api/v1/resumes`;
  const response = await fetchJson(url, init, "Failed to fetch registered resumes");
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { items?: unknown[] };
  const items = Array.isArray(raw.items) ? raw.items : [];
  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: asString(item.id),
      resume_id: asString(item.resume_id),
      label: asString(item.label),
      sha256: asString(item.sha256),
      checksum_summary: summarizeChecksum(asString(item.sha256)),
      language: asString(item.language),
      is_default: Boolean(item.is_default),
      file_size_bytes:
        typeof item.file_size_bytes === "number" ? item.file_size_bytes : null,
      version: typeof item.version === "number" ? item.version : 1,
    }));
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
  onEvent?: (event: ApplicationRunEvent) => void;
  onStateChanging?: (event: ApplicationRunEvent) => void;
  onRejected?: (event: ApplicationRunEvent) => void;
  onError?: (error: Error) => void;
}

export async function streamApplicationRunEvents(options: {
  runId: string;
  lastEventId?: string;
  signal?: AbortSignal;
  onEvent?: (event: ApplicationRunEvent) => void;
  onStateChanging?: (event: ApplicationRunEvent) => void;
  onRejected?: (event: ApplicationRunEvent) => void;
  onError?: (error: Error) => void;
}): Promise<string | undefined> {
  const url = `${getApiBaseUrl()}/api/v1/application-runs/${encodeURIComponent(options.runId)}/events/stream`;
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
      if (event.run_id !== options.runId) {
        options.onRejected?.(event);
        return;
      }
      const key = `${event.run_id}:${event.sequence_num}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      lastEventId = id || key;
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
