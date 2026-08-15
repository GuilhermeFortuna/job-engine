# Job Engine Work Order Status

**Scope authority:** [Job Engine V1 Product Specification](../v1-product-spec.md)

**Registry:** [Work Order Registry](README.md)

This is the single status authority for all current and future Job Engine Work Orders. Add future batches as new sections in this file; do not create batch-specific status boards.

## Batch 01

### Status board

| ID | Area | Status | Depends on | Deliverable |
| --- | --- | --- | --- | --- |
| [CROSS-001](cross-repo/CROSS-001-repository-foundation.md) | Cross | `READY` | None | Reproducible monorepo and local-development foundation |
| [CROSS-002](cross-repo/CROSS-002-source-feasibility.md) | Cross | `READY` | None | Approved three-source register with access evidence |
| [BACK-001](back/BACK-001-api-foundation.md) | Backend | `BLOCKED` | CROSS-001 | FastAPI service and backend test foundation |
| [FRONT-001](front/FRONT-001-web-foundation.md) | Frontend | `BLOCKED` | CROSS-001 | Next.js application and frontend test foundation |
| [BACK-002](back/BACK-002-canonical-model-persistence.md) | Backend | `BLOCKED` | BACK-001 | Canonical job catalog models, migrations, and repositories |
| [BACK-003](back/BACK-003-normalization-deduplication.md) | Backend | `BLOCKED` | BACK-002 | Deterministic normalization and duplicate grouping |
| [BACK-004](back/BACK-004-adapter-contract-source-one.md) | Backend | `BLOCKED` | CROSS-002, BACK-002, BACK-003 | Adapter contract and first approved source |
| [BACK-005](back/BACK-005-source-two-adapter.md) | Backend | `BLOCKED` | CROSS-002, BACK-004 | Second approved source adapter |
| [BACK-006](back/BACK-006-source-three-adapter.md) | Backend | `BLOCKED` | CROSS-002, BACK-004 | Third approved source adapter |
| [BACK-007](back/BACK-007-search-api.md) | Backend | `BLOCKED` | BACK-003 | Persisted V1 search and details API |
| [FRONT-002](front/FRONT-002-unified-search-ui.md) | Frontend | `BLOCKED` | FRONT-001, BACK-007 | URL-backed unified search and results UI |
| [FRONT-003](front/FRONT-003-job-details-resilience.md) | Frontend | `BLOCKED` | FRONT-002, BACK-007 | Details, freshness, partial-failure, responsive, and accessibility states |
| [CROSS-003](cross-repo/CROSS-003-v1-integration-acceptance.md) | Cross | `BLOCKED` | BACK-004, BACK-005, BACK-006, BACK-007, FRONT-003 | Integrated three-source V1 acceptance evidence |

### Dependency sequence

```text
CROSS-001 -> BACK-001 -> BACK-002 -> BACK-003 -> BACK-004 -> BACK-005
                                             |             -> BACK-006
                                             -> BACK-007
CROSS-001 -> FRONT-001 ---------------------------> FRONT-002 -> FRONT-003
CROSS-002 -------------------------------------> BACK-004

BACK-004 + BACK-005 + BACK-006 + BACK-007 + FRONT-003 -> CROSS-003
```

`BACK-005`, `BACK-006`, and `BACK-007` may proceed in parallel after their prerequisites are `DONE`. Documentation research in `CROSS-002` may proceed in parallel with `CROSS-001`.

### Batch completion rule

Batch 01 is complete only when `CROSS-003` is `DONE`. Backend or frontend automated checks do not independently establish product acceptance.

## Project dispatch record

| ID | Worker | Branch/worktree | Dispatched at | Notes |
| --- | --- | --- | --- | --- |
| — | — | — | — | No orders dispatched yet |

## Project decision and exception record

| Date | Order | Decision or exception | Owner |
| --- | --- | --- | --- |
| — | — | None | — |
