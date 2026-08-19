import { describe, expect, it } from "vitest";

import {
  isFillConfirmed,
  normalizeForComparison,
  verifyField,
} from "../../src/main/forms/verify";

const observedOf = (
  value = "",
  checked: boolean | null = null,
  filename: string | null = null,
) => ({ value, checked, filename });

describe("normalizeForComparison", () => {
  it("normalizes newlines the way the DOM stores them", () => {
    expect(normalizeForComparison("a\r\nb")).toBe("a\nb");
    expect(normalizeForComparison("a\rb")).toBe("a\nb");
  });

  it("collapses runs of spaces and trims", () => {
    expect(normalizeForComparison("  a   b  ")).toBe("a b");
  });
});

describe("text verification", () => {
  it("accepts an exact match", () => {
    expect(
      verifyField(
        { controlType: "text", intendedValue: "a@b.co", intendedChecked: null },
        observedOf("a@b.co"),
      ).verified,
    ).toBe(true);
  });

  it("accepts a CRLF answer stored as LF", () => {
    expect(
      verifyField(
        {
          controlType: "textarea",
          intendedValue: "line1\r\nline2",
          intendedChecked: null,
        },
        observedOf("line1\nline2"),
      ).verified,
    ).toBe(true);
  });

  it("rejects a field the page silently cleared", () => {
    const result = verifyField(
      { controlType: "text", intendedValue: "a@b.co", intendedChecked: null },
      observedOf(""),
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("EMPTY");
  });

  it("rejects a value the page rewrote", () => {
    const result = verifyField(
      { controlType: "text", intendedValue: "+1 555 0100", intendedChecked: null },
      observedOf("5550100"),
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("VALUE_MISMATCH");
  });

  it("is case sensitive for free text", () => {
    expect(
      verifyField(
        { controlType: "text", intendedValue: "Rio", intendedChecked: null },
        observedOf("rio"),
      ).verified,
    ).toBe(false);
  });
});

describe("option verification", () => {
  it("accepts a recased option label", () => {
    expect(
      verifyField(
        {
          controlType: "single_select",
          intendedValue: "Portugal",
          intendedChecked: null,
        },
        observedOf("PORTUGAL"),
      ).verified,
    ).toBe(true);
  });

  it("rejects a different option", () => {
    expect(
      verifyField(
        { controlType: "radio", intendedValue: "Yes", intendedChecked: null },
        observedOf("No"),
      ).verified,
    ).toBe(false);
  });

  it("requires every intended option in a multi select", () => {
    expect(
      verifyField(
        {
          controlType: "multi_select",
          intendedValue: "Go,Rust",
          intendedChecked: null,
        },
        observedOf("Rust,Go"),
      ).verified,
    ).toBe(true);
    expect(
      verifyField(
        {
          controlType: "multi_select",
          intendedValue: "Go,Rust",
          intendedChecked: null,
        },
        observedOf("Go"),
      ).verified,
    ).toBe(false);
  });
});

describe("checkbox and file verification", () => {
  it("compares checkbox state, not value", () => {
    expect(
      verifyField(
        { controlType: "checkbox", intendedValue: null, intendedChecked: true },
        observedOf("on", true),
      ).verified,
    ).toBe(true);
    expect(
      verifyField(
        { controlType: "checkbox", intendedValue: null, intendedChecked: true },
        observedOf("on", false),
      ).reason,
    ).toBe("STATE_MISMATCH");
  });

  it("verifies an upload by the displayed filename", () => {
    expect(
      verifyField(
        { controlType: "file", intendedValue: "resume.pdf", intendedChecked: null },
        observedOf("", null, "resume.pdf"),
      ).verified,
    ).toBe(true);
  });

  it("rejects an upload the page did not accept", () => {
    expect(
      verifyField(
        { controlType: "file", intendedValue: "resume.pdf", intendedChecked: null },
        observedOf("", null, null),
      ).reason,
    ).toBe("EMPTY");
  });
});

describe("isFillConfirmed", () => {
  it("requires both a successful write and matching page state", () => {
    const match = { verified: true, reason: "MATCH" } as const;
    const mismatch = { verified: false, reason: "VALUE_MISMATCH" } as const;
    expect(isFillConfirmed("VERIFIED", match)).toBe(true);
    // The script reported success but the page disagrees.
    expect(isFillConfirmed("VERIFIED", mismatch)).toBe(false);
    // The page state happens to match but the write was refused.
    expect(isFillConfirmed("OPTION_MISSING", match)).toBe(false);
    expect(isFillConfirmed("DISABLED", match)).toBe(false);
    expect(isFillConfirmed("NOT_FOUND", match)).toBe(false);
    expect(isFillConfirmed("REJECTED", match)).toBe(false);
  });
});
