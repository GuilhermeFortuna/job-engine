import type {
  CatalogFilters,
  JobSearchParams,
  LocationEligibilityFilter,
  PostedWithin,
  RemoteStatus,
  RoleFamilyId,
  Seniority,
  SortValue,
} from "./types";

export const VALID_ROLE_FAMILIES = new Set<RoleFamilyId>([
  "software_developer",
  "full_stack",
  "backend",
  "python",
  "frontend",
  "ai_application",
  "applied_ai",
]);

export const VALID_REMOTE_STATUSES = new Set<RemoteStatus>([
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);

export const VALID_LOCATION_ELIGIBILITY = new Set<LocationEligibilityFilter>([
  "brazil",
  "latin_america",
  "worldwide",
  "unknown",
]);

export const VALID_SENIORITIES = new Set<Seniority>([
  "internship",
  "junior",
  "mid",
  "senior",
  "lead_staff",
  "unknown",
]);

export const VALID_POSTED_WITHIN = new Set<PostedWithin>([
  "24h",
  "7d",
  "30d",
  "any",
]);

export const VALID_SORTS = new Set<SortValue>([
  "newest",
  "compensation_desc",
]);

export const DEFAULT_SEARCH_PARAMS: JobSearchParams = {
  role_family: [],
  technology: [],
  remote_status: [],
  location_eligibility: [],
  seniority: [],
  source: [],
  include_unknown_compensation: true,
  posted_within: "any",
  sort: "newest",
  page: 1,
  page_size: 25,
};

function toArray(
  raw: string | string[] | undefined | null,
): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

export function parseRawSearchParams(
  raw:
    | URLSearchParams
    | Record<string, string | string[] | undefined>
    | undefined
    | null,
): JobSearchParams {
  if (!raw) {
    return { ...DEFAULT_SEARCH_PARAMS };
  }

  let getParam: (key: string) => string | undefined;
  let getAllParams: (key: string) => string[];

  if (raw instanceof URLSearchParams) {
    getParam = (key: string) => raw.get(key) ?? undefined;
    getAllParams = (key: string) => raw.getAll(key);
  } else {
    getParam = (key: string) => {
      const val = raw[key];
      if (Array.isArray(val)) return val[0];
      return val;
    };
    getAllParams = (key: string) => toArray(raw[key]);
  }

  const rawQ = getParam("q")?.trim();
  const q = rawQ && rawQ.length > 0 ? rawQ : undefined;

  const role_family = getAllParams("role_family").filter(
    (item): item is RoleFamilyId => VALID_ROLE_FAMILIES.has(item as RoleFamilyId),
  );

  const technology = getAllParams("technology")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const remote_status = getAllParams("remote_status").filter(
    (item): item is RemoteStatus => VALID_REMOTE_STATUSES.has(item as RemoteStatus),
  );

  const location_eligibility = getAllParams("location_eligibility").filter(
    (item): item is LocationEligibilityFilter =>
      VALID_LOCATION_ELIGIBILITY.has(item as LocationEligibilityFilter),
  );

  const seniority = getAllParams("seniority").filter(
    (item): item is Seniority => VALID_SENIORITIES.has(item as Seniority),
  );

  const source = getAllParams("source")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const rawMinComp = getParam("minimum_annual_usd");
  let minimum_annual_usd: number | undefined;
  if (rawMinComp !== undefined && rawMinComp.trim().length > 0) {
    const num = Number(rawMinComp);
    if (!Number.isNaN(num) && num >= 0) {
      minimum_annual_usd = num;
    }
  }

  const rawIncludeUnknown = getParam("include_unknown_compensation");
  const include_unknown_compensation = rawIncludeUnknown?.toLowerCase() !== "false";

  const rawPostedWithin = getParam("posted_within") as PostedWithin;
  const posted_within = VALID_POSTED_WITHIN.has(rawPostedWithin)
    ? rawPostedWithin
    : "any";

  const rawSort = getParam("sort") as SortValue;
  const sort = VALID_SORTS.has(rawSort) ? rawSort : "newest";

  const rawPage = getParam("page");
  let page = 1;
  if (rawPage) {
    const parsedPage = parseInt(rawPage, 10);
    if (!Number.isNaN(parsedPage) && parsedPage >= 1) {
      page = parsedPage;
    }
  }

  const rawPageSize = getParam("page_size");
  let page_size = 25;
  if (rawPageSize) {
    const parsedPageSize = parseInt(rawPageSize, 10);
    if (!Number.isNaN(parsedPageSize) && parsedPageSize >= 1 && parsedPageSize <= 100) {
      page_size = parsedPageSize;
    }
  }

  return {
    q,
    role_family,
    technology,
    remote_status,
    location_eligibility,
    seniority,
    source,
    minimum_annual_usd,
    include_unknown_compensation,
    posted_within,
    sort,
    page,
    page_size,
  };
}

export function validateSearchParams(
  params: JobSearchParams,
  catalogFilters: CatalogFilters,
): JobSearchParams {
  const allowedTechs = new Set(catalogFilters.technologies.map((t) => t.value));
  const allowedSources = new Set(catalogFilters.sources.map((s) => s.id));
  const allowedRoleFamilies = new Set(catalogFilters.role_families.map((r) => r.id));

  return {
    ...params,
    technology: params.technology.filter((t) => allowedTechs.has(t)),
    source: params.source.filter((s) => allowedSources.has(s)),
    role_family: params.role_family.filter((rf) => allowedRoleFamilies.has(rf)),
  };
}

export function serializeSearchParams(
  params: Partial<JobSearchParams>,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.q && params.q.trim().length > 0) {
    searchParams.set("q", params.q.trim());
  }

  if (params.role_family) {
    for (const rf of params.role_family) {
      searchParams.append("role_family", rf);
    }
  }

  if (params.technology) {
    for (const tech of params.technology) {
      searchParams.append("technology", tech);
    }
  }

  if (params.remote_status) {
    for (const rs of params.remote_status) {
      searchParams.append("remote_status", rs);
    }
  }

  if (params.location_eligibility) {
    for (const le of params.location_eligibility) {
      searchParams.append("location_eligibility", le);
    }
  }

  if (params.seniority) {
    for (const sen of params.seniority) {
      searchParams.append("seniority", sen);
    }
  }

  if (params.source) {
    for (const src of params.source) {
      searchParams.append("source", src);
    }
  }

  if (
    params.minimum_annual_usd !== undefined &&
    params.minimum_annual_usd !== null &&
    params.minimum_annual_usd >= 0
  ) {
    searchParams.set("minimum_annual_usd", String(params.minimum_annual_usd));
  }

  if (params.include_unknown_compensation === false) {
    searchParams.set("include_unknown_compensation", "false");
  }

  if (params.posted_within && params.posted_within !== "any") {
    searchParams.set("posted_within", params.posted_within);
  }

  if (params.sort && params.sort !== "newest") {
    searchParams.set("sort", params.sort);
  }

  if (params.page && params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  if (params.page_size && params.page_size !== 25) {
    searchParams.set("page_size", String(params.page_size));
  }

  return searchParams;
}

export function buildSearchUrl(
  params: Partial<JobSearchParams>,
  basePath = "/jobs",
): string {
  const query = serializeSearchParams(params).toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function updateSearchParams(
  current: JobSearchParams,
  updates: Partial<JobSearchParams>,
  resetPage = true,
): JobSearchParams {
  const isPageOnlyChange =
    Object.keys(updates).length === 1 && "page" in updates;

  const targetPage = isPageOnlyChange
    ? updates.page ?? 1
    : resetPage
      ? 1
      : updates.page ?? current.page;

  return {
    ...current,
    ...updates,
    page: targetPage,
  };
}
