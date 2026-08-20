/**
 * Checkpoint values are the backend `RunCheckpoint` enum verbatim
 * (`apps/api/src/job_engine/domain/applications.py`).
 */
export const CHECKPOINTS = [
  "form_discovered",
  "profile_filled",
  "questions_answered",
  "resume_attached",
  "submit_armed",
  "submitting",
  "submitted",
] as const;

export type Checkpoint = (typeof CHECKPOINTS)[number];

const ORDER: ReadonlyMap<Checkpoint, number> = new Map(
  CHECKPOINTS.map((c, index) => [c, index] as const),
);

export function checkpointRank(checkpoint: Checkpoint | null): number {
  return checkpoint === null ? -1 : (ORDER.get(checkpoint) ?? -1);
}

export function isCheckpoint(value: string | null): value is Checkpoint {
  return value !== null && ORDER.has(value as Checkpoint);
}

/**
 * Checkpoints only ever move forward.
 *
 * The backend accepts any checkpoint value from a lease holder, so ordering is
 * enforced here: reporting an earlier checkpoint after a restart would make
 * the audit trail claim the run regressed, and could re-arm a submit.
 */
export function shouldRecord(
  current: Checkpoint | null,
  next: Checkpoint,
): boolean {
  return checkpointRank(next) > checkpointRank(current);
}

/** What the runtime needs to know about a run to decide how to proceed. */
export interface RunProgress {
  status: string;
  currentCheckpoint: string | null;
  submitAttemptedAt: string | null;
  automationMode: string;
  automaticSubmissionAuthorized: boolean;
}

/**
 * Whether a submit was already attempted for this run.
 *
 * True means the runtime must never activate a submit control again, whatever
 * the page now shows. An unconfirmed attempt is reconciled as
 * `submission_unknown` instead of retried.
 */
export function submitAlreadyAttempted(run: RunProgress): boolean {
  return (
    run.submitAttemptedAt !== null ||
    run.currentCheckpoint === "submitting" ||
    run.currentCheckpoint === "submitted"
  );
}

/**
 * Whether the owner has released this run for submission.
 *
 * Release returns the run to `queued` at `submit_armed`. The next claim
 * changes status to `claimed`/`running` without moving the checkpoint, so
 * those statuses must still count as released. `needs_input` does not: that
 * is the armed pause before the owner clicks submit.
 */
export function isReleasedForSubmit(run: RunProgress): boolean {
  if (run.automationMode !== "semi_auto_pause_before_submit") {
    return false;
  }
  if (run.currentCheckpoint !== "submit_armed") {
    return false;
  }
  return (
    run.status === "queued" ||
    run.status === "claimed" ||
    run.status === "running"
  );
}

/**
 * Whether an authorized full-auto run may activate submit without release-submit.
 *
 * Authorization is frozen at creation. A missing flag can never be repaired
 * locally; the runtime must pause with a named reason instead.
 */
export function isAuthorizedForFullAutoSubmit(run: RunProgress): boolean {
  return (
    run.automationMode === "full_auto" &&
    run.automaticSubmissionAuthorized &&
    run.currentCheckpoint === "submit_armed" &&
    !submitAlreadyAttempted(run)
  );
}

/** Where a reclaimed run resumes, given only what the backend already knows. */
export function resumePhaseFor(
  run: RunProgress,
): "reconcile_submit" | "submit" | "fill" {
  if (submitAlreadyAttempted(run)) {
    return "reconcile_submit";
  }
  if (isReleasedForSubmit(run) || isAuthorizedForFullAutoSubmit(run)) {
    return "submit";
  }
  return "fill";
}

export function runProgressFrom(run: {
  status: string;
  current_checkpoint?: string | null;
  submit_attempted_at?: string | null;
  automation_mode: string;
  automatic_submission_authorized?: boolean;
}): RunProgress {
  return {
    status: run.status,
    currentCheckpoint: run.current_checkpoint ?? null,
    submitAttemptedAt: run.submit_attempted_at ?? null,
    automationMode: run.automation_mode,
    automaticSubmissionAuthorized: run.automatic_submission_authorized === true,
  };
}
