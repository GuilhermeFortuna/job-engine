# BACK-012: Explicit Full-Auto Authorization and Audit Semantics

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-011

**Unblocks:** CROSS-012, FRONT-006, CROSS-013

**Product contract:** `docs/v2.1-auto-apply-outcome-contract.md` after CROSS-011 acceptance

## Objective

Make unattended final submission an explicit, durable, auditable backend capability for only the jobs the owner selected. A `FULL_AUTO` run receives authorization once at creation, may submit without `release-submit`, pauses on genuine exceptions, and retains all existing idempotency and submission-uncertainty protections.

## Owned files

- `/apps/api/src/job_engine/domain/applications.py`
- `/apps/api/src/job_engine/api/schemas.py` (application-run authorization fields only)
- `/apps/api/src/job_engine/api/applications.py` (application-run create/read/runner behavior only)
- `/apps/api/src/job_engine/services/applications.py`
- `/apps/api/src/job_engine/db/models.py` (authorization persistence only)
- `/apps/api/src/job_engine/db/repositories.py` (application-run authorization/state only)
- `/apps/api/alembic/versions/*full_auto_authorization*.py` (new, if persistence changes)
- `/apps/api/tests/domain/test_applications.py`
- `/apps/api/tests/db/test_application_repositories.py`
- `/apps/api/tests/db/test_application_claim_release.py`
- `/apps/api/tests/services/test_full_auto_authorization.py` (new)
- `/apps/api/tests/api/test_applications.py`

Do not edit Electron, React, applicant-profile/answer-policy behavior, source adapters, or acceptance fixtures.

## Fixed API and state contract

- `POST /api/v1/application-runs` continues to require an explicit `automation_mode`; it never defaults to `FULL_AUTO`.
- When `automation_mode` is `full_auto`, the request must include `owner_confirmation` with the exact value `Authorize automatic submission for these selected jobs`. Missing or different confirmation returns `422` and creates no run.
- The authorization applies only to the request's exact `job_group_ids`, chosen `resume_id`, frozen applicant-profile version, frozen answer-bank snapshot, and resulting run IDs. It cannot authorize later-added jobs or a changed resume/profile.
- Persist server-generated `automatic_submission_authorized_at` for each full-auto run. Read models expose the timestamp and boolean authorization state; runner responses expose enough state to enforce it without exposing new secrets.
- Semi-auto creation must not set automatic-submission authorization and retains the existing `release-submit` requirement.
- A full-auto run with valid frozen authorization may progress from ready-for-review to `SUBMITTING` without `release-submit` only after every required field is verified and no pending blocking exception exists.
- `submit_attempted_at`, monotonic checkpoints, one-shot activation, receipt reconciliation, `SUBMISSION_UNKNOWN`, duplicate protection, lease validation, and no-retry-after-attempt remain mandatory.
- `release-submit` rejects `FULL_AUTO`; it remains a semi-auto-only endpoint.

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

- Exact request/read schema and migration revision
- State-transition and authorization matrix
- Focused test transcript plus backend lint/type results
- Upgrade/downgrade evidence if a migration is added
- Downstream binding notes for CROSS-012 and FRONT-006

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development` (shared working branch)
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
