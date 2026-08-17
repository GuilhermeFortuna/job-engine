import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_PARAMS,
  buildSearchUrl,
  parseRawSearchParams,
  serializeSearchParams,
  updateSearchParams,
  validateSearchParams,
} from "./search-params";
import type { CatalogFilters, JobSearchParams } from "./types";

const mockCatalogFilters: CatalogFilters = {
  role_families: [
    { id: "software_developer", label: "Software developer" },
    { id: "backend", label: "Backend" },
    { id: "python", label: "Python" },
  ],
  technologies: [
    { value: "Python", label: "Python" },
    { value: "React", label: "React" },
    { value: "FastAPI", label: "FastAPI" },
  ],
  remote_status: [
    { value: "remote", label: "Remote" },
    { value: "hybrid", label: "Hybrid" },
  ],
  location_eligibility: [
    { value: "brazil", label: "Brazil" },
    { value: "worldwide", label: "Worldwide" },
  ],
  seniority: [
    { value: "mid", label: "Mid" },
    { value: "senior", label: "Senior" },
  ],
  posted_within: [
    { value: "24h", label: "Past 24 hours" },
    { value: "any", label: "Any time" },
  ],
  sort: [
    { value: "newest", label: "Newest" },
    { value: "compensation_desc", label: "Compensation (high to low)" },
  ],
  sources: [
    { id: "himalayas", label: "Himalayas" },
    { id: "jobicy", label: "Jobicy" },
  ],
};

describe("search-params", () => {
  describe("parseRawSearchParams", () => {
    it("returns default values when given null, undefined, or empty query", () => {
      expect(parseRawSearchParams(undefined)).toEqual(DEFAULT_SEARCH_PARAMS);
      expect(parseRawSearchParams(null)).toEqual(DEFAULT_SEARCH_PARAMS);
      expect(parseRawSearchParams({})).toEqual(DEFAULT_SEARCH_PARAMS);
      expect(parseRawSearchParams(new URLSearchParams())).toEqual(
        DEFAULT_SEARCH_PARAMS,
      );
    });

    it("parses single and repeated multi-select parameters from URLSearchParams", () => {
      const urlParams = new URLSearchParams();
      urlParams.append("role_family", "backend");
      urlParams.append("role_family", "python");
      urlParams.append("technology", "Python");
      urlParams.append("technology", "FastAPI");
      urlParams.append("remote_status", "remote");
      urlParams.append("location_eligibility", "brazil");
      urlParams.append("seniority", "senior");
      urlParams.append("source", "himalayas");
      urlParams.set("q", "engineer");
      urlParams.set("minimum_annual_usd", "80000");
      urlParams.set("posted_within", "7d");
      urlParams.set("sort", "compensation_desc");
      urlParams.set("page", "2");
      urlParams.set("page_size", "50");

      const parsed = parseRawSearchParams(urlParams);
      expect(parsed).toEqual({
        q: "engineer",
        role_family: ["backend", "python"],
        technology: ["Python", "FastAPI"],
        remote_status: ["remote"],
        location_eligibility: ["brazil"],
        seniority: ["senior"],
        source: ["himalayas"],
        minimum_annual_usd: 80000,
        include_unknown_compensation: true,
        posted_within: "7d",
        sort: "compensation_desc",
        page: 2,
        page_size: 50,
      });
    });

    it("parses from plain record with arrays and strings", () => {
      const record = {
        role_family: ["frontend", "backend"],
        technology: "React",
        q: "  staff developer  ",
        include_unknown_compensation: "false",
        page: "3",
      };

      const parsed = parseRawSearchParams(record);
      expect(parsed.role_family).toEqual(["frontend", "backend"]);
      expect(parsed.technology).toEqual(["React"]);
      expect(parsed.q).toBe("staff developer");
      expect(parsed.include_unknown_compensation).toBe(false);
      expect(parsed.page).toBe(3);
    });

    it("discards invalid static enums and handles malformed numbers", () => {
      const record = {
        role_family: ["backend", "invalid_family" as never],
        remote_status: ["remote", "space" as never],
        location_eligibility: ["antarctica" as never],
        seniority: ["god_tier" as never],
        posted_within: "100y" as never,
        sort: "random" as never,
        minimum_annual_usd: "-500",
        page: "-1",
        page_size: "999",
      };

      const parsed = parseRawSearchParams(record);
      expect(parsed.role_family).toEqual(["backend"]);
      expect(parsed.remote_status).toEqual(["remote"]);
      expect(parsed.location_eligibility).toEqual([]);
      expect(parsed.seniority).toEqual([]);
      expect(parsed.posted_within).toBe("any");
      expect(parsed.sort).toBe("newest");
      expect(parsed.minimum_annual_usd).toBeUndefined();
      expect(parsed.page).toBe(1);
      expect(parsed.page_size).toBe(25);
    });

    it("handles explicit include_unknown_compensation=false vs true", () => {
      expect(
        parseRawSearchParams({ include_unknown_compensation: "false" })
          .include_unknown_compensation,
      ).toBe(false);
      expect(
        parseRawSearchParams({ include_unknown_compensation: "False" })
          .include_unknown_compensation,
      ).toBe(false);
      expect(
        parseRawSearchParams({ include_unknown_compensation: "true" })
          .include_unknown_compensation,
      ).toBe(true);
      expect(
        parseRawSearchParams({}).include_unknown_compensation,
      ).toBe(true);
    });
  });

  describe("validateSearchParams", () => {
    it("prunes technology, source, and role_family not in catalog filters", () => {
      const raw: JobSearchParams = {
        ...DEFAULT_SEARCH_PARAMS,
        role_family: ["backend", "ai_application"],
        technology: ["Python", "Rust", "Go"],
        source: ["himalayas", "unknown_feed"],
      };

      const validated = validateSearchParams(raw, mockCatalogFilters);
      expect(validated.role_family).toEqual(["backend"]);
      expect(validated.technology).toEqual(["Python"]);
      expect(validated.source).toEqual(["himalayas"]);
    });
  });

  describe("serializeSearchParams and buildSearchUrl", () => {
    it("serializes multi-select using repeated keys", () => {
      const params: Partial<JobSearchParams> = {
        role_family: ["backend", "python"],
        technology: ["Python", "React"],
        source: ["himalayas", "jobicy"],
      };

      const serialized = serializeSearchParams(params);
      expect(serialized.getAll("role_family")).toEqual(["backend", "python"]);
      expect(serialized.getAll("technology")).toEqual(["Python", "React"]);
      expect(serialized.getAll("source")).toEqual(["himalayas", "jobicy"]);
      expect(serialized.toString()).toBe(
        "role_family=backend&role_family=python&technology=Python&technology=React&source=himalayas&source=jobicy",
      );
    });

    it("serializes include_unknown_compensation=false explicitly and omits default true", () => {
      expect(
        serializeSearchParams({ include_unknown_compensation: false }).get(
          "include_unknown_compensation",
        ),
      ).toBe("false");

      expect(
        serializeSearchParams({ include_unknown_compensation: true }).get(
          "include_unknown_compensation",
        ),
      ).toBeNull();
    });

    it("omits default values for page=1, page_size=25, posted_within=any, sort=newest", () => {
      const params: Partial<JobSearchParams> = {
        page: 1,
        page_size: 25,
        posted_within: "any",
        sort: "newest",
        include_unknown_compensation: true,
      };

      expect(serializeSearchParams(params).toString()).toBe("");
      expect(buildSearchUrl(params)).toBe("/jobs");
    });

    it("serializes non-default pagination and sorting", () => {
      const params: Partial<JobSearchParams> = {
        page: 3,
        page_size: 50,
        sort: "compensation_desc",
        posted_within: "24h",
      };

      expect(buildSearchUrl(params)).toBe(
        "/jobs?posted_within=24h&sort=compensation_desc&page=3&page_size=50",
      );
    });

    it("round-trips full search params through serialization and parsing", () => {
      const initial: JobSearchParams = {
        q: "Full Stack Engineer",
        role_family: ["full_stack", "backend"],
        technology: ["Python", "React"],
        remote_status: ["remote", "hybrid"],
        location_eligibility: ["brazil", "worldwide"],
        seniority: ["mid", "senior"],
        source: ["himalayas"],
        minimum_annual_usd: 90000,
        include_unknown_compensation: false,
        posted_within: "30d",
        sort: "compensation_desc",
        page: 2,
        page_size: 50,
      };

      const serialized = serializeSearchParams(initial);
      const roundtripped = parseRawSearchParams(serialized);
      expect(roundtripped).toEqual(initial);
    });
  });

  describe("updateSearchParams", () => {
    it("resets page to 1 when changing filters, keywords, or sort", () => {
      const current: JobSearchParams = {
        ...DEFAULT_SEARCH_PARAMS,
        q: "python",
        page: 4,
      };

      const updated = updateSearchParams(current, {
        role_family: ["backend"],
      });

      expect(updated.page).toBe(1);
      expect(updated.q).toBe("python");
      expect(updated.role_family).toEqual(["backend"]);
    });

    it("preserves all other filters when updating page only", () => {
      const current: JobSearchParams = {
        ...DEFAULT_SEARCH_PARAMS,
        q: "python",
        role_family: ["backend"],
        seniority: ["senior"],
        minimum_annual_usd: 100000,
        page: 1,
      };

      const updated = updateSearchParams(current, { page: 3 });
      expect(updated.page).toBe(3);
      expect(updated.q).toBe("python");
      expect(updated.role_family).toEqual(["backend"]);
      expect(updated.seniority).toEqual(["senior"]);
      expect(updated.minimum_annual_usd).toBe(100000);
    });
  });
});
