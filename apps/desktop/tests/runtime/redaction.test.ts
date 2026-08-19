import { describe, expect, it } from "vitest";

import {
  buildFieldReport,
  enforceRedaction,
  REDACTED,
  safeText,
  safeUrl,
} from "../../src/main/runtime/redaction";

describe("safeText", () => {
  it("strips control characters and collapses whitespace", () => {
    expect(safeText("a\u0000b\u0007c\nd  e")).toBe("a b c d e");
  });

  it("bounds length", () => {
    expect(safeText("x".repeat(500), 10)).toHaveLength(10);
  });
});

describe("enforceRedaction", () => {
  it("replaces values under sensitive keys at any depth", () => {
    const result = enforceRedaction({
      ok: "visible",
      lease_token: "super-secret",
      nested: { cookie: "sid=abc", answer: "my salary is 100k" },
      list: [{ grant_token: "g" }],
    }) as Record<string, unknown>;

    expect(result.ok).toBe("visible");
    expect(result.lease_token).toBe(REDACTED);
    expect((result.nested as Record<string, unknown>).cookie).toBe(REDACTED);
    expect((result.nested as Record<string, unknown>).answer).toBe(REDACTED);
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).not.toContain("100k");
  });

  it("matches sensitive keys regardless of casing or wrapping", () => {
    const result = enforceRedaction({
      Authorization: "Bearer x",
      X_Runner_Lease_Token: "t",
      userAnswer: "text",
    }) as Record<string, unknown>;
    expect(Object.values(result).every((v) => v === REDACTED)).toBe(true);
  });

  it("keeps the payload shape so the audit trail stays readable", () => {
    const result = enforceRedaction({ a: { token: "x" } }) as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(result.a)).toEqual(["token"]);
  });

  it("stops runaway nesting", () => {
    let deep: Record<string, unknown> = { end: "value" };
    for (let i = 0; i < 20; i += 1) {
      deep = { next: deep };
    }
    expect(() => enforceRedaction(deep as never)).not.toThrow();
    expect(JSON.stringify(enforceRedaction(deep as never))).toContain(REDACTED);
  });
});

describe("buildFieldReport", () => {
  it("carries identity and state but never a value", () => {
    const report = buildFieldReport({
      fieldFingerprint: "f".repeat(64),
      label: "  Salary   expectation  ",
      controlType: "text",
      required: true,
      status: "REVIEW_REQUIRED",
      reasonCode: "provider_low_confidence",
    });

    expect(report.label).toBe("Salary expectation");
    expect(Object.keys(report).sort()).toEqual([
      "controlType",
      "fieldFingerprint",
      "label",
      "reasonCode",
      "required",
      "status",
    ]);
  });
});

describe("safeUrl", () => {
  it("drops query strings and fragments", () => {
    expect(safeUrl("https://jobs.example.com/apply?token=abc#x")).toBe(
      "https://jobs.example.com/apply",
    );
  });

  it("returns empty for an unparseable URL", () => {
    expect(safeUrl("not a url")).toBe("");
  });
});
