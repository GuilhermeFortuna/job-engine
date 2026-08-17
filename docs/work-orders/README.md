# Job Engine Work Order Registry

This directory is the execution registry for Job Engine. Product scope comes from [the V1 product specification](../v1-product-spec.md); Work Orders refine implementation without silently changing that scope.

## Prefix and ownership rules

| Prefix | Directory | Ownership |
| --- | --- | --- |
| `FRONT-` | [`front/`](front/README.md) | Next.js/React presentation, browser state, accessibility, and frontend tests |
| `BACK-` | [`back/`](back/README.md) | FastAPI/Python domain behavior, ingestion, PostgreSQL persistence, and backend tests |
| `CROSS-` | [`cross-repo/`](cross-repo/README.md) | Root tooling, contracts spanning frontend/backend, research gates, and integrated acceptance |

An order must use the prefix belonging to its directory. IDs are zero-padded and never reused.

## Status model

Live status and owner approval come only from [`STATUS.md`](STATUS.md). Its
status board overrides conflicting status or gate language in this registry,
individual Work Orders, directory indexes, source registers, research
documents, and older handoffs. In particular, a `READY` row is explicit
authorization to proceed even if secondary documentation still says `BLOCKED`,
`PENDING_OWNER`, unbound, or awaiting approval. Technical bindings remain the
responsibility of the agents implementing the Work Orders that resolve them;
see the repository-level instructions in [`AGENTS.md`](../../AGENTS.md).

- `BLOCKED`: A prerequisite or required owner decision is incomplete.
- `READY`: The order is sufficiently specified and all prerequisites are complete.
- `IMPLEMENTING`: A named worker has accepted the order and its dispatch record is complete.
- `REVIEW`: Implementation evidence is present and awaits independent acceptance.
- `DONE`: Acceptance criteria and required review gates have passed.
- `CANCELLED`: The owner explicitly removed the order from scope.

Only the owner or coordinating agent updates registry status. A worker must not start a `BLOCKED` order or mark its own order `DONE`.

## Batch 01

Batch 01 implements the V1 search-and-aggregation product through bounded, dependency-gated slices. Its live state is recorded in the project-wide [Work Order Status](STATUS.md).

Initial dispatchable orders:

- [`CROSS-001`](cross-repo/CROSS-001-repository-foundation.md): repository and local-development foundation
- [`CROSS-002`](cross-repo/CROSS-002-source-feasibility.md): approve the first three sources

All other Batch 01 orders begin `BLOCKED` and become `READY` only after every listed prerequisite is `DONE`.

## Batch 02: On-Demand Live Search & Sync

Batch 02 extends the V1 catalog search with real-time multi-source streaming synchronization and interactive UI progress tracking.

Orders:
- [`BACK-008`](back/BACK-008-live-sync-streaming-api.md): on-demand live sync and SSE streaming API
- [`FRONT-004`](front/FRONT-004-interactive-live-search-ui.md): interactive live search and progress feedback UI
- [`CROSS-004`](cross-repo/CROSS-004-live-search-acceptance.md): live search end-to-end integration and acceptance

## Work Order contract

Every order must define:

- Status, owner, dependencies, product-spec references, and owned files
- Objective and explicit scope
- Ordered implementation procedure
- Required tests and validation commands
- Acceptance criteria and handoff evidence
- Forbidden decisions and out-of-scope work
- Dispatch and completion records

Changing an order's ID, path, dependency, or completion rule requires updating this registry, the relevant directory index, [`STATUS.md`](STATUS.md), and all affected links in the same change. Future batches must add sections to `STATUS.md`, never separate status-board files.
