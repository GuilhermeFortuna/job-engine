# Backend Work Orders

Backend orders own Python/FastAPI domain behavior, source ingestion, PostgreSQL persistence, search semantics, and backend validation. They may not move source-specific interpretation or eligibility rules into the frontend.

| ID | Title | Status |
| --- | --- | --- |
| [BACK-001](BACK-001-api-foundation.md) | API foundation | `REVIEW` |
| [BACK-002](BACK-002-canonical-model-persistence.md) | Canonical model and persistence | `REVIEW` |
| [BACK-003](BACK-003-normalization-deduplication.md) | Normalization and deduplication | `BLOCKED` |
| [BACK-004](BACK-004-adapter-contract-source-one.md) | Adapter contract and source one | `BLOCKED` |
| [BACK-005](BACK-005-source-two-adapter.md) | Source two adapter | `BLOCKED` |
| [BACK-006](BACK-006-source-three-adapter.md) | Source three adapter | `BLOCKED` |
| [BACK-007](BACK-007-search-api.md) | Search API | `BLOCKED` |

The authoritative live status is the project-wide [Work Order Status](../STATUS.md).
