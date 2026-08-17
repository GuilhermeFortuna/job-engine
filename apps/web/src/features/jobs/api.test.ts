import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ApiNotFoundError,
  ApiValidationError,
  NetworkError,
  fetchCatalogFilters,
  fetchCatalogHealth,
  fetchJobDetail,
  searchJobs,
} from "./api";
import { DEFAULT_SEARCH_PARAMS } from "./search-params";
import type { CatalogFilters, JobSearchResponse } from "./types";

describe("api client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("searchJobs", () => {
    it("fetches /api/v1/jobs with serialized query and parses JSON response", async () => {
      const mockResponse: JobSearchResponse = {
        items: [],
        page: 1,
        page_size: 25,
        total: 0,
        total_pages: 0,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const params = {
        ...DEFAULT_SEARCH_PARAMS,
        q: "python",
        role_family: ["backend" as const, "python" as const],
      };

      const result = await searchJobs(params);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/jobs?q=python&role_family=backend&role_family=python",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
          }),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws ApiValidationError on 422 with response details", async () => {
      const errorPayload = {
        detail: [
          {
            loc: ["query", "role_family"],
            msg: "Input should be a valid role family",
            type: "enum",
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => errorPayload,
      } as Response);

      await expect(searchJobs(DEFAULT_SEARCH_PARAMS)).rejects.toThrow(
        ApiValidationError,
      );
    });

    it("throws ApiError on non-2xx status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ detail: "Database connection failed" }),
      } as Response);

      await expect(searchJobs(DEFAULT_SEARCH_PARAMS)).rejects.toThrow(ApiError);
    });

    it("throws NetworkError on fetch rejection", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      await expect(searchJobs(DEFAULT_SEARCH_PARAMS)).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("fetchCatalogFilters", () => {
    it("fetches /api/v1/catalog/filters successfully", async () => {
      const mockFilters: CatalogFilters = {
        role_families: [{ id: "backend", label: "Backend" }],
        technologies: [{ value: "Python", label: "Python" }],
        remote_status: [{ value: "remote", label: "Remote" }],
        location_eligibility: [{ value: "brazil", label: "Brazil" }],
        seniority: [{ value: "senior", label: "Senior" }],
        posted_within: [{ value: "any", label: "Any time" }],
        sort: [{ value: "newest", label: "Newest" }],
        sources: [{ id: "himalayas", label: "Himalayas" }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockFilters,
      } as Response);

      const result = await fetchCatalogFilters();

      expect(global.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/catalog/filters",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
          }),
        }),
      );
      expect(result).toEqual(mockFilters);
    });

    it("throws NetworkError if catalog filters fetch fails", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network down"));

      await expect(fetchCatalogFilters()).rejects.toThrow(NetworkError);
    });
  });

  describe("fetchJobDetail", () => {
    it("fetches /api/v1/jobs/{id} successfully", async () => {
      const mockDetail = { id: "job-1", title: "Test Title" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockDetail,
      } as Response);

      const result = await fetchJobDetail("job-1");
      expect(global.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/jobs/job-1",
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: "application/json" }),
        }),
      );
      expect(result).toEqual(mockDetail);
    });

    it("throws ApiNotFoundError when backend returns 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ detail: "Job group not found" }),
      } as Response);

      await expect(fetchJobDetail("non-existent")).rejects.toThrow(
        ApiNotFoundError,
      );
    });
  });

  describe("fetchCatalogHealth", () => {
    it("fetches /api/v1/catalog/health successfully", async () => {
      const mockHealth = { catalog_last_seen_at: null, sources: [] };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHealth,
      } as Response);

      const result = await fetchCatalogHealth();
      expect(global.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/catalog/health",
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: "application/json" }),
        }),
      );
      expect(result).toEqual(mockHealth);
    });
  });
});
