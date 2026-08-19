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
 * The backend puts a released run back in the queue with the checkpoint still
 * at `submit_armed`; that pairing is the only thing that authorizes a submit.
 */
export function isReleasedForSubmit(run: RunProgress): boolean {
  return (
    run.automationMode === "semi_auto_pause_before_submit" &&
    run.status === "queued" &&
    run.currentCheckpoint === "submit_armed"
  );
}

/** Where a reclaimed run resumes, given only what the backend already knows. */
export function resumePhaseFor(
  run: RunProgress,
): "reconcile_submit" | "submit" | "fill" {
  if (submitAlreadyAttempted(run)) {
    return "reconcile_submit";
  }
  if (isReleasedForSubmit(run)) {
    return "submit";
  }
  return "fill";
}
