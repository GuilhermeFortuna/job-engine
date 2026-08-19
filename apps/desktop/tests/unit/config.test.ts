import { describe, expect, it } from "vitest";
import { isLoopbackOrigin, loadDesktopConfig } from "../../src/main/config";

describe("Desktop Config", () => {
  describe("isLoopbackOrigin", () => {
    it("accepts valid IPv4 loopback origins", () => {
      expect(isLoopbackOrigin("http://127.0.0.1:3000")).toBe(true);
      expect(isLoopbackOrigin("https://127.0.0.1:8000")).toBe(true);
      expect(isLoopbackOrigin("http://127.0.0.1")).toBe(true);
    });

    it("accepts valid localhost origins", () => {
      expect(isLoopbackOrigin("http://localhost:3000")).toBe(true);
      expect(isLoopbackOrigin("https://localhost:8443")).toBe(true);
    });

    it("accepts valid IPv6 loopback origins", () => {
      expect(isLoopbackOrigin("http://[::1]:3000")).toBe(true);
      expect(isLoopbackOrigin("https://[::1]:8000")).toBe(true);
    });

    it("rejects non-loopback origins", () => {
      expect(isLoopbackOrigin("https://example.com")).toBe(false);
      expect(isLoopbackOrigin("http://192.168.1.50:3000")).toBe(false);
      expect(isLoopbackOrigin("http://10.0.0.1:8000")).toBe(false);
      expect(isLoopbackOrigin("file:///tmp/test.html")).toBe(false);
      expect(isLoopbackOrigin("not-a-url")).toBe(false);
    });
  });

  describe("loadDesktopConfig", () => {
    it("loads default loopback configuration", () => {
      const config = loadDesktopConfig({});
      expect(config.webOrigin).toBe("http://127.0.0.1:3000");
      expect(config.apiBaseUrl).toBe("http://127.0.0.1:8000");
      expect(config.sessionPartition).toBe("persist:job-engine-ats");
      expect(config.userDataDir).toContain(".job-engine");
      expect(config.runnerSecret).toBe("");
    });

    it("accepts valid custom loopback environment overrides", () => {
      const config = loadDesktopConfig({
        JOB_ENGINE_WEB_ORIGIN: "http://localhost:3001",
        JOB_ENGINE_API_BASE_URL: "http://127.0.0.1:8080",
        JOB_ENGINE_SESSION_PARTITION: "persist:custom-ats",
        JOB_ENGINE_DESKTOP_USER_DATA_DIR: "/tmp/job-engine-custom",
        JOB_ENGINE_RUNNER_SECRET: "secret-token-123",
      });
      expect(config.webOrigin).toBe("http://localhost:3001");
      expect(config.apiBaseUrl).toBe("http://127.0.0.1:8080");
      expect(config.sessionPartition).toBe("persist:custom-ats");
      expect(config.userDataDir).toBe("/tmp/job-engine-custom");
      expect(config.runnerSecret).toBe("secret-token-123");
    });

    it("throws when JOB_ENGINE_WEB_ORIGIN is non-loopback", () => {
      expect(() =>
        loadDesktopConfig({
          JOB_ENGINE_WEB_ORIGIN: "https://remote-site.com",
        })
      ).toThrowError(/JOB_ENGINE_WEB_ORIGIN must be a valid loopback origin/);
    });

    it("throws when JOB_ENGINE_API_BASE_URL is non-loopback", () => {
      expect(() =>
        loadDesktopConfig({
          JOB_ENGINE_API_BASE_URL: "https://remote-api.com",
        })
      ).toThrowError(/JOB_ENGINE_API_BASE_URL must be a valid loopback origin/);
    });
  });
});
