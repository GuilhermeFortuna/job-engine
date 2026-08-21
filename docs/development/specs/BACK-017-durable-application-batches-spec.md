# BACK-017: Durable, frozen application batches

**Status:** Draft  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Depends on:** BACK-014, BACK-016  
**Implementation plan:** [`../plans/BACK-017-durable-application-batches-plan.md`](../plans/BACK-017-durable-application-batches-plan.md)

## Purpose

Allow a user to select several executable jobs and authorize them once as an
exact, durable batch. The batch freezes identity and policy inputs so later
profile edits cannot change authorized applications.

## Requirements

- An application batch belongs to one applicant profile and contains one or more
  distinct executable target IDs. Maximum batch size defaults to 25 and is
  configurable locally.
- Authorization freezes profile ID/version, selected resume asset ID/version and
  SHA-256, answer-bank IDs/versions/hash, exact job group and target IDs,
  automation mode, known capability exceptions, policy revision, and owner
  confirmation timestamp/text revision.
- One transaction creates the batch, immutable item snapshots, and one queued
  application run per accepted item. Any invalid item rejects the whole request;
  there is no partially authorized batch.
- Later profile, resume, answer, catalog, or target edits do not mutate the
  frozen batch. The runtime consumes frozen snapshots plus verified managed
  bytes. Deleted/archived assets remain retained while referenced.
- Duplicate protection is profile-aware: the same profile cannot silently apply
  twice to the same job/target, while a different profile may apply separately.
  Explicit duplicate override remains audited per item.
- Batch state is derived from item/run states and exposes queued, running,
  needs-attention, submitted, failed, and cancelled counts. Pausing one run does
  not pause unrelated items. Cancelling a batch cancels only queued/pausable
  items and never rewrites submitted or submission-unknown outcomes.
- Restarting the API preserves the batch, queue order, authorization snapshot,
  exceptions, receipts, and terminal results.

## Public contracts

- `POST /api/v1/profiles/{profile_id}/application-batches/preview` validates a
  proposed selection and returns safe known exceptions without authorizing it.
- `POST /api/v1/profiles/{profile_id}/application-batches` accepts profile
  version, resume ID/version, ordered target IDs, one automation mode, duplicate
  overrides, and the exact confirmation revision.
- `GET /api/v1/profiles/{profile_id}/application-batches` and `/{batch_id}`
  return summaries/items scoped to that profile; cancellation is a dedicated
  idempotent command endpoint.
- Existing per-run runner/lease/checkpoint/evidence contracts remain, but every
  new run includes `batch_id`, `batch_item_id`, and `applicant_profile_id`.

## Constraints and non-goals

- The system never chooses jobs or expands the submitted selection.
- Authorization is per exact batch and cannot be reused for later jobs.
- This Spec does not implement runtime concurrency, UI multi-select, ranking, or
  automatic retry of CAPTCHA/authentication/ambiguous submission.

## Acceptance criteria

1. A batch of multiple jobs creates one immutable authorization and exactly one
   isolated run per accepted target, with deterministic queue order.
2. Profile/resume/answer edits after authorization do not change any run's
   frozen inputs, and cross-profile access or resume selection fails closed.
3. One invalid target, stale profile version, changed resume, or duplicate
   conflict prevents the entire batch unless a specific audited override is
   supplied.
4. Batch projections remain correct across mixed run states, cancellation,
   restart, and submission-unknown reconciliation.
5. Existing single-run history remains readable after migration and is assigned
   to a synthetic one-item legacy batch without changing run IDs.

