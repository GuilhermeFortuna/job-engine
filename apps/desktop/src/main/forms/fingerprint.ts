import { createHash } from "node:crypto";

import type { ControlType } from "./types";

/**
 * Inputs to a field's stable identity. Deliberately excludes DOM position,
 * index, tag name, CSS classes, and generated IDs: a field must keep its
 * fingerprint when the page reorders, re-renders, or renames its markup.
 */
export interface FingerprintInput {
  adapterId: string;
  pageId: string;
  accessibleName: string | null;
  label: string;
  controlType: ControlType;
  options: readonly string[];
}

/**
 * Collapse whitespace, strip a trailing required marker, and casefold.
 *
 * Employer forms routinely render the same question as "Email", "Email *",
 * and "Email\n  *" across steps; those are the same question.
 */
export function normalizeSemanticText(value: string): string {
  return value
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[\s\u00A0*\u2217]+$/g, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

/** Options are a set, not a sequence: presentation order must not matter. */
export function normalizeOptions(options: readonly string[]): string[] {
  const normalized = options.map(normalizeSemanticText).filter((o) => o !== "");
  return Array.from(new Set(normalized)).sort();
}

/** ASCII unit separator: cannot survive normalization of page text. */
const UNIT = "\u001F";

/**
 * The canonical identity string for a control, without the adapter ID.
 *
 * The in-page script builds this same string so fill targets can address
 * controls by identity rather than by a selector or element handle that would
 * not survive a re-render.
 */
export function buildSemanticKey(
  input: Omit<FingerprintInput, "adapterId">,
): string {
  return [
    input.pageId,
    normalizeSemanticText(input.accessibleName ?? ""),
    normalizeSemanticText(input.label),
    input.controlType,
    normalizeOptions(input.options).join(","),
  ].join(UNIT);
}

/** Stable `field_fingerprint` for the backend answer-decision contract. */
export function computeFieldFingerprint(input: FingerprintInput): string {
  return fingerprintFromSemanticKey(input.adapterId, buildSemanticKey(input));
}

export function fingerprintFromSemanticKey(
  adapterId: string,
  semanticKey: string,
): string {
  return createHash("sha256")
    .update(adapterId)
    .update(UNIT)
    .update(semanticKey)
    .digest("hex");
}

/**
 * Semantic keys appearing more than once in one observation.
 *
 * Two controls that agree on every identity input are genuinely ambiguous.
 * They are reported unsupported rather than disambiguated by position, because
 * guessing which is which could put an answer in the wrong field.
 */
export function findAmbiguousKeys(
  semanticKeys: readonly string[],
): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of semanticKeys) {
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }
  return duplicates;
}
