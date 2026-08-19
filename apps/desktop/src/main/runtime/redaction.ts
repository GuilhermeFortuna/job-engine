/**
 * Everything the runtime reports outward is built here, from an allowlist.
 *
 * The rule is constructive, not subtractive: payloads are assembled from named
 * safe fields rather than scrubbed after the fact, because a denylist can only
 * remove the sensitive things someone thought of. Answers, hidden fields,
 * cookies, resume bytes, tokens, and raw DOM have no path to an event, an
 * exception context, or an evidence artifact.
 */

/** Keys whose values must never appear in an outbound payload, at any depth. */
const FORBIDDEN_KEY_PATTERN =
  /(token|secret|password|passwd|cookie|authorization|bearer|answer|value|grant|session|credential)/i;

export const REDACTED = "[redacted]";

/** A JSON value safe to send to the backend or the trusted UI. */
export type SafeJson =
  | string
  | number
  | boolean
  | null
  | SafeJson[]
  | { [key: string]: SafeJson };

/**
 * Shorten and strip free text before it is reported.
 *
 * Page-derived strings (labels, validation messages) may legitimately need to
 * reach the owner, but never at unbounded length and never with control
 * characters that could corrupt a log line.
 */
export function safeText(value: string, maxLength = 200): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Final guard applied to every outbound payload.
 *
 * Nothing should reach it carrying a forbidden key, so a hit is a defect
 * upstream; it fails closed by replacing the value rather than dropping the
 * key, keeping the shape intact for the audit trail.
 */
export function enforceRedaction(payload: SafeJson, depth = 0): SafeJson {
  if (depth > 8) {
    return REDACTED;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => enforceRedaction(item, depth + 1));
  }
  if (payload !== null && typeof payload === "object") {
    const out: { [key: string]: SafeJson } = {};
    for (const [key, value] of Object.entries(payload)) {
      out[key] = FORBIDDEN_KEY_PATTERN.test(key)
        ? REDACTED
        : enforceRedaction(value, depth + 1);
    }
    return out;
  }
  if (typeof payload === "string") {
    return safeText(payload, 500);
  }
  return payload;
}

/** Per-field status safe to show the owner: identity and state, never content. */
export interface SafeFieldReport {
  fieldFingerprint: string;
  label: string;
  controlType: string;
  required: boolean;
  status: string;
  reasonCode: string | null;
  questionIntent: string | null;
  options: string[];
  minLength: number | null;
  maxLength: number | null;
  pattern: string | null;
}

export function buildFieldReport(input: {
  fieldFingerprint: string;
  label: string;
  controlType: string;
  required: boolean;
  status: string;
  reasonCode?: string | null;
  questionIntent?: string | null;
  options?: readonly string[];
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
}): SafeFieldReport {
  return {
    fieldFingerprint: input.fieldFingerprint,
    label: safeText(input.label, 120),
    controlType: input.controlType,
    required: input.required,
    status: input.status,
    reasonCode: input.reasonCode ?? null,
    questionIntent: input.questionIntent ?? null,
    options: (input.options ?? []).map((option) => safeText(option, 200)),
    minLength: input.minLength ?? null,
    maxLength: input.maxLength ?? null,
    pattern: input.pattern ? safeText(input.pattern, 500) : null,
  };
}

/** Exact snake_case payload accepted by the backend exception contract. */
export function toExceptionFieldReports(
  reports: readonly SafeFieldReport[],
): Record<string, SafeJson>[] {
  return reports.map((report) => ({
    field_fingerprint: report.fieldFingerprint,
    label: report.label,
    control_type: report.controlType,
    required: report.required,
    status: report.status,
    reason_code: report.reasonCode,
    question_intent: report.questionIntent,
    options: report.options,
    min_length: report.minLength,
    max_length: report.maxLength,
    pattern: report.pattern,
  }));
}

/**
 * A URL reduced to what is safe to display and store.
 *
 * Query strings and fragments routinely carry application IDs, one-time
 * tokens, and tracking parameters, so they never survive.
 */
export function safeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}
