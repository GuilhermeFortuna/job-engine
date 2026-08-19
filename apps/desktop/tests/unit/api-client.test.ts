import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApplicationRun, isValidUuid } from "../../src/main/api-client";

describe("API Client", () => {
  const validUuid = "123e4567-e89b-12d3-a456-426614174000";

  describe("isValidUuid", () => {
    it("validates standard UUIDs", () => {
      expect(isValidUuid(validUuid)).toBe(true);
      expect(isValidUuid("00000000-0000-1000-8000-000000000000")).toBe(true);
    });

    it("rejects non-UUID strings", () => {
      expect(isValidUuid("not-a-uuid")).toBe(false);
      expect(isValidUuid("")).toBe(false);
      expect(isValidUuid("12345")).toBe(false);
      expect(isValidUuid(null as any)).toBe(false);
    });
  });

  describe("fetchApplicationRun", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("rejects invalid UUID before making request", async () => {
      await expect(
        fetchApplicationRun("http://127.0.0.1:8000", "invalid-id")
      ).rejects.toThrowError(/Invalid runId format/);
    });

    it("fetches and extracts run application URL successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: validUuid,
          job_group_id: "223e4567-e89b-12d3-a456-426614174000",
          application_url: "https://boards.greenhouse.io/acme/jobs/987",
          canonical_application_url: "https://boards.greenhouse.io/acme/jobs/987",
          platform_adapter_id: "greenhouse",
          status: "DISPATCHED",
        }),
      } as any);

      const result = await fetchApplicationRun(
        "http://127.0.0.1:8000",
        validUuid,
        "runner-secret-key"
      );

      expect(result.runId).toBe(validUuid);
      expect(result.applicationUrl).toBe(
        "https://boards.greenhouse.io/acme/jobs/987"
      );
      expect(result.platformAdapterId).toBe("greenhouse");
      expect(global.fetch).toHaveBeenCalledWith(
        `http://127.0.0.1:8000/api/v1/application-runs/${validUuid}`,
        expect.objectContaining({
          headers: {
            Accept: "application/json",
            Authorization: "Bearer runner-secret-key",
          },
        })
      );
    });

    it("falls back to canonical_application_url if application_url is missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: validUuid,
          canonical_application_url: "https://jobs.lever.co/company/abc",
          platform_adapter_id: "lever",
          status: "DISPATCHED",
        }),
      } as any);

      const result = await fetchApplicationRun(
        "http://127.0.0.1:8000",
        validUuid
      );

      expect(result.applicationUrl).toBe("https://jobs.lever.co/company/abc");
    });

    it("handles 404 not found correctly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      } as any);

      await expect(
        fetchApplicationRun("http://127.0.0.1:8000", validUuid)
      ).rejects.toThrowError(/Application run not found/);
    });

    it("handles missing application_url gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: validUuid,
          status: "DISPATCHED",
        }),
      } as any);

      await expect(
        fetchApplicationRun("http://127.0.0.1:8000", validUuid)
      ).rejects.toThrowError(/does not contain a valid application_url/);
    });
  });
});
