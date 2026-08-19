import type { ControlType, FillOutcome, RawField } from "./types";

/**
 * Whether a control's page-visible state matches the value the runtime
 * intended to write.
 *
 * Verification always reads the page back. A successful assignment is never
 * treated as evidence on its own: a controlled component can revert a write, a
 * select can silently ignore an unknown option, and a validation handler can
 * rewrite or clear a field between the write and the next observation.
 */
export interface VerificationTarget {
  controlType: ControlType;
  /** The value the decision authorized, for value-bearing controls. */
  intendedValue: string | null;
  /** The state the decision authorized, for checkboxes. */
  intendedChecked: boolean | null;
}

export interface VerificationResult {
  verified: boolean;
  reason:
    | "MATCH"
    | "VALUE_MISMATCH"
    | "STATE_MISMATCH"
    | "EMPTY"
    | "NOT_APPLICABLE";
}

/**
 * Compare text the way the DOM stores it.
 *
 * HTML defines textarea and text input API values as newline-normalized, so a
 * CRLF answer is read back as LF. Comparing raw bytes would make every
 * multi-line answer fail verification forever.
 */
export function normalizeForComparison(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .trim();
}

/** Options compare case-insensitively; employer selects re-case their labels. */
function optionsMatch(intended: string, observed: string): boolean {
  return (
    normalizeForComparison(intended).toLocaleLowerCase("en-US") ===
    normalizeForComparison(observed).toLocaleLowerCase("en-US")
  );
}

export function verifyField(
  target: VerificationTarget,
  observed: Pick<RawField, "value" | "checked" | "filename">,
): VerificationResult {
  switch (target.controlType) {
    case "text":
    case "textarea": {
      const intended = target.intendedValue ?? "";
      if (intended === "") {
        return { verified: false, reason: "NOT_APPLICABLE" };
      }
      if (observed.value === "") {
        return { verified: false, reason: "EMPTY" };
      }
      return normalizeForComparison(observed.value) ===
        normalizeForComparison(intended)
        ? { verified: true, reason: "MATCH" }
        : { verified: false, reason: "VALUE_MISMATCH" };
    }
    case "single_select":
    case "radio": {
      const intended = target.intendedValue ?? "";
      if (intended === "") {
        return { verified: false, reason: "NOT_APPLICABLE" };
      }
      if (observed.value === "") {
        return { verified: false, reason: "EMPTY" };
      }
      return optionsMatch(intended, observed.value)
        ? { verified: true, reason: "MATCH" }
        : { verified: false, reason: "VALUE_MISMATCH" };
    }
    case "multi_select": {
      const intended = (target.intendedValue ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      if (intended.length === 0) {
        return { verified: false, reason: "NOT_APPLICABLE" };
      }
      const observedParts = observed.value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const allPresent = intended.every((wanted) =>
        observedParts.some((got) => optionsMatch(wanted, got)),
      );
      return allPresent
        ? { verified: true, reason: "MATCH" }
        : { verified: false, reason: "VALUE_MISMATCH" };
    }
    case "checkbox": {
      if (target.intendedChecked === null) {
        return { verified: false, reason: "NOT_APPLICABLE" };
      }
      return observed.checked === target.intendedChecked
        ? { verified: true, reason: "MATCH" }
        : { verified: false, reason: "STATE_MISMATCH" };
    }
    case "file": {
      const intended = target.intendedValue ?? "";
      if (intended === "") {
        return { verified: false, reason: "NOT_APPLICABLE" };
      }
      if (!observed.filename) {
        return { verified: false, reason: "EMPTY" };
      }
      return normalizeForComparison(observed.filename) ===
        normalizeForComparison(intended)
        ? { verified: true, reason: "MATCH" }
        : { verified: false, reason: "VALUE_MISMATCH" };
    }
  }
}

/**
 * A fill only counts when the page script reported success AND the resulting
 * page state matches. Either half alone is insufficient.
 */
export function isFillConfirmed(
  outcome: FillOutcome,
  verification: VerificationResult,
): boolean {
  return outcome === "VERIFIED" && verification.verified;
}
