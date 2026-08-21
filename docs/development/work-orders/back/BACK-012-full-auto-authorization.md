# BACK-012: Explicit Full-Auto Authorization and Audit Semantics

**Status:** `READY` (per authoritative `docs/work-orders/STATUS.md`; implementation complete pending owner review)

**Owner:** Unassigned

**Depends on:** CROSS-011

**Unblocks:** CROSS-012, FRONT-006, CROSS-013

**Product contract:** [V2.1 Auto-Apply Owner Outcome Contract](../../v2.1-auto-apply-outcome-contract.md), sections 4–5

**CROSS-011 audit:** [Production-Wiring Audit](../../automation/production-wiring-audit.md), outcomes 3 and 6

## Objective

Make unattended final submission an explicit, durable, auditable backend capability for only the jobs the owner selected. A `FULL_AUTO` run receives authorization once at creation, may submit without `release-submit`, pauses on genuine exceptions, and retains all existing idempotency and submission-uncertainty protections.

## Owned files

- `/apps/api/src/job_engine/domain/applications.py`
- `/apps/api/src/job_engine/api/schemas.py` (application-run authorization fields only)
- `/apps/api/src/job_engine/api/applications.py` (application-run create/read/runner behavior only)
- `/apps/api/src/job_engine/services/applications.py`
- `/apps/api/src/job_engine/db/models.py` (authorization persistence only)
- `/apps/api/src/job_engine/db/repositories.py` (application-run authorization/state only)
- `/apps/api/migrations/versions/*full_auto_authorization*.py` (new, if persistence changes)
- `/apps/api/tests/domain/test_applications.py`
- `/apps/api/tests/db/test_application_repositories.py`
- `/apps/api/tests/db/test_application_claim_release.py`
- `/apps/api/tests/services/test_full_auto_authorization.py` (new)
- `/apps/api/tests/api/test_applications.py`
- `/apps/api/tests/api/test_application_answers.py` (owner-approved contract update only)
- `/apps/api/tests/api/test_runner_claim_release.py` (owner-approved contract update only)

Do not edit Electron, React, applicant-profile/answer-policy behavior, source adapters, or acceptance fixtures.

## Fixed API and state contract

- `POST /api/v1/application-runs` continues to require an explicit `automation_mode`; it never defaults to `FULL_AUTO`.
- `FULL_AUTO` also requires an explicit `resume_id`; the default-resume fallback remains semi-auto-only.
- When `automation_mode` is `full_auto`, the request must include `owner_confirmation` with the exact value `Authorize automatic submission for these selected jobs`. Missing or different confirmation returns `422` and creates no run.
- The authorization applies only to the request's exact `job_group_ids`, chosen `resume_id`, frozen applicant-profile version, frozen answer-bank snapshot, and resulting run IDs. It cannot authorize later-added jobs or a changed resume/profile.
- Persist server-generated `automatic_submission_authorized_at` for each full-auto run. Read models expose the timestamp and boolean authorization state; runner responses expose enough state to enforce it without exposing new secrets.
- Semi-auto creation must not set automatic-submission authorization and retains the existing `release-submit` requirement.
- A full-auto run with valid frozen authorization may progress from ready-for-review to `SUBMITTING` without `release-submit` only after every required field is verified and no pending blocking exception exists.
- `submit_attempted_at`, monotonic checkpoints, one-shot activation, receipt reconciliation, `SUBMISSION_UNKNOWN`, duplicate protection, lease validation, and no-retry-after-attempt remain mandatory.
- `release-submit` rejects `FULL_AUTO`; it remains a semi-auto-only endpoint.

## CROSS-011 binding

- Extend `ApplicationRunCreateRequest` with
  `owner_confirmation: str | None = None`; validate the exact full-auto phrase
  before `ApplicationService.create_runs` opens a transaction or persists any
  member of a multi-job request.
- Extend domain, persistence, owner read, and `RunnerClaimResponse.run` with
  `automatic_submission_authorized_at: datetime | None` and the derived
  `automatic_submission_authorized: bool`. The boolean is true only when the
  timestamp exists on a `full_auto` run; it is never writable by a client.
- Preserve the existing status vocabulary. The full-auto path uses
  `queued -> claimed -> running`, monotonic checkpoints through `submit_armed`,
  then `submitting` immediately before the one allowed activation, followed by
  `submitted`, `submission_unknown`, or a truthful failure. Semi-auto returns to
  `queued` at `submit_armed` only through the existing `release-submit` flow.
- Treat missing authorization, stale frozen data, a pending blocking exception,
  lost lease, prior `submit_attempted_at`, or a non-monotonic checkpoint as a
  hard submission denial. No denial may be repaired by changing modes or
  synthesizing confirmation server-side.
- The focused acceptance path is the exact pytest command below; CROSS-012 and
  FRONT-006 must consume the resulting schema rather than predicting field
  names locally.

## Procedure

1. Re-read the accepted CROSS-011 contract and current create/claim/checkpoint/complete state machine.
2. Add the request, domain, persistence, and read-model authorization fields with one migration if required.
3. Validate authorization before creating any run; make multi-job creation atomic with respect to invalid confirmation.
4. Bind authorized full-auto transitions without weakening lease, exception, duplicate, or receipt rules.
5. Add repository/service/API coverage for authorized, unauthorized, stale-snapshot, semi-auto, duplicate, attempted-submit, and ambiguous-outcome cases.
6. Run the full backend validation and provide migration upgrade/downgrade evidence.

## Required validation

```bash
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src
cd apps/api && uv run pytest tests/domain/test_applications.py tests/db/test_application_repositories.py tests/db/test_application_claim_release.py tests/services/test_full_auto_authorization.py tests/api/test_applications.py
cd apps/api && uv run alembic upgrade head
git diff --check
```

## Acceptance criteria

- No caller can create an implicitly authorized full-auto run.
- One explicit confirmation authorizes only the exact selected job/resume/frozen-data runs.
- Authorized full-auto and semi-auto have distinct, tested submission gates.
- Full-auto never bypasses unresolved required fields, pending exceptions, lease ownership, or one-shot submission protection.
- Confirmed, ambiguous, retryable-before-submit, and final-failure outcomes remain truthful and auditable.
- Migration and focused/full backend checks pass.

## Forbidden decisions

- Do not default, infer, or upgrade a run to `FULL_AUTO`.
- Do not authorize jobs selected by the system rather than the owner.
- Do not allow final submission after CAPTCHA/auth/validation/unresolved-required-field state.
- Do not turn `SUBMISSION_UNKNOWN` into success or permit another submit attempt.
- Do not add credentials, browser cookies, résumé bytes, or sensitive answers to authorization/audit payloads.
- Do not redesign answer policy or frontend presentation.

## Handoff evidence

- Request: `automation_mode` remains required;
  `owner_confirmation: str | None = None` and `resume_id` are required together
  for `full_auto`, with the exact confirmation phrase. Semi-auto rejects that
  authorization field.
- Read/claim projection: `automatic_submission_authorized_at: datetime | None`
  plus server-derived `automatic_submission_authorized: bool`.
- Migration: `0006_full_auto_authorization`, nullable timestamp with no legacy
  backfill. Verified `0006 -> 0005 -> 0006`; current head is
  `0006_full_auto_authorization`.
- State/authorization matrix:

  | Mode | Creation authorization | `submit_armed -> submitting` |
  | --- | --- | --- |
  | `full_auto` | Exact owner phrase, explicit résumé, server timestamp | Valid lease, monotonic checkpoint, consistent frozen scope, no pending exception, no prior attempt |
  | `semi_auto_pause_before_submit` | No full-auto authorization | Same safety gates plus durable `release-submit`; the armed exception is resolved by release |
  | Legacy full-auto without timestamp | Never inferred or backfilled | Denied |

- Validation on 2026-08-19:
  - Ruff check and format check: passed.
  - Strict MyPy over `src tests`: passed (88 files).
  - Focused BACK-012 suite: `46 passed`.
  - Full backend suite: `327 passed, 3 skipped`.
  - `git diff --check`: passed.
- Downstream binding: CROSS-012 and FRONT-006 already name the exact timestamp,
  derived boolean, explicit résumé, and confirmation phrase; no speculative
  downstream schema edits were required.

## Dispatch record

- Worker: Codex
- Branch/worktree: `development` (shared working branch)
- Dispatched at: `2026-08-19T23:13:13-03:00`

## Completion record

- Commit: Pending
- Evidence: Implementation and validation recorded above against base `2712de4`
- Independent reviewer: Pending
