export const SEMI_AUTO_MODE = "semi_auto_pause_before_submit" as const;
export const FULL_AUTO_MODE = "full_auto" as const;

export type AutomationMode = typeof SEMI_AUTO_MODE | typeof FULL_AUTO_MODE;

export const FULL_AUTO_OWNER_CONFIRMATION =
  "Authorize automatic submission for these selected jobs" as const;

export type ApplicationRunStatus =
  | "queued"
  | "claimed"
  | "running"
  | "needs_input"
  | "paused_auth"
  | "failed_retryable"
  | "failed_final"
  | "submission_unknown"
  | "submitted"
  | "cancelled";

export type RunCheckpoint =
  | "form_discovered"
  | "profile_filled"
  | "questions_answered"
  | "resume_attached"
  | "submit_armed"
  | "submitting"
  | "submitted";

export type ExceptionType =
  | "missing_profile_field"
  | "unresolved_question"
  | "review_required"
  | "auth_required"
  | "captcha_required"
  | "semi_auto_armed"
  | "step_error";

export type ExceptionStatus = "pending" | "resolved" | "cancelled";

export type ControlType =
  | "text"
  | "textarea"
  | "single_select"
  | "multi_select"
  | "radio"
  | "checkbox"
  | "file";

export type FieldReportStatus =
  | "AUTO_FILL"
  | "AUTO_FILL_AND_SUBMIT"
  | "REVIEW_REQUIRED"
  | "DECLINE_OPTIONAL"
  | "ABSTAIN"
  | string;

export type QuestionIntent =
  | "work_authorization"
  | "sponsorship_required"
  | "notice_period"
  | "availability_date"
  | "compensation_expectation"
  | "location_preference"
  | "relocation"
  | "travel"
  | "gender"
  | "race_ethnicity"
  | "veteran_status"
  | "disability_status"
  | "legal_attestation"
  | "background_check_consent"
  | "arbitration_consent"
  | "privacy_consent"
  | "export_control"
  | "conflict_of_interest"
  | "signature"
  | "narrative";

export type EvidenceType = "screenshot" | "dom_snapshot" | "receipt" | "log";

export type AuditEventType =
  | "run_created"
  | "lease_claimed"
  | "lease_extended"
  | "lease_expired"
  | "lease_released"
  | "status_changed"
  | "checkpoint_reached"
  | "step_progress"
  | "exception_raised"
  | "exception_resolved"
  | "resume_asset_granted"
  | "resume_asset_retrieved"
  | "duplicate_override"
  | "submit_released"
  | "run_cancelled"
  | "run_completed";

export const STATE_CHANGING_EVENT_TYPES: ReadonlySet<string> = new Set([
  "status_changed",
  "checkpoint_reached",
  "step_progress",
  "exception_raised",
  "exception_resolved",
  "submit_released",
  "run_cancelled",
  "run_completed",
  "duplicate_override",
]);

export const RESOLVABLE_EXCEPTION_TYPES: ReadonlySet<ExceptionType> = new Set([
  "missing_profile_field",
  "unresolved_question",
  "review_required",
]);

export const FILLED_FIELD_STATUSES: ReadonlySet<string> = new Set([
  "AUTO_FILL",
  "AUTO_FILL_AND_SUBMIT",
  "DECLINE_OPTIONAL",
]);

export const REVIEW_FIELD_STATUSES: ReadonlySet<string> = new Set([
  "REVIEW_REQUIRED",
]);

export interface SafeFieldReport {
  field_fingerprint: string;
  label: string;
  control_type: ControlType;
  required: boolean;
  status: FieldReportStatus;
  reason_code: string | null;
  question_intent: QuestionIntent | null;
  options: string[];
  min_length: number | null;
  max_length: number | null;
  pattern: string | null;
  allow_save_to_answer_bank: boolean;
}

export interface SafeException {
  id: string;
  run_id: string;
  exception_type: ExceptionType;
  status: ExceptionStatus;
  field_reports: SafeFieldReport[];
  created_at: string;
  resolved_at: string | null;
}

export interface ApplicationRunReceipt {
  platform_adapter_id: string;
  final_url: string | null;
  platform_receipt_id: string | null;
  confirmation_signal: string;
  capture_timestamp: string;
  artifact_hash: string;
  summary_notes: string | null;
}

export interface EvidenceMetadata {
  id: string;
  run_id: string;
  attempt: number;
  evidence_type: EvidenceType;
  sha256: string;
  file_size_bytes: number | null;
  captured_at: string;
}

export interface ApplicationRunEvent {
  id: string;
  run_id: string;
  attempt: number;
  sequence_num: number;
  event_type: AuditEventType | string;
  created_at: string;
}

export interface ApplicationRunSummary {
  id: string;
  applicant_profile_id?: string;
  batch_id?: string;
  batch_item_id?: string;
  job_group_id: string;
  canonical_application_url: string;
  application_url: string;
  platform_adapter_id: string;
  resume_asset_id: string;
  resume_sha256: string;
  automation_mode: AutomationMode;
  automatic_submission_authorized_at: string | null;
  automatic_submission_authorized: boolean;
  status: ApplicationRunStatus;
  current_step: string | null;
  current_checkpoint: string | null;
  submit_attempted_at: string | null;
  terminal_reason: string | null;
  receipt_summary: ApplicationRunReceipt | null;
  policy_snapshot: {
    profile_version?: number;
    resume_id?: string;
    answer_bank_hash?: string;
  } | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ApplicationRunDetail extends ApplicationRunSummary {
  events: ApplicationRunEvent[];
  exceptions: SafeException[];
  evidence: EvidenceMetadata[];
}

export interface ApplicationRunConflict {
  job_group_id: string;
  canonical_application_url: string;
  existing_run_id: string;
  existing_status: ApplicationRunStatus;
  message: string;
}

export interface CreateApplicationRunResponse {
  created_runs: ApplicationRunSummary[];
  conflicts: ApplicationRunConflict[];
}

export interface CreateApplicationRunInput {
  application_target_ids: string[];
  resume_id: string;
  automation_mode: AutomationMode;
}

export interface ApplicationRunList {
  items: ApplicationRunSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApplicationRunListOptions {
  statuses?: ApplicationRunStatus[];
  modes?: AutomationMode[];
  job_group_id?: string;
  platform_adapter_id?: string;
  created_after?: string;
  created_before?: string;
  page?: number;
  page_size?: number;
}

export interface ResolveAnswerItem {
  field_fingerprint: string;
  answer_text: string;
  save_to_answer_bank: boolean;
  jurisdiction?: string | null;
  platform_scope?: string | null;
}

export interface SafeResume {
  id: string;
  resume_id: string;
  label: string;
  sha256: string;
  checksum_summary: string;
  language: string;
  is_default: boolean;
  file_size_bytes: number | null;
  last_verified_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ValueState = "unknown" | "provided" | "declined";
export type FieldSource = "owner" | "resume_import";
export type PolicyCategory =
  | "verified_profile"
  | "approved_reusable"
  | "grounded_generated"
  | "review_required"
  | "decline_optional"
  | "prohibited_automation";

export interface ConfirmedField<T = unknown> {
  state: ValueState;
  value: T | null;
  source: FieldSource | null;
  last_confirmed_at: string | null;
  policy_category: PolicyCategory;
}

export const APPLICANT_PROFILE_FIELD_NAMES = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "region",
  "country",
  "timezone",
  "headline",
  "summary",
  "portfolio_url",
  "linkedin_url",
  "github_url",
  "custom_urls",
  "notice_period_days",
  "employment_history",
  "education_history",
  "skills",
  "languages",
  "certifications",
  "work_authorizations",
  "compensation_expectation",
  "location_preferences",
  "demographics",
] as const;

export type ApplicantProfileFieldName =
  (typeof APPLICANT_PROFILE_FIELD_NAMES)[number];

export type ApplicantProfileFields = {
  [Name in ApplicantProfileFieldName]: ConfirmedField;
};

export interface ApplicantProfile extends ApplicantProfileFields {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ApplicantProfileUpdate = {
  expected_version: number | null;
} & ApplicantProfileFields;

export interface ResumeRegistrationInput {
  resume_id: string;
  label: string;
  source_markdown_path: string;
  upload_pdf_path: string;
  preview_html_path?: string | null;
  language?: string;
  is_default?: boolean;
}

export interface ResumeUpdateInput {
  expected_version: number;
  label?: string | null;
  is_default?: boolean | null;
  refresh_checksum?: boolean;
}

export interface ReusableAnswer {
  id: string;
  answer_id: string;
  question_intent: QuestionIntent;
  jurisdiction: string | null;
  platform_scope: string | null;
  answer_text: string;
  policy_category: PolicyCategory;
  provenance: string;
  last_confirmed_at: string;
  expires_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ReusableAnswerInput {
  answer_id: string;
  question_intent: QuestionIntent;
  jurisdiction?: string | null;
  platform_scope?: string | null;
  answer_text: string;
  policy_category: PolicyCategory;
  provenance?: string;
  last_confirmed_at: string;
  expires_at?: string | null;
}

export type ReusableAnswerUpdate = Omit<ReusableAnswerInput, "answer_id"> & {
  expected_version: number;
};

export interface AnswerBankFilters {
  question_intent?: QuestionIntent;
  jurisdiction?: string;
  platform_scope?: string;
}

export interface FieldCounts {
  filled: number;
  review: number;
  unresolved: number;
}

export function workspacePath(runId: string): string {
  return `/applications/${runId}/workspace`;
}

export function eventDedupeKey(runId: string, sequenceNum: number): string {
  return `${runId}:${sequenceNum}`;
}

export function isHttpsApplicationUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function summarizeChecksum(sha256: string): string {
  if (sha256.length < 12) {
    return sha256;
  }
  return `${sha256.slice(0, 8)}…${sha256.slice(-4)}`;
}

export function collectFieldReports(exceptions: SafeException[]): SafeFieldReport[] {
  return exceptions.flatMap((exception) => exception.field_reports);
}

export function countFieldReports(reports: SafeFieldReport[]): FieldCounts {
  return reports.reduce<FieldCounts>(
    (counts, report) => {
      if (FILLED_FIELD_STATUSES.has(report.status)) {
        counts.filled += 1;
      } else if (REVIEW_FIELD_STATUSES.has(report.status)) {
        counts.review += 1;
      } else {
        counts.unresolved += 1;
      }
      return counts;
    },
    { filled: 0, review: 0, unresolved: 0 },
  );
}

export function isResolvableException(exception: SafeException): boolean {
  return (
    exception.status === "pending" &&
    RESOLVABLE_EXCEPTION_TYPES.has(exception.exception_type)
  );
}

export function latestPendingException(
  exceptions: SafeException[],
): SafeException | undefined {
  return [...exceptions].reverse().find((exception) => exception.status === "pending");
}

export function requiredFieldsResolved(reports: SafeFieldReport[]): boolean {
  return reports
    .filter((report) => report.required)
    .every(
      (report) =>
        FILLED_FIELD_STATUSES.has(report.status) &&
        !REVIEW_FIELD_STATUSES.has(report.status),
    );
}

export function canReleaseSubmit(input: {
  status: ApplicationRunStatus;
  checkpoint: string | null;
  exceptions: SafeException[];
  openRunId: string | null;
  routeRunId: string;
}): boolean {
  const latest = latestPendingException(input.exceptions);
  const reports = collectFieldReports(input.exceptions);
  return (
    input.status === "needs_input" &&
    input.checkpoint === "submit_armed" &&
    latest?.exception_type === "semi_auto_armed" &&
    requiredFieldsResolved(reports) &&
    input.openRunId === input.routeRunId
  );
}

export function isStateChangingEvent(eventType: string): boolean {
  return STATE_CHANGING_EVENT_TYPES.has(eventType);
}
