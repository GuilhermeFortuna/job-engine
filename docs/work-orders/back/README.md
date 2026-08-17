# Backend Work Orders

Backend orders own Python/FastAPI domain behavior, source ingestion, PostgreSQL persistence, search semantics, and backend validation. They may not move source-specific interpretation or eligibility rules into the frontend.

| ID | Title | Status |
| --- | --- | --- |
| [BACK-001](BACK-001-api-foundation.md) | API foundation | `DONE` |
| [BACK-002](BACK-002-canonical-model-persistence.md) | Canonical model and persistence | `DONE` |
| [BACK-003](BACK-003-normalization-deduplication.md) | Normalization and deduplication | `REVIEW` |
| [BACK-004](BACK-004-adapter-contract-source-one.md) | Adapter contract and source one | `REVIEW` |
| [BACK-005](BACK-005-source-two-adapter.md) | Source two adapter | `REVIEW` |
| [BACK-006](BACK-006-source-three-adapter.md) | Source three adapter | `REVIEW` |
| [BACK-007](BACK-007-search-api.md) | Search API | `REVIEW` |
| [BACK-008](BACK-008-live-sync-streaming-api.md) | On-Demand Live Sync and Streaming API | `BLOCKED` |

The authoritative live status is the project-wide [Work Order Status](../STATUS.md).
