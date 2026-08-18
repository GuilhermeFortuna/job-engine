# Backend Work Orders

Backend orders own Python/FastAPI domain behavior, source ingestion, PostgreSQL persistence, search semantics, and backend validation. They may not move source-specific interpretation or eligibility rules into the frontend.

| ID | Title | Status |
| --- | --- | --- |
| [BACK-001](BACK-001-api-foundation.md) | API foundation | `DONE` |
| [BACK-002](BACK-002-canonical-model-persistence.md) | Canonical model and persistence | `DONE` |
| [BACK-003](BACK-003-normalization-deduplication.md) | Normalization and deduplication | `DONE` |
| [BACK-004](BACK-004-adapter-contract-source-one.md) | Adapter contract and source one | `DONE` |
| [BACK-005](BACK-005-source-two-adapter.md) | Source two adapter | `DONE` |
| [BACK-006](BACK-006-source-three-adapter.md) | Source three adapter | `DONE` |
| [BACK-007](BACK-007-search-api.md) | Search API | `DONE` |
| [BACK-008](BACK-008-live-sync-streaming-api.md) | On-Demand Live Sync and Streaming API | `DONE` |
| [BACK-009](BACK-009-applicant-data-vault.md) | Applicant data vault and resume assets | `DONE` |
| [BACK-010](BACK-010-application-orchestration-audit.md) | Application orchestration, queue, and audit | `DONE` |
| [BACK-011](BACK-011-grounded-application-answering.md) | Grounded application answering | `DONE` |

The authoritative live status is the project-wide [Work Order Status](../STATUS.md).
