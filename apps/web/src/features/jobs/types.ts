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

export interface SourceSummary {
  source_id: string;
  source_name: string;
  application_url: string;
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
  primary_application_url: string | null;
}

export interface JobListItem extends JobCardBase {
  description_excerpt: string | null;
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
