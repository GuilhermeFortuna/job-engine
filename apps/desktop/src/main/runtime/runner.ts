import { fingerprintFromSemanticKey } from "../forms/fingerprint";
import {
  FILLABLE_DECISIONS,
  type AnswerDecision,
  type ObserveResult,
  type QuestionObservation,
  type RawField,
  type StepOutcome,
} from "../forms/types";
import { isFillConfirmed, verifyField } from "../forms/verify";
import type { AdapterContext, AuthorizedFill, FormAdapter } from "../adapters/contract";
import { isCheckpoint, shouldRecord, type Checkpoint } from "./checkpoints";
import type { EvidenceRecorder } from "./evidence";
import type { LeaseManager } from "./lease";
import { buildFieldReport, safeText, type SafeFieldReport } from "./redaction";
import type { RunnerClient, RunnerRun } from "./runner-client";

/** Upper bound on intermediate steps, so a looping form cannot run forever. */
export const MAX_STEPS = 12;

export interface StepResult {
  outcome: StepOutcome;
  fields: SafeFieldReport[];
  detail: string;
}

/**
 * Turns one observation into the payload the backend answer policy expects.
 *
 * The runtime describes what it sees and nothing else: it never proposes an
 * answer, scores confidence, or decides a policy category.
 */
export function toObservations(
  adapterId: string,
  observation: ObserveResult,
): QuestionObservation[] {
  return observation.fields.map((field) => ({
    adapter_id: adapterId,
    page_id: observation.pageId,
    field_fingerprint: fingerprintFromSemanticKey(adapterId, field.semanticKey),
    label: field.label,
    accessible_name: field.accessibleName,
    help_text: field.helpText,
    required: field.required,
    control_type: field.controlType,
    options: field.options,
    validation_constraints: {
      min_length: field.validation.minLength,
      max_length: field.validation.maxLength,
      pattern: field.validation.pattern,
    },
  }));
}

/**
 * Which decisions authorize writing, and what they would write.
 *
 * `DECLINE_OPTIONAL` applies only when the returned option exists exactly, so
 * a decline can never silently become a different answer. `ABSTAIN` and
 * `REVIEW_REQUIRED` never produce a write.
 */
export function planFills(
  adapterId: string,
  observation: ObserveResult,
  decisions: readonly AnswerDecision[],
): { fills: AuthorizedFill[]; unresolved: AnswerDecision[] } {
  const byFingerprint = new Map<string, RawField>();
  for (const field of observation.fields) {
    byFingerprint.set(
      fingerprintFromSemanticKey(adapterId, field.semanticKey),
      field,
    );
  }

  const fills: AuthorizedFill[] = [];
  const unresolved: AnswerDecision[] = [];

  for (const decision of decisions) {
    const field = byFingerprint.get(decision.field_fingerprint);
    if (!field) {
      // A decision for a field this observation did not report is ignored
      // rather than guessed at.
      continue;
    }

    if (decision.decision === "DECLINE_OPTIONAL") {
      const exact = field.options.find((option) => option === decision.answer);
      if (field.required || decision.answer === null || exact === undefined) {
        unresolved.push(decision);
        continue;
      }
      fills.push({
        semanticKey: field.semanticKey,
        fieldFingerprint: decision.field_fingerprint,
        value: exact,
        checked: field.controlType === "checkbox" ? false : null,
        decision,
      });
      continue;
    }

    if (!FILLABLE_DECISIONS.has(decision.decision)) {
      unresolved.push(decision);
      continue;
    }
    if (decision.answer === null || decision.answer === undefined) {
      // The backend forbids this pairing; treat it as unresolved rather than
      // writing an empty value.
      unresolved.push(decision);
      continue;
    }

    fills.push({
      semanticKey: field.semanticKey,
      fieldFingerprint: decision.field_fingerprint,
      value: decision.answer,
      checked:
        field.controlType === "checkbox"
          ? decision.answer.toLowerCase() === "true" ||
            decision.answer.toLowerCase() === "yes"
          : null,
      decision,
    });
  }

  return { fills, unresolved };
}

/**
 * Required fields still without a confirmed value.
 *
 * A step may only advance when this is empty: continuing past an unanswered
 * required question produces a rejected or half-filled application.
 */
export function blockingFields(
  adapterId: string,
  observation: ObserveResult,
  confirmed: ReadonlySet<string>,
): SafeFieldReport[] {
  const blocking: SafeFieldReport[] = [];

  for (const field of observation.fields) {
    if (!field.required) {
      continue;
    }
    const fingerprint = fingerprintFromSemanticKey(
      adapterId,
      field.semanticKey,
    );
    if (confirmed.has(fingerprint)) {
      continue;
    }
    const alreadySatisfied =
      field.controlType === "checkbox"
        ? field.checked === true
        : field.controlType === "file"
          ? field.filename !== null
          : field.value !== "";
    if (alreadySatisfied) {
      continue;
    }
    blocking.push(
      buildFieldReport({
        fieldFingerprint: fingerprint,
        label: field.label,
        controlType: field.controlType,
        required: true,
        status: "UNRESOLVED",
      }),
    );
  }

  // An unsupported required control blocks the step just as hard.
  for (const control of observation.unsupported) {
    if (control.required) {
      blocking.push(
        buildFieldReport({
          fieldFingerprint: "",
          label: control.hint,
          controlType: "unsupported",
          required: true,
          status: control.reason,
        }),
      );
    }
  }

  return blocking;
}

/** Page-level conditions the runtime must never try to work around. */
export function signalOutcome(observation: ObserveResult): StepOutcome | null {
  if (observation.signals.captcha) {
    return "CAPTCHA";
  }
  if (observation.signals.authWall) {
    return "NEEDS_AUTH";
  }
  return null;
}

export interface RunnerDeps {
  client: RunnerClient;
  lease: LeaseManager;
  adapter: FormAdapter;
  context: AdapterContext;
  evidence: EvidenceRecorder;
  /** Verified resume bytes, fetched once per attempt through the grant. */
  loadResume: () => Promise<Buffer>;
}

/**
 * Drives one claimed run through its steps.
 *
 * Every mutation is followed by a fresh observation: conditional fields appear
 * only after a change, and a stale observation set must never be able to skip
 * one.
 */
export class StepRunner {
  private confirmed = new Set<string>();
  private lastCheckpoint: Checkpoint | null = null;
  private resumeAttached = false;

  constructor(
    private readonly deps: RunnerDeps,
    private readonly runId: string,
  ) {}

  setCheckpointFrom(run: RunnerRun): void {
    const checkpoint = run.current_checkpoint ?? null;
    this.lastCheckpoint = isCheckpoint(checkpoint) ? checkpoint : null;
  }

  private async checkpoint(next: Checkpoint, description: string): Promise<void> {
    const leaseToken = this.deps.lease.leaseToken;
    if (leaseToken === null || !shouldRecord(this.lastCheckpoint, next)) {
      return;
    }
    await this.deps.client.checkpoint(
      this.runId,
      leaseToken,
      next,
      safeText(description, 120),
    );
    this.lastCheckpoint = next;
  }

  /**
   * Observe, decide, fill, verify, and re-observe one step.
   *
   * Returns without advancing; the caller decides whether the step may move on.
   */
  async runStep(): Promise<StepResult> {
    const { adapter, context, client, lease, evidence } = this.deps;
    const leaseToken = lease.leaseToken;
    if (leaseToken === null) {
      return { outcome: "FAILED_RETRYABLE", fields: [], detail: "No lease" };
    }

    let observation = await adapter.observeStep(context);
    await this.checkpoint("form_discovered", "Application form observed");

    const signal = signalOutcome(observation);
    if (signal !== null) {
      evidence.record("step_blocked", { reason: signal });
      return {
        outcome: signal,
        fields: [],
        detail:
          signal === "CAPTCHA"
            ? "The page presents a CAPTCHA challenge"
            : "The page requires signing in",
      };
    }

    if (observation.fields.length > 0) {
      const observations = toObservations(adapter.adapterId, observation);
      const decisions = await client.answerDecisions(
        this.runId,
        leaseToken,
        observations,
      );

      const { fills, unresolved } = planFills(
        adapter.adapterId,
        observation,
        decisions,
      );

      if (fills.length > 0) {
        const fillResult = await adapter.fillStep(context, observation, fills);
        // Re-read the page: conditional fields appear only after a change, and
        // the write itself must be confirmed against page-visible state.
        observation = await adapter.observeStep(context);

        const observedByKey = new Map(
          observation.fields.map((f) => [f.semanticKey, f]),
        );
        for (const fill of fills) {
          const result = fillResult.results.find(
            (r) => r.semanticKey === fill.semanticKey,
          );
          const observed = observedByKey.get(fill.semanticKey);
          if (!result || !observed) {
            continue;
          }
          const verification = verifyField(
            {
              controlType: observed.controlType,
              intendedValue: fill.value,
              intendedChecked: fill.checked,
            },
            observed,
          );
          if (isFillConfirmed(result.outcome, verification)) {
            this.confirmed.add(fill.fieldFingerprint);
          } else {
            evidence.record("fill_unconfirmed", {
              field_fingerprint: fill.fieldFingerprint,
              outcome: result.outcome,
              verification: verification.reason,
            });
          }
        }
        await this.checkpoint("questions_answered", "Authorized answers filled");
      }

      for (const decision of unresolved) {
        evidence.record("decision_unresolved", {
          field_fingerprint: decision.field_fingerprint,
          decision: decision.decision,
          reason_code: decision.reason_code,
        });
      }
    }

    const uploaded = await this.attachResumeIfNeeded(observation);
    if (uploaded) {
      observation = await adapter.observeStep(context);
      await this.checkpoint("resume_attached", "Resume attached");
    }

    if (observation.signals.validationErrors.length > 0) {
      return {
        outcome: "NEEDS_ANSWERS",
        fields: blockingFields(adapter.adapterId, observation, this.confirmed),
        detail: safeText(
          `The form reported ${observation.signals.validationErrors.length} validation error(s)`,
        ),
      };
    }

    const blocking = blockingFields(
      adapter.adapterId,
      observation,
      this.confirmed,
    );
    if (blocking.length > 0) {
      return {
        outcome: blocking.some((f) => f.controlType === "unsupported")
          ? "UNSUPPORTED"
          : "NEEDS_ANSWERS",
        fields: blocking,
        detail: `${blocking.length} required field(s) still need the owner`,
      };
    }

    if (await adapter.detectReview(context, observation)) {
      return {
        outcome: "READY_FOR_REVIEW",
        fields: [],
        detail: "The application is ready for review",
      };
    }

    const advanced = await adapter.advance(context, observation);
    if (!advanced.activated) {
      return {
        outcome: "UNSUPPORTED",
        fields: [],
        detail: "No usable control to continue to the next step",
      };
    }
    return { outcome: "PROGRESSED", fields: [], detail: "Advanced a step" };
  }

  /** Attach the resume once, if this step offers an empty file control. */
  private async attachResumeIfNeeded(
    observation: ObserveResult,
  ): Promise<boolean> {
    if (this.resumeAttached) {
      return false;
    }
    const fileField = observation.fields.find(
      (field) => field.controlType === "file" && field.filename === null,
    );
    if (!fileField) {
      return false;
    }

    await this.deps.loadResume();
    const result = await this.deps.context.attachResume(fileField.semanticKey);
    if (!result.attached) {
      this.deps.evidence.record("resume_attach_failed", {
        field_label: fileField.label,
      });
      return false;
    }
    this.resumeAttached = true;
    return true;
  }

  get confirmedFingerprints(): ReadonlySet<string> {
    return this.confirmed;
  }
}
