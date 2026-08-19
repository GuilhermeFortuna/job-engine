# Job Engine Work Order Status

**Scope authorities:** [Job Engine V1 Product Specification](../v1-product-spec.md) for Batch 01–02; [V2 Embedded Assisted Apply Specification](../v2-assisted-apply-spec.md) for Batch 03.

**Registry:** [Work Order Registry](README.md)

This is the sole source of truth for live Work Order status and owner approvals. Add future batches as new sections in this file; do not create batch-specific status boards.

## Authority and precedence

The owner manually records approvals in this file. The status board here
overrides conflicting status fields, dispatch gates, dependency notes, and
pending-owner language in individual Work Orders, directory indexes, source
registers, research documents, and older handoff notes.

- `READY` is explicit authorization to plan, bind, and implement the order
within its documented technical scope. A stale `BLOCKED`, `REVIEW`,
`PENDING_OWNER`, unbound, or awaiting-approval statement elsewhere must not
stop the worker or cause the worker to downgrade the order.
- `IMPLEMENTING` authorizes continued implementation.
- `DONE` records owner acceptance and must not be reopened solely because a
secondary document was not synchronized.
- Only an explicit owner instruction may change an approval status. Conflicting
secondary documentation should be reported in the handoff and corrected when
it is in scope; it is not an implementation blocker.

`STATUS.md` records approval; it does not transfer technical handoff work to the
owner. An agent whose Work Order resolves a downstream source ID, file name,
contract value, or placeholder must update the affected downstream Work Orders,
indexes, and validation commands before handoff. If that propagation was missed
and the downstream order is already `READY`, its assigned worker must reconcile
the omission from the completed prerequisite and current repository evidence,
then continue. A stale placeholder is not an owner-approval request.

## Status board


| ID                                                                    | Area     | Status    | Depends on                                                                          | Deliverable                                                               |
| --------------------------------------------------------------------- | -------- | --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [CROSS-001](cross-repo/CROSS-001-repository-foundation.md)            | Cross    | `DONE`    | None                                                                                | Reproducible monorepo and local-development foundation                    |
| [CROSS-002](cross-repo/CROSS-002-source-feasibility.md)               | Cross    | `DONE`    | None                                                                                | Approved three-source register with access evidence                       |
| [BACK-001](back/BACK-001-api-foundation.md)                           | Backend  | `DONE`    | CROSS-001                                                                           | FastAPI service and backend test foundation                               |
| [FRONT-001](front/FRONT-001-web-foundation.md)                        | Frontend | `DONE`    | CROSS-001                                                                           | Next.js application and frontend test foundation                          |
| [BACK-002](back/BACK-002-canonical-model-persistence.md)              | Backend  | `DONE`    | BACK-001                                                                            | Canonical job catalog models, migrations, and repositories                |
| [BACK-003](back/BACK-003-normalization-deduplication.md)              | Backend  | `DONE`    | BACK-002                                                                            | Deterministic normalization and duplicate grouping                        |
| [BACK-004](back/BACK-004-adapter-contract-source-one.md)              | Backend  | `DONE`    | CROSS-002, BACK-002, BACK-003                                                       | Adapter contract and first approved source                                |
| [BACK-005](back/BACK-005-source-two-adapter.md)                       | Backend  | `DONE`    | CROSS-002, BACK-004                                                                 | Second approved source adapter                                            |
| [BACK-006](back/BACK-006-source-three-adapter.md)                     | Backend  | `DONE`    | CROSS-002, BACK-004                                                                 | Third approved source adapter                                             |
| [BACK-007](back/BACK-007-search-api.md)                               | Backend  | `DONE`    | BACK-003                                                                            | Persisted V1 search and details API                                       |
| [FRONT-002](front/FRONT-002-unified-search-ui.md)                     | Frontend | `DONE`    | FRONT-001, BACK-007                                                                 | URL-backed unified search and results UI                                  |
| [FRONT-003](front/FRONT-003-job-details-resilience.md)                | Frontend | `DONE`    | FRONT-002, BACK-007                                                                 | Details, freshness, partial-failure, responsive, and accessibility states |
| [CROSS-003](cross-repo/CROSS-003-v1-integration-acceptance.md)        | Cross    | `DONE`    | BACK-004, BACK-005, BACK-006, BACK-007, FRONT-003                                   | Integrated three-source V1 acceptance evidence                            |
| [BACK-008](back/BACK-008-live-sync-streaming-api.md)                  | Backend  | `DONE`    | CROSS-003, BACK-007                                                                 | On-demand concurrent live sync and SSE streaming API                      |
| [FRONT-004](front/FRONT-004-interactive-live-search-ui.md)            | Frontend | `DONE`    | FRONT-003, BACK-008                                                                 | Interactive live search and progress feedback UI                          |
| [CROSS-004](cross-repo/CROSS-004-live-search-acceptance.md)           | Cross    | `DONE`    | BACK-008, FRONT-004                                                                 | Live search end-to-end integration and acceptance                         |
| [CROSS-005](cross-repo/CROSS-005-high-automation-feasibility-spec.md) | Cross    | `DONE`    | CROSS-004                                                                           | V2 automation/platform feasibility, specification, and binding gate       |
| [BACK-009](back/BACK-009-applicant-data-vault.md)                     | Backend  | `DONE`    | CROSS-005                                                                           | Applicant profile, answer bank, and local resume-asset catalog            |
| [BACK-010](back/BACK-010-application-orchestration-audit.md)          | Backend  | `DONE`    | CROSS-005, BACK-009                                                                 | Durable application queue, state, idempotency, exceptions, and audit      |
| [BACK-011](back/BACK-011-grounded-application-answering.md)           | Backend  | `DONE`    | CROSS-005, BACK-009                                                                 | Policy-driven deterministic and grounded application answers              |
| [CROSS-006](cross-repo/CROSS-006-browser-automation-runner.md)        | Cross    | `DONE`    | CROSS-005, BACK-009, BACK-010, BACK-011                                             | Secure Electron shell and embedded-browser foundation                     |
| [CROSS-010](cross-repo/CROSS-010-generic-form-assistance.md)          | Cross    | `DONE`    | CROSS-006, BACK-009, BACK-010, BACK-011                                             | Generic normalized form assistance runtime                                |
| [CROSS-007](cross-repo/CROSS-007-first-platform-automation.md)        | Cross    | `READY`   | CROSS-010                                                                           | Greenhouse embedded assisted-apply adapter                                |
| [CROSS-008](cross-repo/CROSS-008-second-platform-automation.md)       | Cross    | `READY`   | CROSS-010                                                                           | Lever embedded assisted-apply adapter                                     |
| [FRONT-005](front/FRONT-005-application-automation-control-center.md) | Frontend | `READY`   | CROSS-010                                                                           | Embedded application workspace and review UI                              |
| [CROSS-009](cross-repo/CROSS-009-automated-application-acceptance.md) | Cross    | `BLOCKED` | BACK-009, BACK-010, BACK-011, CROSS-006, CROSS-010, CROSS-007, CROSS-008, FRONT-005 | Batch 03 embedded assisted-apply acceptance                               |




### Dependency sequence

```text
CROSS-001 -> BACK-001 -> BACK-002 -> BACK-003 -> BACK-004 -> BACK-005
                                             |             -> BACK-006
                                             -> BACK-007
CROSS-001 -> FRONT-001 ---------------------------> FRONT-002 -> FRONT-003
CROSS-002 -------------------------------------> BACK-004

BACK-004 + BACK-005 + BACK-006 + BACK-007 + FRONT-003 -> CROSS-003 (Batch 01 Acceptance)
                                                               │
                                                               ▼
                                                           BACK-008 -> FRONT-004 -> CROSS-004 (Batch 02 Acceptance)

CROSS-004 -> CROSS-005 -> BACK-009 -> BACK-010
                                   -> BACK-011

CROSS-005 + BACK-009 + BACK-010 + BACK-011 -> CROSS-006
CROSS-006 + BACK-009 + BACK-010 + BACK-011 -> CROSS-010
CROSS-010 -> CROSS-007
          -> CROSS-008
          -> FRONT-005

BACK-009 + BACK-010 + BACK-011 + CROSS-006 + CROSS-010
    + CROSS-007 + CROSS-008 + FRONT-005
    -> CROSS-009 (Batch 03 Acceptance)
```

`BACK-005`, `BACK-006`, and `BACK-007` may proceed in parallel after their prerequisites are `DONE`. Documentation research in `CROSS-002` may proceed in parallel with `CROSS-001`.

For the remaining Batch 03 work, `CROSS-006` is the only `READY` order. It creates the secure Electron/browser foundation without form automation. After `CROSS-006` is `DONE`, `CROSS-010` adds the generic assisted runtime. `CROSS-007`, `CROSS-008`, and `FRONT-005` may then proceed in parallel.

### Batch completion rule

- Batch 01 is complete only when `CROSS-003` is `DONE`.
- Batch 02 is complete only when `CROSS-004` is `DONE`.
- Batch 03 is complete only when `CROSS-009` is `DONE`.
- Backend or frontend automated checks do not independently establish product acceptance.



## Project dispatch record


| ID                                                                    | Worker            | Branch/worktree                             | Dispatched at             | Notes                                                                                                        |
| --------------------------------------------------------------------- | ----------------- | ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [CROSS-001](cross-repo/CROSS-001-repository-foundation.md)            | Cursor agent      | `feat/cross-001-repository-foundation`      | 2026-08-15T19:54:00-03:00 | Repository and local-development foundation                                                                  |
| [CROSS-002](cross-repo/CROSS-002-source-feasibility.md)               | Cursor agent      | `development`                               | not recorded              | Source feasibility research; implementation commit `82e2147`; independent-review remediation on this branch  |
| [BACK-001](back/BACK-001-api-foundation.md)                           | Cursor agent      | `feat/back-001-api-foundation`              | 2026-08-16T20:13:35-03:00 | FastAPI service and backend test foundation                                                                  |
| [FRONT-001](front/FRONT-001-web-foundation.md)                        | Cursor agent      | `feat/front-001-web-foundation`             | 2026-08-16T20:15:00-03:00 | Next.js application and frontend test foundation                                                             |
| [BACK-002](back/BACK-002-canonical-model-persistence.md)              | Cursor agent      | `feat/back-002-canonical-model-persistence` | 2026-08-16T20:46:00-03:00 | Canonical job catalog models, migrations, and repositories                                                   |
| [BACK-004](back/BACK-004-adapter-contract-source-one.md)              | Cursor agent      | `development`                               | 2026-08-16T23:00:00-03:00 | Adapter contract and Himalayas source one                                                                    |
| [BACK-007](back/BACK-007-search-api.md)                               | Cursor agent      | `development`                               | 2026-08-16T22:58:00-03:00 | Persisted V1 search and details API; parallel with BACK-004 on this branch                                   |
| [BACK-005](back/BACK-005-source-two-adapter.md)                       | Cursor agent      | `development`                               | 2026-08-17T00:13:00-03:00 | Jobicy source-two adapter; shared `development` checkout                                                     |
| [BACK-006](back/BACK-006-source-three-adapter.md)                     | Cursor agent      | `development`                               | 2026-08-17T00:30:00-03:00 | Remote OK source-three adapter; bound from CROSS-002 `APPROVED_BACKUP`; shared `development` checkout        |
| [FRONT-002](front/FRONT-002-unified-search-ui.md)                     | Antigravity agent | `development`                               | 2026-08-17T00:50:30-03:00 | URL-backed unified search and results UI; shared `development` checkout                                      |
| [FRONT-003](front/FRONT-003-job-details-resilience.md)                | Antigravity agent | `development`                               | 2026-08-17T01:30:00-03:00 | Details, freshness, partial-failure, responsive, and accessibility states; shared `development` checkout     |
| [CROSS-003](cross-repo/CROSS-003-v1-integration-acceptance.md)        | Antigravity agent | `development`                               | 2026-08-17T03:53:14-03:00 | Integrated three-source V1 acceptance evidence; GO decision in `/docs/evidence/v1-acceptance.md`             |
| [CROSS-004](cross-repo/CROSS-004-live-search-acceptance.md)           | Antigravity agent | `development`                               | 2026-08-17T19:03:44-03:00 | Live search end-to-end integration and acceptance; GO decision in `/docs/evidence/live-search-acceptance.md` |
| [CROSS-005](cross-repo/CROSS-005-high-automation-feasibility-spec.md) | Antigravity agent | `development`                               | 2026-08-17T23:30:13-03:00 | V2 specification, platform register, security model, and downstream Batch 03 bindings                        |




## Project decision and exception record


| Date       | Order     | Decision or exception                                                                                                                                                                                                                                                               | Owner             |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-08-15 | CROSS-001 | Pinned Node.js 24.18.0, pnpm 10.34.5, CPython 3.13.14, and postgres:17.11                                                                                                                                                                                                           | Cursor agent      |
| 2026-08-16 | CROSS-002 | WWR programming-feed membership is not software evidence; third primary / BACK-006 remains unbound pending owner/legal review                                                                                                                                                       | Cursor agent      |
| 2026-08-16 | BACK-002  | Technology terms and eligible regions use child tables with unique `(job_group_id, value)`, not arrays                                                                                                                                                                              | Cursor agent      |
| 2026-08-17 | BACK-005  | Source-aware stale thresholds via Settings (`himalayas`=2, `jobicy`=3) in `_mark_stale_absences`; adapter Protocol unchanged                                                                                                                                                        | Cursor agent      |
| 2026-08-17 | BACK-006  | Third source bound to `remoteok` (CROSS-002 `APPROVED_BACKUP`); WWR not implemented; stale after 3 successful misses                                                                                                                                                                | Cursor agent      |
| 2026-08-17 | BACK-008  | Scope Batch 02 on-demand live search with SSE progress streaming; sequented after Batch 01 (FRONT-003, CROSS-003)                                                                                                                                                                   | Project owner     |
| 2026-08-17 | CROSS-003 | V1 integration acceptance complete; all 12 criteria verified against commit 9a45951; GO issued                                                                                                                                                                                      | Antigravity agent |
| 2026-08-17 | CROSS-004 | Batch 02 live search acceptance complete; all 6 criteria verified; GO issued                                                                                                                                                                                                        | Antigravity agent |
| 2026-08-17 | CROSS-005 | Batch 03 targets automatic completion and final submission for owner-selected jobs on supported platforms; routine success has no second review click, while genuine exceptions pause for owner input                                                                               | Project owner     |
| 2026-08-17 | CROSS-005 | Bound [playwright@1.62.1](mailto:playwright@1.62.1), chromium, greenhouse (primary 1), lever (primary 2), ashby (backup 1), smartrecruiters (backup 2), 6-category answer policy, automation modes (FULL_AUTO, SEMI_AUTO), SUBMISSION_UNKNOWN state, retry stages, and LLM cost cap | Antigravity agent |
| 2026-08-18 | Batch 03  | Owner superseded unattended-first presentation/runtime scope with an Electron embedded application workspace. Batch 03 exposes one visible `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` run, requires explicit owner release, retains Playwright for testing, and defers `FULL_AUTO`.            | Project owner     |


