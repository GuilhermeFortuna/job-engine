# CROSS-017: Integrated local-first product acceptance

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Depends on:** BACK-015, BACK-016, BACK-017, CROSS-016, FRONT-007, FRONT-008  
**Implementation plan:** [`../plans/CROSS-017-local-first-product-acceptance-plan.md`](../plans/CROSS-017-local-first-product-acceptance-plan.md)

## Purpose

Prove that the local-first direction exists as a coherent, production-reachable
product rather than a collection of fixture-only subsystem claims.

## Acceptance matrix

Acceptance requires all eleven outcomes in `local-first-product-direction.md`:

1. fresh-install non-developer onboarding with optional avatar and PDF/DOCX;
2. two profiles with no cross-profile data use or display;
3. software and non-software search behavior;
4. real catalog Greenhouse and Lever executable targets;
5. honest aggregator-only assisted/external behavior;
6. exact multi-job/profile/resume batch authorization;
7. concurrent isolated application progress;
8. unattended routine supported submission with a receipt;
9. per-run actionable exception isolation;
10. structured local-model self-test, extraction, and grounded answering;
11. restart persistence for profiles, batches, queue, exceptions, and outcomes.

## Evidence requirements

- Automated evidence includes backend migration/domain/API tests, frontend unit
  and browser E2E tests, desktop unit/fixture/production-entrypoint tests, and
  repository-wide check/test/build commands.
- Production reachability must start the compiled Electron entrypoint and real
  FastAPI/PostgreSQL stack. Importing a test-only coordinator is not sufficient.
- Real-provider discovery uses approved public GET endpoints and stores direct
  hosted targets. No live application is submitted without the owner's explicit
  selection and authorization.
- Owner-visible evidence records a named commit, exact launch command, sanitized
  scenario data, expected labels, screenshots/video, observed receipts, and an
  explicit owner decision. Synthetic forms may prove submission mechanics but
  cannot substitute for real catalog target discovery.
- Privacy evidence verifies no paths, raw resume text, applicant values, prompts,
  secrets, or raw provider payloads appear in UI errors, logs, IPC, or evidence
  metadata outside their authorized storage boundary.

## Failure and regression requirements

- Acceptance exercises unavailable local AI, unavailable desktop runtime,
  partial source failure, stale target, profile switch, invalid batch item,
  CAPTCHA/authentication pause, unsupported control, renderer crash, API restart,
  desktop restart, and ambiguous submission.
- Existing V1 search, live sync, deterministic normalization/deduplication,
  full-auto authorization, answer grounding, navigation security, and
  Greenhouse/Lever adapter suites must remain green.
- Any failed prerequisite, unverified real-provider behavior, cross-profile leak,
  second blind submit, or fixture-only production claim blocks acceptance.

## Deliverable and decision

- Publish `docs/evidence/local-first-product-acceptance.md` with a traceability
  matrix from each outcome to code, automated proof, production proof, and
  owner-visible proof.
- The verdict is `GO`, `CONDITIONAL_GO`, or `NO_GO`. Only the owner may record the
  final acceptance decision; agents record evidence and blockers.
