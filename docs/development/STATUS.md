# Job Engine Specification + Plan Status

Job Engine uses Specification-Driven Development for non-trivial code changes.
New work is governed by two linked artifacts:

1. a Specification in `[specs/](specs/)`, which defines what must exist and why;
2. an Implementation Plan in `[plans/](plans/)`, which defines how the approved
  Specification is implemented in the current repository.

The files in `[work-orders/](work-orders/)` are deprecated historical records.
They may explain existing code, but they do not approve, constrain, or supersede
new SDD work.

This file is the sole source of truth for live Specification + Plan status and
owner approvals. Individual artifact headers, dependency notes, implementation
handoffs, deprecated Work Order statuses, and older evidence must not override
this board.

## Status values

- `BLOCKED`: A prerequisite or required owner decision is incomplete. The pair
must not be implemented.
- `READY`: The owner has approved both the Specification and Implementation Plan,
all prerequisites are complete, and implementation is authorized.
- `IMPLEMENTING`: A named executor is implementing the approved pair.
- `REVIEW`: Implementation evidence is present and awaits independent review or
owner acceptance.
- `DONE`: Acceptance criteria and required review gates have passed, and the
owner has accepted the pair.

Only the repository owner may change a pair to `READY` or `DONE`. Executors and
reviewers may provide evidence for a transition but must not self-authorize or
self-accept their work.

## Local-first alignment batch

This first SDD batch implements the owner direction in
`[../local-first-product-direction.md](../local-first-product-direction.md)`.
Every row is a linked Spec + Plan pair. All pairs begin `BLOCKED` because their
Specs and Plans have not yet received owner approval. Approval alone does not
unblock a downstream pair until every listed dependency is `DONE`.


| ID                                                                                                                                                | Area     | Status    | Depends on                                                    | Deliverable                                                | Current blocker                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [BACK-014 Spec](specs/BACK-014-multi-profile-local-data-spec.md) / [Plan](plans/BACK-014-multi-profile-local-data-plan.md)                        | Backend  | `DONE`    | None                                                          | Multi-profile applicant data and managed local assets      | Owner approval of Spec + Plan                                                           |
| [CROSS-015 Spec](specs/CROSS-015-ats-native-source-feasibility-spec.md) / [Plan](plans/CROSS-015-ats-native-source-feasibility-plan.md)           | Cross    | `DONE`    | None                                                          | Greenhouse and Lever source feasibility register           | Owner approval of register revision `CROSS-015-REG-2026-08-21.1`; do not start BACK-016 |
| [BACK-015 Spec](specs/BACK-015-local-ai-runtime-spec.md) / [Plan](plans/BACK-015-local-ai-runtime-plan.md)                                        | Backend  | `DONE`    | BACK-014                                                      | Shared local-AI runtime, profile extraction, and readiness | Implementation evidence ready for review; DB/API integration tests need Postgres        |
| [BACK-016 Spec](specs/BACK-016-executable-application-targets-spec.md) / [Plan](plans/BACK-016-executable-application-targets-plan.md)            | Backend  | `DONE`    | CROSS-015                                                     | Executable application targets and ATS-native discovery    | Implementation complete; ready for review                                               |
| [BACK-017 Spec](specs/BACK-017-durable-application-batches-spec.md) / [Plan](plans/BACK-017-durable-application-batches-plan.md)                  | Backend  | `READY`   | BACK-014, BACK-016                                            | Durable, frozen application batches                        | Owner approval; dependencies must be `DONE`                                             |
| [FRONT-007 Spec](specs/FRONT-007-profile-onboarding-experience-spec.md) / [Plan](plans/FRONT-007-profile-onboarding-experience-plan.md)           | Frontend | `READY`   | BACK-014, BACK-015                                            | Guided onboarding and Profile experience                   | Owner approval; dependencies must be `DONE`                                             |
| [CROSS-016 Spec](specs/CROSS-016-concurrent-application-runtime-spec.md) / [Plan](plans/CROSS-016-concurrent-application-runtime-plan.md)         | Cross    | `BLOCKED` | BACK-015, BACK-017                                            | Concurrent desktop application worker pool                 | Owner approval; dependencies must be `DONE`                                             |
| [FRONT-008 Spec](specs/FRONT-008-profile-aware-search-batch-control-spec.md) / [Plan](plans/FRONT-008-profile-aware-search-batch-control-plan.md) | Frontend | `BLOCKED` | BACK-014, BACK-016, BACK-017, CROSS-016                       | Profile-aware search and batch Auto Apply control          | Owner approval; dependencies must be `DONE`                                             |
| [CROSS-017 Spec](specs/CROSS-017-local-first-product-acceptance-spec.md) / [Plan](plans/CROSS-017-local-first-product-acceptance-plan.md)         | Cross    | `BLOCKED` | BACK-015, BACK-016, BACK-017, CROSS-016, FRONT-007, FRONT-008 | Integrated local-first product acceptance                  | Owner approval; all implementation dependencies must be `DONE`                          |




## Intended execution order

- Wave 1 may run BACK-014 and CROSS-015 independently.
- Wave 2 may run BACK-015 and BACK-016 after their respective prerequisites.
- Wave 3 may run BACK-017 and FRONT-007 after their prerequisites.
- Wave 4 may run CROSS-016, then FRONT-008.
- CROSS-017 runs only after every implementation pair is complete and reviewed.

BACK-014 and CROSS-015 may become `READY` independently after owner approval.
Later pairs remain `BLOCKED` until their listed prerequisites are `DONE` and the
owner explicitly changes their status to `READY`. A downstream executor must
re-check prerequisite contracts against the implemented repository before editing.