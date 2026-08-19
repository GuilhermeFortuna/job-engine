import { describe, expect, it } from "vitest";

import {
  buildSemanticKey,
  computeFieldFingerprint,
  findAmbiguousKeys,
  normalizeOptions,
  normalizeSemanticText,
} from "../../src/main/forms/fingerprint";

const UNIT = "\u001F";

const base = {
  adapterId: "generic",
  pageId: "/apply",
  accessibleName: "Email address",
  label: "Email address",
  controlType: "text" as const,
  options: [] as string[],
};

describe("normalizeSemanticText", () => {
  it("collapses whitespace and strips required markers", () => {
    expect(normalizeSemanticText("  Email\n  address  *  ")).toBe(
      "email address",
    );
    expect(normalizeSemanticText("Email address *")).toBe("email address");
    expect(normalizeSemanticText("EMAIL ADDRESS")).toBe("email address");
  });

  it("keeps interior asterisks that are part of the question", () => {
    expect(normalizeSemanticText("Rate us 1-5 *stars*")).toBe(
      "rate us 1-5 *stars",
    );
  });
});

describe("normalizeOptions", () => {
  it("is order and duplicate insensitive", () => {
    expect(normalizeOptions(["Yes", "No"])).toEqual(["no", "yes"]);
    expect(normalizeOptions(["No", "Yes", "yes "])).toEqual(["no", "yes"]);
  });
});

describe("computeFieldFingerprint", () => {
  it("is stable across label formatting differences", () => {
    const a = computeFieldFingerprint(base);
    const b = computeFieldFingerprint({
      ...base,
      label: "  Email   address *",
      accessibleName: "EMAIL ADDRESS",
    });
    expect(a).toBe(b);
  });

  it("is stable across option reordering", () => {
    const a = computeFieldFingerprint({
      ...base,
      controlType: "single_select",
      options: ["Yes", "No", "Prefer not to say"],
    });
    const b = computeFieldFingerprint({
      ...base,
      controlType: "single_select",
      options: ["Prefer not to say", "No", "Yes"],
    });
    expect(a).toBe(b);
  });

  it("separates fields that differ only in control type", () => {
    expect(computeFieldFingerprint(base)).not.toBe(
      computeFieldFingerprint({ ...base, controlType: "textarea" }),
    );
  });

  it("separates the same question on different pages", () => {
    expect(computeFieldFingerprint(base)).not.toBe(
      computeFieldFingerprint({ ...base, pageId: "/apply/step2" }),
    );
  });

  it("separates identical questions across adapters", () => {
    expect(computeFieldFingerprint(base)).not.toBe(
      computeFieldFingerprint({ ...base, adapterId: "greenhouse" }),
    );
  });

  it("cannot be forged by stuffing separators into a label", () => {
    // A page that renders a label containing the field separator must not be
    // able to collide with a different field's identity.
    const forged = computeFieldFingerprint({
      ...base,
      label: "x" + UNIT + "text",
      accessibleName: null,
    });
    expect(forged).not.toBe(computeFieldFingerprint(base));
  });

  it("produces a hex sha256", () => {
    expect(computeFieldFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("findAmbiguousKeys", () => {
  it("reports only keys that actually repeat", () => {
    const keys = [
      buildSemanticKey(base),
      buildSemanticKey(base),
      buildSemanticKey({ ...base, label: "Phone" }),
    ];
    const ambiguous = findAmbiguousKeys(keys);
    expect(ambiguous.size).toBe(1);
    expect(ambiguous.has(buildSemanticKey(base))).toBe(true);
  });

  it("is empty when every key is distinct", () => {
    expect(
      findAmbiguousKeys([
        buildSemanticKey(base),
        buildSemanticKey({ ...base, label: "Phone" }),
      ]).size,
    ).toBe(0);
  });
});
