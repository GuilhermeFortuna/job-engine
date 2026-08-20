# Job Engine Work Order Registry

This directory is the execution registry for Job Engine. Batch 01 and Batch 02 scope comes from [the V1 product specification](../v1-product-spec.md). Batch 03 scope comes from the owner-approved [V2 Embedded Assisted Apply specification](../v2-assisted-apply-spec.md). Batch 04 begins with [`CROSS-011`](cross-repo/CROSS-011-auto-apply-outcome-lock.md), which must freeze the V2.1 owner outcome before implementation orders proceed. Orders must not silently change an accepted scope or owner-visible outcome.

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

## Batch 03: Embedded Assisted Apply

Batch 03 turns one explicitly selected job into a visible desktop application workspace. The embedded runtime assists with supported fields and navigation, the owner reviews the real form and unresolved decisions, and final submission requires an explicit trusted-UI release.

Initial dispatchable order:

- [`CROSS-005`](cross-repo/CROSS-005-high-automation-feasibility-spec.md): bind the V2 specification, runtime, two primary application platforms, answer policy, and security/acceptance contracts

The accepted backend foundation remains in force. The 2026-08-18 owner pivot replaces the undispatched runtime and presentation path without reopening BACK-009, BACK-010, or BACK-011.

- [`BACK-009`](back/BACK-009-applicant-data-vault.md): applicant profile, reusable answer bank, and local resume-asset catalog
- [`BACK-010`](back/BACK-010-application-orchestration-audit.md): durable queue, runner leases, idempotency, exceptions, and audit evidence
- [`BACK-011`](back/BACK-011-grounded-application-answering.md): policy-driven deterministic and grounded application answers
- [`CROSS-006`](cross-repo/CROSS-006-browser-automation-runner.md): secure Electron shell and embedded-browser foundation
- [`CROSS-010`](cross-repo/CROSS-010-generic-form-assistance.md): normalized generic form assistance and reconciled manual-release runtime
- [`CROSS-007`](cross-repo/CROSS-007-first-platform-automation.md): Greenhouse embedded assisted-apply adapter
- [`CROSS-008`](cross-repo/CROSS-008-second-platform-automation.md): Lever embedded assisted-apply adapter
- [`FRONT-005`](front/FRONT-005-application-automation-control-center.md): embedded application workspace, review, exceptions, and receipt interface
- [`CROSS-009`](cross-repo/CROSS-009-automated-application-acceptance.md): independent end-to-end embedded assisted-apply acceptance

Batch 03 does not authorize `FULL_AUTO`, background multi-job queues, autonomous job selection, CAPTCHA/access-control bypass, unauthorized live test applications, or fabricated applicant facts. The retained backend enum is not product authorization.

## Batch 04: Auto-Apply Production Remediation

Batch 04 repairs the gap between Batch 03's tested modules and the visible production desktop product. It restores explicitly authorized `FULL_AUTO` for owner-selected jobs, connects the automation runtime to the real Electron entrypoint, makes readiness/actions/status discoverable, and requires production-path plus owner-visible acceptance.

The candidate [V2.1 Owner Outcome Contract](../v2.1-auto-apply-outcome-contract.md)
freezes the exact routes, modes, authorization phrase, state and exception rules,
AI boundary, coverage calculation, and evidence layers. The companion
[Production-Wiring Audit](../automation/production-wiring-audit.md) records that
the current production Electron entrypoint creates the secure visible browser
surface but does not construct the automation runtime; current end-to-end
runtime construction is fixture-only. These documents are technical bindings,
not owner acceptance or production proof.

- [`CROSS-011`](cross-repo/CROSS-011-auto-apply-outcome-lock.md): freeze the V2.1 outcome, audit production wiring, and bind downstream contracts
- [`BACK-012`](back/BACK-012-full-auto-authorization.md): persist and enforce exact owner authorization for unattended submission
- [`BACK-013`](back/BACK-013-hybrid-ai-answer-provider.md): add deterministic-first local/Gemini grounded narrative answers and an evaluation/privacy gate
- [`CROSS-012`](cross-repo/CROSS-012-production-runtime-integration.md): compose the automation runtime from the production Electron main process
- [`CROSS-014`](cross-repo/CROSS-014-broad-application-platform-coverage.md): inventory downstream ATS providers and prove broad embedded-browser auto-apply coverage
- [`FRONT-006`](front/FRONT-006-visible-automation-control-center.md): expose Applications, readiness, explicit modes, actions, exceptions, and results
- [`CROSS-013`](cross-repo/CROSS-013-auto-apply-production-acceptance.md): prove the real production path and obtain owner-visible acceptance

Only `CROSS-011` begins `READY`. After it is accepted, BACK-012 and BACK-013 may proceed independently when the authoritative status board marks them `READY`; later orders remain `BLOCKED` until their recorded prerequisites and owner approval are complete.

## Work Order contract

Every order must define:

- Status, owner, dependencies, product-spec references, and owned files
- Objective and explicit scope
- Ordered implementation procedure
- Required tests and validation commands
- Acceptance criteria and handoff evidence
- Forbidden decisions and out-of-scope work
- Dispatch and completion records

Every batch that changes an owner-visible workflow must also define an **Owner Outcome Contract**. Any later proposal that changes a routine user action, automation level, visible destination, success condition, or intervention rule requires a before/after behavior table and explicit owner approval before downstream implementation proceeds. A decision-log sentence alone cannot silently supersede that contract.

Acceptance must prove reachability from the production entrypoint. Unit tests, jsdom, mocked bridges, and fixture-only composition are supporting evidence, not proof that the visible product executes the feature. Frontend or cross-product acceptance remains `REVIEW` until the owner receives a named commit and visible walkthrough evidence.

Changing an order's ID, path, dependency, or completion rule requires updating this registry, the relevant directory index, [`STATUS.md`](STATUS.md), and all affected links in the same change. Future batches must add sections to `STATUS.md`, never separate status-board files.
