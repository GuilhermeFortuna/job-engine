import type {
  ApplicantProfileFieldName,
  ConfirmedField,
  SafeResume,
} from "@/features/applications/types";

export {
  APPLICANT_PROFILE_FIELD_NAMES,
  type ApplicantProfileFieldName,
  type ConfirmedField,
  type ReusableAnswer,
  type SafeResume,
} from "@/features/applications/types";

/** Server-persisted onboarding step identifiers (UI six-step flow). */
export const ONBOARDING_STEPS = [
  "profile",
  "resume",
  "review",
  "facts",
  "automation",
  "ready",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  profile: "Create applicant",
  resume: "Add resume",
  review: "Review extracted information",
  facts: "Application facts",
  automation: "Automation readiness",
  ready: "Readiness result",
};

export const PRODUCT_READINESS_LABELS = [
  "Ready for Auto Apply",
  "Ready with exceptions",
  "Setup required",
] as const;

export type ProductReadinessLabel = (typeof PRODUCT_READINESS_LABELS)[number];

export interface ProfileSummary {
  id: string;
  display_name: string;
  avatar_asset_id: string | null;
  onboarding_step: OnboardingStep | string;
  onboarding_completed_at: string | null;
  archived_at: string | null;
  automation_preferences: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface ProfileList {
  items: ProfileSummary[];
  active_profile_id: string | null;
}

export type ApplicantProfileFields = {
  [Name in ApplicantProfileFieldName]: ConfirmedField;
};

export interface ApplicantProfile extends ApplicantProfileFields {
  id: string;
  display_name: string;
  avatar_asset_id: string | null;
  onboarding_step: OnboardingStep | string;
  onboarding_completed_at: string | null;
  archived_at: string | null;
  automation_preferences: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileCreateInput {
  display_name: string;
  onboarding_step?: OnboardingStep | string;
  automation_preferences?: Record<string, unknown>;
}

export type ProfileUpdateInput = {
  expected_version: number;
  display_name?: string;
  onboarding_step?: OnboardingStep | string;
  onboarding_completed_at?: string | null;
  automation_preferences?: Record<string, unknown>;
} & Partial<ApplicantProfileFields>;

export interface AvatarCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManagedAsset {
  id: string;
  profile_id: string;
  asset_type: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  crop_coordinates: AvatarCrop | null;
  extracted_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileResume extends SafeResume {
  applicant_profile_id: string;
  managed_asset_id: string | null;
}

export interface SourceSpan {
  start: number;
  end: number;
  excerpt: string;
}

export interface ProposedField {
  field_path: string;
  value: unknown;
  evidence: SourceSpan[];
  confidence: number | null;
}

export interface LocalAiProposal {
  id: string;
  profile_id: string;
  source_asset_id: string;
  source_asset_sha256: string;
  status: string;
  schema_revision: string;
  prompt_revision: string;
  model: string;
  fields: ProposedField[];
  failure_code: string | null;
  deterministic_extraction_ok: boolean;
  accepted_field_paths: string[];
  created_at: string;
  updated_at: string;
}

export interface LocalAiStatus {
  configured: boolean;
  endpoint_class: "loopback_openai_compatible" | "none";
  model: string | null;
  reachable: boolean | null;
  model_available: boolean | null;
  schema_revision: string;
  last_self_test_passed: boolean | null;
  last_self_test_at: string | null;
  last_self_test_latency_ms: number | null;
  failure_code: string | null;
}

export interface LocalAiSelfTest {
  passed: boolean | null;
  model: string | null;
  schema_revision: string | null;
  prompt_revision: string | null;
  latency_ms: number | null;
  failure_code: string | null;
  tested_at: string | null;
}

export interface LocalAiReadiness {
  local_ai_configured: boolean;
  local_ai_ready: boolean;
  local_ai_failure_code: string | null;
  model: string | null;
  last_self_test_passed: boolean | null;
  exceptions: string[];
}

export interface ProductReadinessAction {
  id: string;
  label: string;
  href?: string;
}

export interface ProductReadiness {
  label: ProductReadinessLabel;
  actions: ProductReadinessAction[];
  blockers: string[];
  exceptions: string[];
}

export const SENSITIVE_FIELD_PATHS = [
  "work_authorizations",
  "compensation_expectation",
  "location_preferences",
  "demographics",
  "notice_period_days",
] as const;

export const REVIEWABLE_FIELD_PATHS = [
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
  "employment_history",
  "education_history",
  "skills",
  "languages",
  "certifications",
] as const;

export type ReviewableFieldPath = (typeof REVIEWABLE_FIELD_PATHS)[number];
