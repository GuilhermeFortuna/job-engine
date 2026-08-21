# BACK-017 implementation plan: Durable application batches

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Specification:** [`../specs/BACK-017-durable-application-batches-spec.md`](../specs/BACK-017-durable-application-batches-spec.md)  
**Depends on:** BACK-014, BACK-016

## Current-system context

The backend accepts an ordered tuple of `job_group_ids` but the web launcher
creates one run at a time. Runs freeze resume/profile/answer data and enforce
leases, duplicate guards, one-shot submission, exceptions, evidence, and audit,
but there is no batch entity or atomic multi-job authorization.

## Implementation decisions

- Add migration `0010_application_batches.py` with `application_batches` and
  `application_batch_items`. A batch owns the immutable authorization envelope;
  each ordered item owns job/target snapshots and links one run.
- Add non-null `batch_id` and `batch_item_id` to runs while retaining BACK-014's
  `applicant_profile_id`. Backfill each legacy run into one `legacy_import`
  batch/item while preserving the run and all child IDs.
- Batch confirmation text has a server constant/revision. Preview returns that
  revision; create rejects a stale or altered revision. Full-auto authorization
  continues to set each run's existing server-derived authorization fields.
- Use one database transaction and advisory locks over profile plus sorted target
  IDs for validation, duplicate checking, snapshotting, batch/items/runs/events,
  and queue-limit enforcement.

## Ordered implementation

1. Add batch domain states, item snapshots, derived counters, preview issues,
   cancellation rules, and invariants. Keep per-run state machine unchanged.
2. Implement migration/backfill and new scoped indexes: profile+target active or
   submitted uniqueness, batch item order, batch/profile creation order, and run
   foreign-key uniqueness.
3. Add repository methods for transactional preview source loading, atomic batch
   creation, profile-scoped listing/detail, derived aggregation, and idempotent
   cancellation. Do not cache derived state in a second mutable authority.
4. Refactor `ApplicationService.create_runs` into batch preview/authorize
   operations. Validate exact profile/resume versions, managed bytes/hash,
   answer-bank snapshot, executable target/group, duplicate overrides, mode,
   confirmation revision, and full queue capacity before any insert.
5. Add profile-scoped batch schemas/routes and SSE events containing safe batch
   and item identifiers. Extend runner/read schemas with ownership/batch fields;
   keep runner secrets and grants unchanged.
6. Update application answer context and evidence/receipt queries to require the
   run's frozen profile/batch ownership. Ensure later edits never enter a run
   context.
7. Update web API/types minimally so existing per-run pages compile; FRONT-008
   owns the new batch UX.

## Validation

- Test atomic rollback for one bad item, queue overflow, stale profile/resume,
  changed hash, unresolved target, mixed-profile ID, and duplicate conflict.
- Test ordered creation, exact snapshots, profile-aware duplicates and audited
  override, mixed terminal states, cancel rules, SSE projection, restart, and
  application answer context after profile edits.
- Migration tests assert one legacy batch per old run and unchanged run/event/
  evidence/receipt IDs.
- Concurrency tests submit overlapping batches and prove advisory locks prevent
  duplicates and partial insertions.

```bash
corepack pnpm --filter @job-engine/api run check
corepack pnpm --filter @job-engine/api run test
corepack pnpm --filter @job-engine/api run build
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
```

## Completion evidence

Provide schema/migration evidence, atomicity/concurrency test names, a sanitized
multi-item batch projection, restart result, and regression results for leases,
submission, exceptions, and answers. Do not claim concurrent Electron execution
or the final selection UI.
