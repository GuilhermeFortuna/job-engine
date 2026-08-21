# Frontend Work Orders

Frontend orders own the Next.js/React interface, browser URL state, accessibility, responsive behavior, and frontend tests. They consume backend contracts and must not reimplement normalization, deduplication, or eligibility policy.

| ID | Title | Status |
| --- | --- | --- |
| [FRONT-001](FRONT-001-web-foundation.md) | Web foundation | `DONE` |
| [FRONT-002](FRONT-002-unified-search-ui.md) | Unified search UI | `DONE` |
| [FRONT-003](FRONT-003-job-details-resilience.md) | Job details and resilience | `DONE` |
| [FRONT-004](FRONT-004-interactive-live-search-ui.md) | Interactive live search UI | `DONE` |
| [FRONT-005](FRONT-005-application-automation-control-center.md) | Embedded application workspace | `DONE` |
| [FRONT-006](FRONT-006-visible-automation-control-center.md) | Visible auto-apply control center and readiness UI | `BLOCKED` |

FRONT-006 is bound to the candidate
[V2.1 Owner Outcome Contract](../../v2.1-auto-apply-outcome-contract.md) and the
[CROSS-011 Production-Wiring Audit](../../automation/production-wiring-audit.md):
Applications must be globally visible, every applicable job must show one named
capability state, and full-auto routine success has no second release control.
Implementation remains blocked by the authoritative status board.

The authoritative live status is the project-wide [Work Order Status](../STATUS.md).
