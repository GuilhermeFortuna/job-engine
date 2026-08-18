# BACK-010: Application Orchestration, Queue, and Audit

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-009

**Unblocks:** CROSS-006, FRONT-005, CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md` (bound by CROSS-005)

## Objective

Own the durable application-run state machine, selected-job queue, runner lease protocol, duplicate-submission protection, exception lifecycle, resume-asset grants, and redacted audit trail required for recoverable automatic submission.

## Owned files

- `/apps/api/src/job_engine/domain/applications.py` (new)
- `/apps/api/src/job_engine/services/applications.py` (new)
- `/apps/api/src/job_engine/api/applications.py` (new)
- `/apps/api/src/job_engine/api/schemas.py` (application-run schemas only)
- `/apps/api/src/job_engine/db/models.py` (application-run/event/exception entities only)
- `/apps/api/src/job_engine/db/repositories.py` (application-run persistence only)
- `/apps/api/src/job_engine/main.py` (application router registration only)
- `/apps/api/src/job_engine/config.py` (runner-token, lease, queue, and evidence settings only)
- `/apps/api/alembic/versions/<revision>_add_application_runs.py` (new; replace before handoff)
- `/apps/api/tests/domain/test_applications.py` (new)
- `/apps/api/tests/services/test_applications.py` (new)
- `/apps/api/tests/api/test_applications.py` (new)
- `/apps/api/tests/db/test_application_repositories.py` (new)
- `/.env.example` (non-secret runner configuration names only)

## Fixed state contract

Application runs use a closed state machine:

```text
QUEUED -> CLAIMED -> RUNNING -> SUBMITTED
                     |  |  |
                     |  |  -> NEEDS_INPUT -> QUEUED
                     |  -> PAUSED_AUTH -> QUEUED
                     -> FAILED_RETRYABLE -> QUEUED
                     -> FAILED_FINAL
                     -> SUBMISSION_UNKNOWN
QUEUED/NEEDS_INPUT/PAUSED_AUTH/FAILED_RETRYABLE -> CANCELLED
```

No terminal state (`SUBMITTED`, `SUBMISSION_UNKNOWN`, `FAILED_FINAL`, `CANCELLED`) may transition back to an executable state. `SUBMITTED` requires receipt evidence; reaching or clicking a submit control is not proof of submission. `SUBMISSION_UNKNOWN` captures ambiguous post-submit navigation or unverified confirmation without triggering a duplicate click.

Each run records the job group, exact source posting/application URL, selected resume ID and checksum, automation mode (`FULL_AUTO` or `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`), applicant-profile version, answer-bank version, platform adapter ID, policy snapshot, timestamps, attempt count, current step, terminal reason, and redacted receipt summary.

## Queue and idempotency contract

- Runs originate only from explicit user-selected job group IDs.
- Default concurrency is 1 and queue limit is 25 (as bound by CROSS-005) and is enforced by runner leases, not UI convention.
- Prevent a new executable run when the same canonical application URL or job group already has an active or `SUBMITTED` run.
- A duplicate override requires an explicit endpoint call, owner confirmation text, and an audit event; retries within the same run are not duplicate applications.
- Claims use opaque hashed runner credentials, short leases, heartbeats, and compare-and-set state/version updates.
- Lease expiry makes a non-terminal run reclaimable from its last committed checkpoint without replaying an already confirmed submission step.

## Fixed API contract

User-facing:

- `POST /api/v1/application-runs` with one or more explicitly selected job group IDs, resume ID, and automation mode (`FULL_AUTO` or `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`)
- `GET /api/v1/application-runs` with state/date/job filters and pagination
- `GET /api/v1/application-runs/stream` for real-time Server-Sent Events (SSE) run progress and exception updates
- `GET /api/v1/application-runs/{run_id}`
- `POST /api/v1/application-runs/{run_id}/answers` to resolve a named exception and requeue
- `POST /api/v1/application-runs/{run_id}/release-submit` to release only a `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` run whose latest durable checkpoint is `SUBMIT_ARMED`; record owner confirmation and requeue at that checkpoint
- `POST /api/v1/application-runs/{run_id}/resume`
- `POST /api/v1/application-runs/{run_id}/cancel`
- `POST /api/v1/application-runs/{run_id}/duplicate-override`

Runner-only, authenticated:

- `POST /api/v1/runner/claim`
- `POST /api/v1/runner/runs/{run_id}/heartbeat`
- `POST /api/v1/runner/runs/{run_id}/events`
- `POST /api/v1/runner/runs/{run_id}/checkpoint`
- `POST /api/v1/runner/runs/{run_id}/complete`
- `GET /api/v1/runner/runs/{run_id}/resume-asset` using a single-use, run-scoped, checksum-bound grant

Event payloads use monotonic sequence numbers and an idempotency key. Reject out-of-order, cross-run, expired, oversized, or invalid-transition events.

## Audit and evidence contract

- Store structured event facts, field identifiers, policy decisions, and hashes; do not store passwords, cookies, access tokens, complete page HTML, or sensitive answer values in general logs.
- Evidence files live beneath the configured evidence root using generated run/attempt identifiers and canonical path confinement.
- Store screenshot/DOM artifact metadata and SHA-256 in PostgreSQL. Redaction and retention follow CROSS-005 bindings.
- Receipt evidence must contain at least a platform adapter ID, final URL or platform receipt identifier, observed confirmation signal, capture timestamp, and artifact hash.
- API responses distinguish `submitted`, `submission_unknown`, and `failed`; uncertainty is never promoted to success.

## Procedure

1. Implement closed enums and transition validation before persistence or routes.
2. Add normalized application-run, attempt, event, exception, and evidence metadata tables with uniqueness/idempotency constraints.
3. Implement selected-job creation with current job/posting validation and canonical duplicate detection.
4. Implement lease claim, heartbeat, expiry/reclaim, checkpoint, event sequencing, and terminal completion transactionally.
5. Implement run-scoped resume grants that stream only the selected checksum-verified PDF and expire after one successful retrieval or the bound TTL.
6. Implement user exception resolution, resume, cancellation, and explicit duplicate override.
7. Add tests for every valid/invalid transition, concurrent claims, stale versions, lease expiry, event replay, duplicate creation, receipt requirements, path confinement, redaction, and asset-grant replay.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/domain/test_applications.py tests/services/test_applications.py tests/api/test_applications.py tests/db/test_application_repositories.py
git diff --check
```

## Acceptance criteria

- Explicitly selected single and multi-job requests create deterministic, inspectable queue entries.
- Concurrent claim, lease-expiry, restart/reclaim, event replay, and duplicate-submission tests prove state integrity.
- Resume bytes require a valid single-use run grant and checksum match.
- `SUBMITTED` cannot be recorded without receipt evidence; ambiguous browser outcomes remain non-success states.
- Sensitive values, cookies, credentials, absolute resume paths, and complete page bodies are absent from logs and general API responses.
- Application runs survive API and runner restart without replaying confirmed terminal actions.

## Forbidden decisions

- Do not create runs for jobs the owner did not select.
- Do not use in-memory-only queue or audit state.
- Do not introduce Redis, a broker, a cloud workflow system, or background platform unrelated to the fixed local runner.
- Do not allow the frontend to declare a run submitted.
- Do not delete local resume or evidence files through an API.
- Do not implement browser selectors, platform adapters, generated answers, or presentation UI.

## Handoff evidence

- State-transition and idempotency matrix
- Migration and repository evidence
- Concurrent-claim/restart/replay test transcripts
- Redacted API and audit examples
- Resume-grant replay rejection evidence

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
