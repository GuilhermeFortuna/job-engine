import { getApiBaseUrl } from "@/lib/env";
import {
  APPLICANT_PROFILE_FIELD_NAMES,
  summarizeChecksum,
  type AnswerBankFilters,
  type ConfirmedField,
  type ReusableAnswer,
  type ReusableAnswerInput,
  type ReusableAnswerUpdate,
} from "@/features/applications/types";
import type {
  ApplicantProfile,
  AvatarCrop,
  LocalAiProposal,
  LocalAiReadiness,
  LocalAiSelfTest,
  LocalAiStatus,
  ManagedAsset,
  OnboardingStep,
  ProfileCreateInput,
  ProfileList,
  ProfileResume,
  ProfileSummary,
  ProfileUpdateInput,
  ProposedField,
  SourceSpan,
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

function projectAvatarCrop(raw: unknown): AvatarCrop | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    x: asNumber(raw.x),
    y: asNumber(raw.y),
    width: asNumber(raw.width, 1),
    height: asNumber(raw.height, 1),
  };
}

function projectManagedAsset(raw: Record<string, unknown>): ManagedAsset {
  return {
    id: asString(raw.id),
    profile_id: asString(raw.profile_id),
    asset_type: asString(raw.asset_type),
    file_name: asString(raw.file_name),
    content_type: asString(raw.content_type),
    byte_size: asNumber(raw.byte_size),
    sha256: asString(raw.sha256),
    crop_coordinates: projectAvatarCrop(raw.crop_coordinates),
    extracted_text: asNullableString(raw.extracted_text),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
  };
}

function projectProfileSummary(raw: Record<string, unknown>): ProfileSummary {
  return {
    id: asString(raw.id),
    display_name: asString(raw.display_name),
    avatar_asset_id: asNullableString(raw.avatar_asset_id),
    onboarding_step: asString(raw.onboarding_step || "profile"),
    onboarding_completed_at: asNullableString(raw.onboarding_completed_at),
    archived_at: asNullableString(raw.archived_at),
    automation_preferences: isRecord(raw.automation_preferences)
      ? raw.automation_preferences
      : {},
    version: asNumber(raw.version, 1),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
    is_active: Boolean(raw.is_active),
  };
}

export function projectApplicantProfile(
  raw: Record<string, unknown>,
): ApplicantProfile {
  const fields = Object.fromEntries(
    APPLICANT_PROFILE_FIELD_NAMES.map((name) => [
      name,
      projectConfirmedField(raw[name]),
    ]),
  ) as Pick<ApplicantProfile, (typeof APPLICANT_PROFILE_FIELD_NAMES)[number]>;
  return {
    id: asString(raw.id),
    display_name: asString(raw.display_name || "Applicant"),
    avatar_asset_id: asNullableString(raw.avatar_asset_id),
    onboarding_step: asString(raw.onboarding_step || "profile"),
    onboarding_completed_at: asNullableString(raw.onboarding_completed_at),
    archived_at: asNullableString(raw.archived_at),
    automation_preferences: isRecord(raw.automation_preferences)
      ? raw.automation_preferences
      : {},
    version: asNumber(raw.version, 1),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
    ...fields,
  };
}

function projectResume(raw: Record<string, unknown>): ProfileResume {
  const sha256 = asString(raw.sha256);
  return {
    id: asString(raw.id),
    applicant_profile_id: asString(raw.applicant_profile_id),
    managed_asset_id: asNullableString(raw.managed_asset_id),
    resume_id: asString(raw.resume_id),
    label: asString(raw.label),
    sha256,
    checksum_summary: summarizeChecksum(sha256),
    language: asString(raw.language || "en"),
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

function projectSourceSpan(raw: unknown): SourceSpan {
  const span = isRecord(raw) ? raw : {};
  return {
    start: asNumber(span.start),
    end: asNumber(span.end),
    excerpt: asString(span.excerpt),
  };
}

function projectProposedField(raw: unknown): ProposedField {
  const field = isRecord(raw) ? raw : {};
  const evidence = Array.isArray(field.evidence) ? field.evidence : [];
  return {
    field_path: asString(field.field_path),
    value: field.value ?? null,
    evidence: evidence.map(projectSourceSpan),
    confidence: typeof field.confidence === "number" ? field.confidence : null,
  };
}

function projectProposal(raw: Record<string, unknown>): LocalAiProposal {
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  const accepted = Array.isArray(raw.accepted_field_paths)
    ? raw.accepted_field_paths
    : [];
  return {
    id: asString(raw.id),
    profile_id: asString(raw.profile_id),
    source_asset_id: asString(raw.source_asset_id),
    source_asset_sha256: asString(raw.source_asset_sha256),
    status: asString(raw.status),
    schema_revision: asString(raw.schema_revision),
    prompt_revision: asString(raw.prompt_revision),
    model: asString(raw.model),
    fields: fields.map(projectProposedField),
    failure_code: asNullableString(raw.failure_code),
    deterministic_extraction_ok: raw.deterministic_extraction_ok !== false,
    accepted_field_paths: accepted.filter(
      (path): path is string => typeof path === "string",
    ),
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

function profilesBase(): string {
  return `${getApiBaseUrl()}/api/v1/profiles`;
}

export async function fetchProfiles(
  init?: RequestInit,
): Promise<ProfileList> {
  const response = await fetchJson(
    profilesBase(),
    init,
    "Failed to fetch profiles",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as {
    items?: unknown[];
    active_profile_id?: string | null;
  };
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter(isRecord)
    .map(projectProfileSummary);
  return {
    items,
    active_profile_id: asNullableString(raw.active_profile_id),
  };
}

export async function fetchActiveProfile(
  init?: RequestInit,
): Promise<ApplicantProfile> {
  return requestProjectedJson(
    `${profilesBase()}/active`,
    init,
    "Failed to fetch active profile",
    projectApplicantProfile,
  );
}

export async function setActiveProfile(
  profileId: string,
): Promise<{ status: string; active_profile_id: string }> {
  const response = await fetchJson(
    `${profilesBase()}/active`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId }),
    },
    "Failed to set active profile",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as Record<string, unknown>;
  return {
    status: asString(raw.status || "ok"),
    active_profile_id: asString(raw.active_profile_id),
  };
}

export async function createProfile(
  input: ProfileCreateInput,
): Promise<ApplicantProfile> {
  return requestProjectedJson(
    profilesBase(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: input.display_name,
        onboarding_step: input.onboarding_step ?? "profile",
        automation_preferences: input.automation_preferences ?? {},
      }),
    },
    "Failed to create profile",
    projectApplicantProfile,
  );
}

export async function fetchProfile(
  profileId: string,
  init?: RequestInit,
): Promise<ApplicantProfile> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}`,
    init,
    `Failed to fetch profile ${profileId}`,
    projectApplicantProfile,
  );
}

export async function updateProfile(
  profileId: string,
  input: ProfileUpdateInput,
): Promise<ApplicantProfile> {
  const body: Record<string, unknown> = {
    expected_version: input.expected_version,
  };
  if (input.display_name !== undefined) {
    body.display_name = input.display_name;
  }
  if (input.onboarding_step !== undefined) {
    body.onboarding_step = input.onboarding_step;
  }
  if (input.onboarding_completed_at !== undefined) {
    body.onboarding_completed_at = input.onboarding_completed_at;
  }
  if (input.automation_preferences !== undefined) {
    body.automation_preferences = input.automation_preferences;
  }
  for (const name of APPLICANT_PROFILE_FIELD_NAMES) {
    if (Object.hasOwn(input, name) && input[name] !== undefined) {
      body[name] = input[name];
    }
  }
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    `Failed to update profile ${profileId}`,
    projectApplicantProfile,
  );
}

export async function advanceOnboardingStep(
  profileId: string,
  expectedVersion: number,
  step: OnboardingStep,
  completed = false,
): Promise<ApplicantProfile> {
  return updateProfile(profileId, {
    expected_version: expectedVersion,
    onboarding_step: step,
    onboarding_completed_at: completed ? new Date().toISOString() : null,
  });
}

export async function fetchProfileResumes(
  profileId: string,
  init?: RequestInit,
): Promise<ProfileResume[]> {
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/resumes`,
    init,
    "Failed to fetch resumes",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { items?: unknown[] };
  return (Array.isArray(raw.items) ? raw.items : [])
    .filter(isRecord)
    .map(projectResume);
}

export async function uploadResume(
  profileId: string,
  file: File,
  options: { label?: string; isDefault?: boolean } = {},
): Promise<ProfileResume> {
  const form = new FormData();
  form.append("file", file);
  if (options.label) {
    form.append("label", options.label);
  }
  if (options.isDefault) {
    form.append("is_default", "true");
  }
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/resumes`,
    { method: "POST", body: form },
    "Failed to upload resume",
    projectResume,
  );
}

export async function updateProfileResume(
  profileId: string,
  resumeId: string,
  input: {
    expected_version: number;
    label?: string | null;
    is_default?: boolean | null;
  },
): Promise<ProfileResume> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/resumes/${encodeURIComponent(resumeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    `Failed to update resume ${resumeId}`,
    projectResume,
  );
}

export async function deleteProfileResume(
  profileId: string,
  resumeId: string,
  expectedVersion: number,
): Promise<void> {
  const query = new URLSearchParams({
    expected_version: String(expectedVersion),
  });
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/resumes/${encodeURIComponent(resumeId)}?${query}`,
    { method: "DELETE" },
    `Failed to delete resume ${resumeId}`,
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
}

export async function fetchProfileDocuments(
  profileId: string,
  init?: RequestInit,
): Promise<ManagedAsset[]> {
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/documents`,
    init,
    "Failed to fetch documents",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { items?: unknown[] };
  return (Array.isArray(raw.items) ? raw.items : [])
    .filter(isRecord)
    .map(projectManagedAsset);
}

export async function uploadDocument(
  profileId: string,
  file: File,
): Promise<ManagedAsset> {
  const form = new FormData();
  form.append("file", file);
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/documents`,
    { method: "POST", body: form },
    "Failed to upload document",
    projectManagedAsset,
  );
}

export async function fetchAvatar(
  profileId: string,
  init?: RequestInit,
): Promise<ManagedAsset | null> {
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/avatar`,
    init,
    "Failed to fetch avatar",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { asset?: unknown };
  return isRecord(raw.asset) ? projectManagedAsset(raw.asset) : null;
}

export async function uploadAvatar(
  profileId: string,
  file: File,
  crop?: AvatarCrop,
): Promise<ManagedAsset | null> {
  const form = new FormData();
  form.append("file", file);
  if (crop) {
    form.append("crop_x", String(crop.x));
    form.append("crop_y", String(crop.y));
    form.append("crop_width", String(crop.width));
    form.append("crop_height", String(crop.height));
  }
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/avatar`,
    { method: "POST", body: form },
    "Failed to upload avatar",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { asset?: unknown };
  return isRecord(raw.asset) ? projectManagedAsset(raw.asset) : null;
}

export async function updateAvatarCrop(
  profileId: string,
  crop: AvatarCrop,
): Promise<ManagedAsset | null> {
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/avatar/crop`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(crop),
    },
    "Failed to update avatar crop",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as { asset?: unknown };
  return isRecord(raw.asset) ? projectManagedAsset(raw.asset) : null;
}

export async function deleteAvatar(profileId: string): Promise<void> {
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/avatar`,
    { method: "DELETE" },
    "Failed to remove avatar",
  );
  if (!response.ok && response.status !== 204) {
    throwForStatus(response, await parseDetail(response));
  }
}

export function assetContentUrl(
  profileId: string,
  assetId: string,
): string {
  return `${profilesBase()}/${encodeURIComponent(profileId)}/assets/${encodeURIComponent(assetId)}/content`;
}

export async function fetchAnswerBank(
  profileId: string,
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
    `${profilesBase()}/${encodeURIComponent(profileId)}/answer-bank${suffix}`,
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
  profileId: string,
  input: ReusableAnswerInput,
): Promise<ReusableAnswer> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/answer-bank`,
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
  profileId: string,
  answerId: string,
  input: ReusableAnswerUpdate,
): Promise<ReusableAnswer> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/answer-bank/${encodeURIComponent(answerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    `Failed to update answer ${answerId}`,
    projectAnswer,
  );
}

export async function deleteAnswer(
  profileId: string,
  answerId: string,
  expectedVersion: number,
): Promise<void> {
  const query = new URLSearchParams({
    expected_version: String(expectedVersion),
  });
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/answer-bank/${encodeURIComponent(answerId)}?${query}`,
    { method: "DELETE" },
    `Failed to delete answer ${answerId}`,
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
}

export async function fetchLocalAiStatus(
  init?: RequestInit,
): Promise<LocalAiStatus> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/local-ai/status`,
    init,
    "Failed to fetch local AI status",
    (raw) => ({
      configured: Boolean(raw.configured),
      endpoint_class:
        raw.endpoint_class === "loopback_openai_compatible"
          ? "loopback_openai_compatible"
          : "none",
      model: asNullableString(raw.model),
      reachable: typeof raw.reachable === "boolean" ? raw.reachable : null,
      model_available:
        typeof raw.model_available === "boolean" ? raw.model_available : null,
      schema_revision: asString(raw.schema_revision),
      last_self_test_passed:
        typeof raw.last_self_test_passed === "boolean"
          ? raw.last_self_test_passed
          : null,
      last_self_test_at: asNullableString(raw.last_self_test_at),
      last_self_test_latency_ms:
        typeof raw.last_self_test_latency_ms === "number"
          ? raw.last_self_test_latency_ms
          : null,
      failure_code: asNullableString(raw.failure_code),
    }),
  );
}

export async function runLocalAiSelfTest(): Promise<LocalAiSelfTest> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/local-ai/self-test`,
    { method: "POST" },
    "Failed to run local AI self-test",
    (raw) => ({
      passed: typeof raw.passed === "boolean" ? raw.passed : null,
      model: asNullableString(raw.model),
      schema_revision: asNullableString(raw.schema_revision),
      prompt_revision: asNullableString(raw.prompt_revision),
      latency_ms: typeof raw.latency_ms === "number" ? raw.latency_ms : null,
      failure_code: asNullableString(raw.failure_code),
      tested_at: asNullableString(raw.tested_at),
    }),
  );
}

export async function fetchLocalAiReadiness(
  init?: RequestInit,
): Promise<LocalAiReadiness> {
  return requestProjectedJson(
    `${getApiBaseUrl()}/api/v1/local-ai/readiness`,
    init,
    "Failed to fetch local AI readiness",
    (raw) => ({
      local_ai_configured: Boolean(raw.local_ai_configured),
      local_ai_ready: Boolean(raw.local_ai_ready),
      local_ai_failure_code: asNullableString(raw.local_ai_failure_code),
      model: asNullableString(raw.model),
      last_self_test_passed:
        typeof raw.last_self_test_passed === "boolean"
          ? raw.last_self_test_passed
          : null,
      exceptions: Array.isArray(raw.exceptions)
        ? raw.exceptions.filter((item): item is string => typeof item === "string")
        : [],
    }),
  );
}

export async function createResumeProposals(
  profileId: string,
  sourceAssetId: string,
): Promise<LocalAiProposal> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/local-ai/resume-proposals`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_asset_id: sourceAssetId }),
    },
    "Failed to create resume proposals",
    projectProposal,
  );
}

export async function fetchResumeProposal(
  profileId: string,
  proposalId: string,
  init?: RequestInit,
): Promise<LocalAiProposal> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/local-ai/resume-proposals/${encodeURIComponent(proposalId)}`,
    init,
    "Failed to fetch resume proposal",
    projectProposal,
  );
}

export async function acceptResumeProposal(
  profileId: string,
  proposalId: string,
  input: {
    accepted_field_paths: string[];
    field_edits?: Record<string, unknown> | null;
    expected_profile_version: number;
    decline_remaining?: boolean;
  },
): Promise<{ proposal: LocalAiProposal; profile: ApplicantProfile }> {
  const response = await fetchJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/local-ai/resume-proposals/${encodeURIComponent(proposalId)}/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accepted_field_paths: input.accepted_field_paths,
        field_edits: input.field_edits ?? null,
        expected_profile_version: input.expected_profile_version,
        decline_remaining: input.decline_remaining ?? true,
      }),
    },
    "Failed to accept resume proposal",
  );
  if (!response.ok) {
    throwForStatus(response, await parseDetail(response));
  }
  const raw = (await response.json()) as Record<string, unknown>;
  return {
    proposal: projectProposal(
      isRecord(raw.proposal) ? raw.proposal : {},
    ),
    profile: projectApplicantProfile(
      isRecord(raw.profile) ? raw.profile : {},
    ),
  };
}

export async function declineResumeProposal(
  profileId: string,
  proposalId: string,
  expectedProfileVersion: number,
): Promise<LocalAiProposal> {
  return requestProjectedJson(
    `${profilesBase()}/${encodeURIComponent(profileId)}/local-ai/resume-proposals/${encodeURIComponent(proposalId)}/decline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_profile_version: expectedProfileVersion,
      }),
    },
    "Failed to decline resume proposal",
    projectProposal,
  );
}

/** Sanitize API failures for user-visible copy — never leak paths or payloads. */
export function sanitizedErrorMessage(_error?: unknown): string {
  void _error;
  return "Something went wrong. Please try again.";
}
