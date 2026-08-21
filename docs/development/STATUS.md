# Job Engine development artifacts

Job Engine uses Specification-Driven Development for non-trivial code changes.
New work is authorized by two linked artifacts:

1. a Specification in [`specs/`](specs/), which defines what must exist and why;
2. an Implementation Plan in [`plans/`](plans/), which defines how the approved
   Specification is implemented in the current repository.

The files in [`work-orders/`](work-orders/) are deprecated historical records.
They may explain existing code, but they do not approve, constrain, or supersede
new SDD work.

## Local-first alignment batch

This first SDD batch implements the owner direction in
[`../local-first-product-direction.md`](../local-first-product-direction.md).
Every row is a linked Spec + Plan pair. `Draft` means the artifacts await owner
approval; it does not authorize execution.

| ID | Deliverable | Depends on | State |
| --- | --- | --- | --- |
| [BACK-014 Spec](specs/BACK-014-multi-profile-local-data-spec.md) / [Plan](plans/BACK-014-multi-profile-local-data-plan.md) | Multi-profile applicant data and managed local assets | None | Draft |
| [BACK-015 Spec](specs/BACK-015-local-ai-runtime-spec.md) / [Plan](plans/BACK-015-local-ai-runtime-plan.md) | Shared local-AI runtime, profile extraction, and readiness | BACK-014 | Draft |
| [CROSS-015 Spec](specs/CROSS-015-ats-native-source-feasibility-spec.md) / [Plan](plans/CROSS-015-ats-native-source-feasibility-plan.md) | Greenhouse and Lever source feasibility register | None | Draft |
| [BACK-016 Spec](specs/BACK-016-executable-application-targets-spec.md) / [Plan](plans/BACK-016-executable-application-targets-plan.md) | Executable application targets and ATS-native discovery | CROSS-015 | Draft |
| [BACK-017 Spec](specs/BACK-017-durable-application-batches-spec.md) / [Plan](plans/BACK-017-durable-application-batches-plan.md) | Durable, frozen application batches | BACK-014, BACK-016 | Draft |
| [CROSS-016 Spec](specs/CROSS-016-concurrent-application-runtime-spec.md) / [Plan](plans/CROSS-016-concurrent-application-runtime-plan.md) | Concurrent desktop application worker pool | BACK-015, BACK-017 | Draft |
| [FRONT-007 Spec](specs/FRONT-007-profile-onboarding-experience-spec.md) / [Plan](plans/FRONT-007-profile-onboarding-experience-plan.md) | Guided onboarding and Profile experience | BACK-014, BACK-015 | Draft |
| [FRONT-008 Spec](specs/FRONT-008-profile-aware-search-batch-control-spec.md) / [Plan](plans/FRONT-008-profile-aware-search-batch-control-plan.md) | Profile-aware search and batch Auto Apply control | BACK-014, BACK-016, BACK-017, CROSS-016 | Draft |
| [CROSS-017 Spec](specs/CROSS-017-local-first-product-acceptance-spec.md) / [Plan](plans/CROSS-017-local-first-product-acceptance-plan.md) | Integrated local-first product acceptance | BACK-015, BACK-016, BACK-017, CROSS-016, FRONT-007, FRONT-008 | Draft |

## Intended execution order

- Wave 1 may run BACK-014 and CROSS-015 independently.
- Wave 2 may run BACK-015 and BACK-016 after their respective prerequisites.
- Wave 3 may run BACK-017 and FRONT-007 after their prerequisites.
- Wave 4 may run CROSS-016, then FRONT-008.
- CROSS-017 runs only after every implementation pair is complete and reviewed.

No plan may be dispatched before its Specification and the plan itself are both
approved. A downstream plan must re-check its prerequisite contracts against the
implemented repository before editing.
