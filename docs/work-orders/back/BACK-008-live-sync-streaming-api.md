# BACK-008: On-Demand Live Sync and Streaming API

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-003, BACK-007

**Unblocks:** FRONT-004, CROSS-004

**Product spec:** Sections 6, 11, 14, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Provide a real-time Server-Sent Events (SSE) streaming API that triggers concurrent ingestion across all configured sources (Himalayas, Jobicy, Remote OK), applies normalization and deduplication into the PostgreSQL catalog, and emits structured progress events with rate-limiting and error isolation.

## Owned files

- `/apps/api/src/job_engine/api/sync.py` (new)
- `/apps/api/src/job_engine/services/sync.py` (new)
- `/apps/api/src/job_engine/api/schemas.py` (sync event models only)
- `/apps/api/src/job_engine/main.py` (sync router registration only)
- `/apps/api/tests/api/test_sync.py` (new)
- `/apps/api/tests/services/test_sync.py` (new)

## Fixed HTTP & Event Contract

- Endpoint: `POST /api/v1/catalog/live-sync` (or `GET /api/v1/catalog/live-sync` with `Accept: text/event-stream`).
- Content-Type: `text/event-stream` with chunked transfer encoding.
- Cooldown guard: Global/per-client rate limit or lock preventing concurrent duplicate sync runs if a sync was initiated within the past 30 seconds (returns HTTP 429 or `event: rate_limited`).

### SSE Event Schema

1. `event: sync_started`
   ```json
   { "sources": ["himalayas", "jobicy", "remoteok"], "started_at": "2026-08-17T01:30:00Z" }
   ```
2. `event: source_progress`
   ```json
   {
     "source_id": "himalayas",
     "stage": "fetching" | "normalizing" | "persisting",
     "fetched_count": 25,
     "accepted_count": 20,
     "rejected_count": 0
   }
   ```
3. `event: source_completed`
   ```json
   {
     "source_id": "himalayas",
     "status": "success" | "partial_success" | "failure",
     "inserted_count": 5,
     "updated_count": 15,
     "marked_stale_count": 0,
     "error_summaries": []
   }
   ```
4. `event: sync_completed`
   ```json
   {
     "status": "success" | "partial_success" | "failure",
     "total_inserted": 12,
     "total_updated": 40,
     "total_stale": 2,
     "completed_at": "2026-08-17T01:30:04Z"
   }
   ```

## Procedure

1. Implement `LiveSyncService` in `job_engine.services.sync` to orchestrate parallel source ingestion via `asyncio.gather` while respecting per-source adapter protocols.
2. Implement an asynchronous generator in FastAPI that yields formatted SSE event blocks (`event: <type>\ndata: <json>\n\n`) as each source progresses and completes.
3. Isolate source failures: a timeout or transport error in one source must not abort ingestion for other sources; report partial failures transparently.
4. Implement a lightweight in-memory lock or timestamp check to prevent duplicate parallel sync jobs from overwhelming upstream APIs.
5. Add comprehensive unit and integration tests covering successful concurrent syncs, partial source failure, stream disconnects, and rate limiting.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/api/test_sync.py tests/services/test_sync.py
git diff --check
```

## Acceptance criteria

- `POST /api/v1/catalog/live-sync` streams valid SSE events conforming to the event schema.
- Ingestion across all enabled sources executes concurrently in background tasks.
- Deduplication, normalization, and catalog persistence complete correctly during live sync.
- A failed or rate-limited upstream source emits a `source_completed` failure/partial event without breaking the entire stream.
- Concurrent requests within the cooldown window are safely rejected or debounced.

## Forbidden decisions

- No modifying existing `JobSearchResponse` or `SearchService.search` contracts.
- No client-side HTML or credential leaking in event payloads.
- No unbounded queueing of background sync runs.
- No breaking standalone CLI ingestion (`python -m job_engine.ingest`).

## Handoff evidence

- SSE stream sample transcript for a 3-source run.
- Partial failure test transcript (e.g. simulated 429 on one source).
- Test execution and linting reports.

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
