export type RoleFamilyId =
  | "software_developer"
  | "full_stack"
  | "backend"
  | "python"
  | "frontend"
  | "ai_application"
  | "applied_ai";

export type RemoteStatus = "remote" | "hybrid" | "onsite" | "unknown";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship"
  | "unknown";

export type Seniority =
  | "internship"
  | "junior"
  | "mid"
  | "senior"
  | "lead_staff"
  | "unknown";

export type LocationEligibilityRegion =
  | "brazil"
  | "latin_america"
  | "worldwide";

export type LocationEligibilityFilter =
  | "brazil"
  | "latin_america"
  | "worldwide"
  | "unknown";

export type PostedWithin = "24h" | "7d" | "30d" | "any";
export type SortValue = "newest" | "compensation_desc";

export interface Compensation {
  original_text: string | null;
  currency: string | null;
  period: string | null;
  minimum: string | null;
  maximum: string | null;
  annual_usd_minimum: string | null;
  annual_usd_maximum: string | null;
}

export interface LocationEligibilityRegionItem {
  region: LocationEligibilityRegion;
  evidence_text: string | null;
}

export interface LocationEligibility {
  unknown: boolean;
  regions: LocationEligibilityRegionItem[];
}

export interface Technology {
  term: string;
  source_text: string | null;
}

export type ApplicationTargetStatus =
  | "executable"
  | "assisted"
  | "external"
  | "unresolved";

export interface ApplicationTargetSummary {
  id: string;
  target_url: string;
  provider: string | null;
  desktop_adapter_id: string | null;
  status: ApplicationTargetStatus;
  resolution_method: string;
  verified_at: string | null;
  assisted_reason: string | null;
}

export interface PreferredApplicationTarget {
  id: string | null;
  target_url: string | null;
  listing_url: string | null;
  provider: string | null;
  desktop_adapter_id: string | null;
  status: ApplicationTargetStatus;
  resolution_method: string | null;
  verified_at: string | null;
  source_posting_id: string | null;
  assisted_reason: string | null;
}

export interface SourceSummary {
  source_id: string;
  source_name: string;
  listing_url: string;
  application_target: ApplicationTargetSummary | null;
}

export interface JobCardBase {
  id: string;
  title: string;
  title_original: string;
  company: string;
  company_original: string;
  location_original: string | null;
  location_normalized_country: string | null;
  location_normalized_region: string | null;
  remote_status: RemoteStatus;
  location_eligibility: LocationEligibility;
  seniority: Seniority;
  seniority_original: string | null;
  employment_type: EmploymentType;
  compensation: Compensation;
  technologies: Technology[];
  role_families: RoleFamilyId[];
  published_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  sources: SourceSummary[];
  preferred_application_target: PreferredApplicationTarget;
}

export type JobStatus = "active" | "stale" | "closed" | "unknown";

export type LatestRunStatus =
  | "never_run"
  | "running"
  | "success"
  | "partial_success"
  | "failure";

export interface JobListItem extends JobCardBase {
  description_excerpt: string | null;
}

export interface SourcePostingDetail {
  id: string;
  source_id: string;
  source_posting_id: string;
  source_name: string;
  listing_url: string;
  application_target: ApplicationTargetSummary | null;
  title_original: string;
  company_original: string;
  description: string | null;
  location_original: string | null;
  remote_status: RemoteStatus;
  employment_type: EmploymentType;
  seniority: Seniority;
  seniority_original: string | null;
  compensation: Compensation;
  technologies_original_text: string | null;
  location_eligibility_evidence: string | null;
  published_at: string | null;
  source_timestamp: string | null;
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string | null;
  status: JobStatus;
  adapter_version: string | null;
  linked_at: string;
}

export interface JobDetail extends JobCardBase {
  description: string | null;
  status: JobStatus;
  closed_at: string | null;
  source_postings: SourcePostingDetail[];
}

export interface SourceHealth {
  source_id: string;
  latest_run_status: LatestRunStatus;
  latest_run_started_at: string | null;
  latest_run_completed_at: string | null;
  fetched_count: number | null;
  accepted_count: number | null;
  rejected_count: number | null;
}

export interface CatalogHealth {
  catalog_last_seen_at: string | null;
  sources: SourceHealth[];
}

export interface JobSearchResponse {
  items: JobListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface RoleFamilyOption {
  id: RoleFamilyId;
  label: string;
}

export interface SourceOption {
  id: string;
  label: string;
}

export interface CatalogFilters {
  role_families: RoleFamilyOption[];
  technologies: FilterOption[];
  remote_status: FilterOption[];
  location_eligibility: FilterOption[];
  seniority: FilterOption[];
  posted_within: FilterOption[];
  sort: FilterOption[];
  sources: SourceOption[];
}

export interface JobSearchParams {
  q?: string;
  role_family: RoleFamilyId[];
  technology: string[];
  remote_status: RemoteStatus[];
  location_eligibility: LocationEligibilityFilter[];
  seniority: Seniority[];
  source: string[];
  minimum_annual_usd?: number;
  include_unknown_compensation: boolean;
  posted_within: PostedWithin;
  sort: SortValue;
  page: number;
  page_size: number;
}

export type SyncStage = "fetching" | "normalizing" | "persisting";
export type SyncSourceStatus = "success" | "partial_success" | "failure";

export interface SyncStartedEvent {
  sources: string[];
  started_at: string;
}

export interface SyncSourceProgressEvent {
  source_id: string;
  stage: SyncStage;
  fetched_count: number;
  accepted_count: number;
  rejected_count: number;
}

export interface SyncErrorSummary {
  code: string;
  message: string;
}

export interface SyncSourceCompletedEvent {
  source_id: string;
  status: SyncSourceStatus;
  inserted_count: number;
  updated_count: number;
  marked_stale_count: number;
  error_summaries: SyncErrorSummary[];
}

export interface SyncCompletedEvent {
  status: SyncSourceStatus;
  total_inserted: number;
  total_updated: number;
  total_stale: number;
  completed_at: string;
}

export interface SourceLiveState {
  source_id: string;
  stage: SyncStage | "idle";
  status?: SyncSourceStatus;
  fetched_count: number;
  accepted_count: number;
  rejected_count: number;
  inserted_count: number;
  updated_count: number;
  marked_stale_count: number;
  error_summaries: SyncErrorSummary[];
}

export type LiveSyncStatus =
  | "idle"
  | "connecting"
  | "syncing"
  | "completed"
  | "error"
  | "cooldown";

export interface LiveSyncState {
  status: LiveSyncStatus;
  sources: Record<string, SourceLiveState>;
  total_inserted: number;
  total_updated: number;
  total_stale: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  cooldown_remaining_seconds: number | null;
}
