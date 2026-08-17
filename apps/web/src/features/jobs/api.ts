import { getApiBaseUrl } from "@/lib/env";
import { serializeSearchParams } from "./search-params";
import type {
  CatalogFilters,
  CatalogHealth,
  JobDetail,
  JobSearchParams,
  JobSearchResponse,
  SyncCompletedEvent,
  SyncSourceCompletedEvent,
  SyncSourceProgressEvent,
  SyncStartedEvent,
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

export class ApiCooldownError extends ApiError {
  readonly retryAfterSeconds: number;

  constructor(statusText: string, retryAfterSeconds: number, detail?: unknown) {
    super(429, statusText, detail);
    this.name = "ApiCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface StreamLiveSyncCallbacks {
  onStarted?: (event: SyncStartedEvent) => void;
  onSourceProgress?: (event: SyncSourceProgressEvent) => void;
  onSourceCompleted?: (event: SyncSourceCompletedEvent) => void;
  onCompleted?: (event: SyncCompletedEvent) => void;
  onError?: (error: Error) => void;
}

export async function streamLiveSync(
  callbacks: StreamLiveSyncCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1/catalog/live-sync`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        Accept: "text/event-stream",
      },
    });
  } catch (err) {
    if (signal?.aborted) return;
    const error = new NetworkError("Failed to initiate live sync", err);
    callbacks.onError?.(error);
    throw error;
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

    if (response.status === 429) {
      const retryHeader = response.headers.get("Retry-After");
      const retrySeconds = retryHeader ? parseInt(retryHeader, 10) : 30;
      const error = new ApiCooldownError(
        response.statusText,
        Number.isNaN(retrySeconds) ? 30 : retrySeconds,
        detail,
      );
      callbacks.onError?.(error);
      throw error;
    }

    const error = new ApiError(response.status, response.statusText, detail);
    callbacks.onError?.(error);
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const error = new NetworkError("No response body available for SSE streaming");
    callbacks.onError?.(error);
    throw error;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split("\n");
        let eventName = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
        }

        if (!eventName || !dataStr) continue;

        try {
          const parsedData = JSON.parse(dataStr);
          switch (eventName) {
            case "sync_started":
              callbacks.onStarted?.(parsedData as SyncStartedEvent);
              break;
            case "source_progress":
              callbacks.onSourceProgress?.(parsedData as SyncSourceProgressEvent);
              break;
            case "source_completed":
              callbacks.onSourceCompleted?.(parsedData as SyncSourceCompletedEvent);
              break;
            case "sync_completed":
              callbacks.onCompleted?.(parsedData as SyncCompletedEvent);
              break;
          }
        } catch {
          // ignore unparsable data chunks
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let eventName = "";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataStr = line.slice(5).trim();
        }
      }
      if (eventName && dataStr) {
        try {
          const parsedData = JSON.parse(dataStr);
          switch (eventName) {
            case "sync_started":
              callbacks.onStarted?.(parsedData as SyncStartedEvent);
              break;
            case "source_progress":
              callbacks.onSourceProgress?.(parsedData as SyncSourceProgressEvent);
              break;
            case "source_completed":
              callbacks.onSourceCompleted?.(parsedData as SyncSourceCompletedEvent);
              break;
            case "sync_completed":
              callbacks.onCompleted?.(parsedData as SyncCompletedEvent);
              break;
          }
        } catch {}
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    const error = new NetworkError("SSE streaming connection interrupted", err);
    callbacks.onError?.(error);
    throw error;
  }
}
