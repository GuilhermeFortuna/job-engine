import { z } from "zod";

/**
 * Control taxonomy. These values are the backend `ControlType` enum verbatim
 * (`apps/api/src/job_engine/domain/application_answers.py`) and are sent
 * unchanged in question observations.
 */
export const controlTypeSchema = z.enum([
  "text",
  "textarea",
  "single_select",
  "multi_select",
  "radio",
  "checkbox",
  "file",
]);
export type ControlType = z.infer<typeof controlTypeSchema>;

/**
 * Why a control the page shows cannot be assisted. Surfaced to the trusted UI
 * and to the backend as exception context; never a reason to guess.
 */
export const unsupportedReasonSchema = z.enum([
  "NO_ACCESSIBLE_NAME",
  "CUSTOM_COMBOBOX",
  "CONTENTEDITABLE",
  "SHADOW_OR_CANVAS",
  "SIGNATURE_WIDGET",
  "AMBIGUOUS_DUPLICATE",
  "UNKNOWN_CONTROL",
]);
export type UnsupportedReason = z.infer<typeof unsupportedReasonSchema>;

export const validationConstraintsSchema = z.object({
  minLength: z.number().int().nonnegative().nullable(),
  maxLength: z.number().int().nonnegative().nullable(),
  pattern: z.string().nullable(),
});
export type ValidationConstraints = z.infer<typeof validationConstraintsSchema>;

/**
 * One assistable control as reported by the in-page script.
 *
 * `semanticKey` is the canonical, DOM-position-independent identity string the
 * page and the main process agree on. The main process hashes it (with the
 * adapter ID) into the backend `field_fingerprint`; fill targets address
 * controls by the same key, so no selector or element handle has to survive a
 * re-render.
 */
export const rawFieldSchema = z.object({
  semanticKey: z.string().min(1),
  label: z.string(),
  accessibleName: z.string().nullable(),
  helpText: z.string().nullable(),
  required: z.boolean(),
  controlType: controlTypeSchema,
  options: z.array(z.string()),
  value: z.string(),
  checked: z.boolean().nullable(),
  filename: z.string().nullable(),
  disabled: z.boolean(),
  validation: validationConstraintsSchema,
});
export type RawField = z.infer<typeof rawFieldSchema>;

export const unsupportedControlSchema = z.object({
  reason: unsupportedReasonSchema,
  /** Best-effort human label for the trusted UI. Never a value. */
  hint: z.string(),
  required: z.boolean(),
});
export type UnsupportedControl = z.infer<typeof unsupportedControlSchema>;

/** Page-level signals the runtime must not try to work around. */
export const pageSignalsSchema = z.object({
  authWall: z.boolean(),
  captcha: z.boolean(),
  validationErrors: z.array(z.string()),
});
export type PageSignals = z.infer<typeof pageSignalsSchema>;

export const observeResultSchema = z.object({
  op: z.literal("observe"),
  pageId: z.string().min(1),
  fields: z.array(rawFieldSchema),
  unsupported: z.array(unsupportedControlSchema),
  signals: pageSignalsSchema,
  /** Whether the page reads as a submission confirmation. Never its text. */
  confirmationText: z.boolean(),
  advanceControls: z.array(z.string()),
  submitControls: z.array(z.string()),
});
export type ObserveResult = z.infer<typeof observeResultSchema>;

export const fillOutcomeSchema = z.enum([
  "VERIFIED",
  "NOT_FOUND",
  "DISABLED",
  "OPTION_MISSING",
  "REJECTED",
]);
export type FillOutcome = z.infer<typeof fillOutcomeSchema>;

export const fillResultSchema = z.object({
  op: z.literal("fill"),
  results: z.array(
    z.object({
      semanticKey: z.string(),
      outcome: fillOutcomeSchema,
      observedValue: z.string(),
      observedChecked: z.boolean().nullable(),
    }),
  ),
});
export type FillResult = z.infer<typeof fillResultSchema>;

export const activateResultSchema = z.object({
  op: z.literal("activate"),
  activated: z.boolean(),
});
export type ActivateResult = z.infer<typeof activateResultSchema>;

export const scriptResultSchema = z.discriminatedUnion("op", [
  observeResultSchema,
  fillResultSchema,
  activateResultSchema,
]);
export type ScriptResult = z.infer<typeof scriptResultSchema>;

// --- Backend wire contracts -------------------------------------------------

/**
 * Mirrors the backend `QuestionObservationSchema`, snake_case included. The
 * backend forbids extra keys, so this object is sent exactly as shaped here.
 */
export const questionObservationSchema = z.object({
  adapter_id: z.string(),
  page_id: z.string(),
  field_fingerprint: z.string(),
  label: z.string(),
  accessible_name: z.string().nullable().optional(),
  help_text: z.string().nullable().optional(),
  required: z.boolean(),
  control_type: controlTypeSchema,
  options: z.array(z.string()),
  validation_constraints: z
    .object({
      min_length: z.number().int().nullable().optional(),
      max_length: z.number().int().nullable().optional(),
      pattern: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type QuestionObservation = z.infer<typeof questionObservationSchema>;

/**
 * Decision values are UPPERCASE, unlike every other backend enum. Encoded
 * literally so a casing drift fails parsing rather than silently abstaining.
 */
export const answerDecisionTypeSchema = z.enum([
  "AUTO_FILL",
  "AUTO_FILL_AND_SUBMIT",
  "REVIEW_REQUIRED",
  "DECLINE_OPTIONAL",
  "ABSTAIN",
]);
export type AnswerDecisionType = z.infer<typeof answerDecisionTypeSchema>;

export const answerDecisionSchema = z.object({
  field_fingerprint: z.string(),
  decision: answerDecisionTypeSchema,
  answer: z.string().nullable().optional(),
  policy_category: z.string(),
  confidence: z.number(),
  evidence: z
    .array(z.object({ source: z.string(), reference: z.string() }))
    .default([]),
  reason_code: z.string(),
  question_intent: z.string().nullable().optional(),
});
export type AnswerDecision = z.infer<typeof answerDecisionSchema>;

export const answerDecisionResponseSchema = z.object({
  decisions: z.array(answerDecisionSchema),
});

/**
 * The closed set of step outcomes fixed by CROSS-010. Every runtime path ends
 * in exactly one of these.
 */
export const stepOutcomeSchema = z.enum([
  "PROGRESSED",
  "NEEDS_ANSWERS",
  "NEEDS_AUTH",
  "CAPTCHA",
  "UNSUPPORTED",
  "READY_FOR_REVIEW",
  "SUBMITTED",
  "SUBMISSION_UNKNOWN",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
]);
export type StepOutcome = z.infer<typeof stepOutcomeSchema>;

/** Decisions that authorize writing a value into the page. */
export const FILLABLE_DECISIONS: ReadonlySet<AnswerDecisionType> = new Set([
  "AUTO_FILL",
  "AUTO_FILL_AND_SUBMIT",
]);
