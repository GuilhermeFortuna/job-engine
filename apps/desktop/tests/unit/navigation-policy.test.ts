import { describe, expect, it } from "vitest";
import {
  sanitizeDisplayUrl,
  validateNavigationUrl,
} from "../../src/main/navigation-policy";

describe("Navigation Policy", () => {
  describe("sanitizeDisplayUrl", () => {
    it("preserves origin and pathname while stripping query and hash", () => {
      expect(
        sanitizeDisplayUrl("https://boards.greenhouse.io/acme/jobs/123?token=secret#apply")
      ).toBe("https://boards.greenhouse.io/acme/jobs/123");
      expect(
        sanitizeDisplayUrl("https://jobs.lever.co/company/abc?source=ref")
      ).toBe("https://jobs.lever.co/company/abc");
    });

    it("returns empty string for invalid URLs or non-HTTP schemes", () => {
      expect(sanitizeDisplayUrl("")).toBe("");
      expect(sanitizeDisplayUrl("invalid-url")).toBe("");
      expect(sanitizeDisplayUrl("file:///tmp/resume.pdf")).toBe("");
      expect(sanitizeDisplayUrl("javascript:alert(1)")).toBe("");
    });
  });

  describe("validateNavigationUrl", () => {
    it("allows valid public HTTPS URLs", () => {
      const result = validateNavigationUrl("https://boards.greenhouse.io/example/jobs/123");
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.sanitizedUrl).toBe("https://boards.greenhouse.io/example/jobs/123");
    });

    it("denies non-HTTPS remote URLs in production mode", () => {
      const result = validateNavigationUrl("http://insecure-ats.com/job/123", false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("NON_HTTPS_DENIED");
    });

    it("allows loopback HTTP in test mode", () => {
      const result = validateNavigationUrl("http://127.0.0.1:4000/fixtures/app", true);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeNull();
    });

    it("denies remote HTTP even in test mode", () => {
      const result = validateNavigationUrl("http://example.com/jobs", true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("NON_HTTPS_DENIED");
    });

    it("denies dangerous and local schemes", () => {
      expect(validateNavigationUrl("file:///etc/passwd").allowed).toBe(false);
      expect(validateNavigationUrl("file:///etc/passwd").reason).toBe("NON_HTTPS_DENIED");

      expect(validateNavigationUrl("data:text/html,<h1>PWNED</h1>").allowed).toBe(false);
      expect(validateNavigationUrl("data:text/html,<h1>PWNED</h1>").reason).toBe("NON_HTTPS_DENIED");

      expect(validateNavigationUrl("javascript:alert(1)").allowed).toBe(false);
      expect(validateNavigationUrl("javascript:alert(1)").reason).toBe("NON_HTTPS_DENIED");

      expect(validateNavigationUrl("chrome://settings").allowed).toBe(false);
      expect(validateNavigationUrl("electron://sandbox").allowed).toBe(false);
      expect(validateNavigationUrl("mailto:jobs@example.com").allowed).toBe(false);
      expect(validateNavigationUrl("slack://channel").allowed).toBe(false);
    });

    it("denies empty or unparseable URLs", () => {
      expect(validateNavigationUrl("").allowed).toBe(false);
      expect(validateNavigationUrl("").reason).toBe("UNAPPROVED_NAVIGATION");

      expect(validateNavigationUrl("::not-a-valid-url::").allowed).toBe(false);
      expect(validateNavigationUrl("::not-a-valid-url::").reason).toBe("UNAPPROVED_NAVIGATION");
    });
  });
});
