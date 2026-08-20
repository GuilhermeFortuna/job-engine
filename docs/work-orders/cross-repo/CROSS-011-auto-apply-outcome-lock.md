# CROSS-011: Auto-Apply Outcome Lock and Production-Wiring Audit

**Status:** `READY`

**Owner:** Unassigned

**Depends on:** CROSS-009 evidence

**Unblocks:** BACK-012, CROSS-012, FRONT-006

**Product authority:** Owner-approved Batch 04 outcome in this order; the completed deliverable becomes `docs/v2.1-auto-apply-outcome-contract.md`

## Objective

Freeze the user-visible V2.1 outcome before more code is written, audit the difference between the Batch 03 implementation and production behavior, and bind every Batch 04 order to one traceable contract. The repaired product must let the owner explicitly select jobs and authorize automatic supported-platform submission once, then proceed without a routine final-review click while pausing for genuine exceptions.

## Owned files

- `/docs/v2.1-auto-apply-outcome-contract.md` (new)
- `/docs/automation/production-wiring-audit.md` (new)
- `/docs/work-orders/back/BACK-012-full-auto-authorization.md` (binding updates only)
- `/docs/work-orders/cross-repo/CROSS-012-production-runtime-integration.md` (binding updates only)
- `/docs/work-orders/front/FRONT-006-visible-automation-control-center.md` (binding updates only)
- `/docs/work-orders/cross-repo/CROSS-013-auto-apply-production-acceptance.md` (binding updates only)
- `/docs/work-orders/README.md` and directory indexes (Batch 04 binding text only)

Do not edit product code, tests, fixtures, existing Batch 03 completion records, or approval statuses.

## Fixed owner outcome

The outcome contract must state all of the following without weakening them:

1. The desktop UI always exposes an **Applications** destination.
2. Every job with an application URL displays exactly one understandable state: **Auto apply**, **Apply with assistance**, or **Automation unavailable** with a reason. Capability failure must never silently remove the feature.
3. The owner selects the exact job or jobs and registered resume, chooses the mode, and gives one explicit authorization when creating a `FULL_AUTO` run.
4. A supported `FULL_AUTO` run fills authorized fields, uploads the verified resume, advances intermediate steps, activates final submit, and reconciles a receipt without a second routine click.
5. Missing or sensitive answers, low confidence, authentication, CAPTCHA, validation failures, unsupported required controls, platform drift, and ambiguous submission pause or stop truthfully.
6. No autonomous job selection, fabricated applicant fact, credential capture, CAPTCHA bypass, access-control bypass, or blind retry after a submission attempt is allowed.
7. The Applications destination exposes readiness, queued/running/needs-attention/terminal state, mode, selected resume, audit progress, and receipt or uncertainty.
8. Ordinary browser use remains safe and explains that automation requires the desktop runtime.

## Required audit

- Trace the production path from `apps/desktop/src/main/index.ts` through IPC, `ApplicationViewManager`, the application session, runtime coordinator, lease, `StepRunner`, form transport, adapter, backend events, and receipt.
- Record every production path that is absent or composed only by tests/fixture drivers. In particular, verify whether any production module instantiates `StepRunner`, `LeaseManager`, `RunnerClient`, `EvidenceRecorder`, and Greenhouse/Lever/generic adapters.
- Produce a matrix with columns: owner outcome, Work Order, production entrypoint, implementation file, automated proof, real-Electron proof, owner-visible proof, and current gap.
- Compare the original automatic-submission decision, the later semi-auto pivot, the current V2 specification, Work Orders, implementation, and acceptance evidence. Mark superseded behavior explicitly; do not silently rewrite history.
- Bind exact API fields, runtime transitions, UI routes/actions, supported modes, exception rules, and acceptance commands into the four downstream orders.

## Procedure

1. Re-read `docs/work-orders/STATUS.md`, both Batch 03 owner decisions, the V2 specification, every Batch 03 Work Order, and its evidence.
2. Inspect production imports and composition separately from test/fixture composition.
3. Write the V2.1 outcome contract using the fixed owner outcome above and a before/after behavior table.
4. Write the wiring audit and traceability matrix with file/line evidence.
5. Replace downstream placeholders with the accepted contract values and exact validation paths.
6. Validate links, IDs, status consistency, required headings, and stale Batch 04 placeholders.
7. Stop at `REVIEW`; owner acceptance of the outcome contract is required before downstream implementation begins.

## Required validation

```bash
rg -n "StepRunner|LeaseManager|RunnerClient|EvidenceRecorder" apps/desktop/src/main
rg -n "FULL_AUTO|SEMI_AUTO_PAUSE_BEFORE_SUBMIT|release-submit" docs apps
rg -n "T[B]D|TO_BE_BOUN[D]|PENDING_OWNE[R]" docs/v2.1-auto-apply-outcome-contract.md docs/automation/production-wiring-audit.md docs/work-orders/{back/BACK-012-full-auto-authorization.md,cross-repo/CROSS-012-production-runtime-integration.md,front/FRONT-006-visible-automation-control-center.md,cross-repo/CROSS-013-auto-apply-production-acceptance.md}
git diff --check
```

## Acceptance criteria

- The V2.1 contract describes a visible, owner-selected, unattended supported-platform flow with exception-only intervention.
- The before/after table makes the removal of the routine final click explicit.
- The wiring audit distinguishes production reachability from fixture-only execution and names every missing binding.
- Every fixed outcome maps to one implementation owner and one production-path acceptance scenario.
- Downstream Work Orders contain no unresolved behavior, API, mode, route, or acceptance placeholder.
- The owner reviews the rendered contract and explicitly approves or rejects it before any downstream order becomes `READY`.

## Forbidden decisions

- Do not implement product code or treat this documentation order as runtime proof.
- Do not reopen or rewrite the approval state of completed Batch 03 implementation orders.
- Do not preserve a mandatory routine final click in `FULL_AUTO`.
- Do not turn auto apply into autonomous job discovery/selection.
- Do not accept test-only construction as evidence that a module is reachable from the production Electron entrypoint.
- Do not change `docs/work-orders/STATUS.md` approval statuses without an explicit owner instruction.

## Handoff evidence

- V2.1 outcome contract and before/after table
- Production-wiring audit and traceability matrix
- Bound downstream Work Orders with no placeholders
- Link, ID, status-consistency, stale-placeholder, and `git diff --check` output
- Owner acceptance decision recorded against the exact contract revision

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development` (shared working branch)
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending owner outcome review
