import { getApiBaseUrl } from "@/lib/env";
import { serializeSearchParams } from "./search-params";
import type {
  CatalogFilters,
  CatalogHealth,
  JobDetail,
  JobSearchParams,
  JobSearchResponse,
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

export class ApiValidationError extends ApiError {
  constructor(statusText: string, detail?: unknown) {
    super(422, statusText, detail);
    this.name = "ApiValidationError";
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

export async function searchJobs(
  params: JobSearchParams,
  init?: RequestInit,
): Promise<JobSearchResponse> {
  const baseUrl = getApiBaseUrl();
  const query = serializeSearchParams(params).toString();
  const url = query ? `${baseUrl}/api/v1/jobs?${query}` : `${baseUrl}/api/v1/jobs`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError("Failed to reach Job Engine search API", err);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = undefined;
      }
    }

    if (response.status === 422) {
      throw new ApiValidationError(response.statusText, detail);
    }
    throw new ApiError(response.status, response.statusText, detail);
  }

  return (await response.json()) as JobSearchResponse;
}

export async function fetchCatalogFilters(
  init?: RequestInit,
): Promise<CatalogFilters> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1/catalog/filters`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError("Failed to fetch catalog filter vocabulary", err);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = undefined;
      }
    }
    throw new ApiError(response.status, response.statusText, detail);
  }

  return (await response.json()) as CatalogFilters;
}

export async function fetchJobDetail(
  jobGroupId: string,
  init?: RequestInit,
): Promise<JobDetail> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1/jobs/${encodeURIComponent(jobGroupId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError(`Failed to fetch job details for ${jobGroupId}`, err);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = undefined;
      }
    }

    if (response.status === 404) {
      throw new ApiNotFoundError(response.statusText, detail);
    }
    if (response.status === 422) {
      throw new ApiValidationError(response.statusText, detail);
    }
    throw new ApiError(response.status, response.statusText, detail);
  }

  return (await response.json()) as JobDetail;
}

export async function fetchCatalogHealth(
  init?: RequestInit,
): Promise<CatalogHealth> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1/catalog/health`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError("Failed to fetch catalog health status", err);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = undefined;
      }
    }
    throw new ApiError(response.status, response.statusText, detail);
  }

  return (await response.json()) as CatalogHealth;
}
