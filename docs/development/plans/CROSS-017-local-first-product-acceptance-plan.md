# CROSS-017 implementation plan: Local-first product acceptance

**Status:** Draft  
**Specification:** [`../specs/CROSS-017-local-first-product-acceptance-spec.md`](../specs/CROSS-017-local-first-product-acceptance-spec.md)  
**Depends on:** All preceding local-first alignment pairs

## Entry gate

Before testing, read every approved local-first Spec and Plan, verify their
implementations and reviews are present on `development`, and reconcile contracts
against the repository. A completed legacy Work Order or passing fixture does not
satisfy a new acceptance row by itself.

## Ordered acceptance procedure

1. Create `docs/evidence/local-first-product-acceptance.md` with one row for each
   of the eleven owner outcomes and columns for authoritative requirement,
   implementation, automated proof, production proof, owner-visible proof, and
   result.
2. Start from a clean database and empty managed data root using the documented
   local stack. Complete fresh onboarding with a synthetic non-developer profile,
   avatar, and PDF/DOCX; restart and verify persistence/readiness.
3. Create a second synthetic profile from a different job family. Probe API, UI,
   files, batches, answers, and evidence for cross-profile isolation, including
   delayed-response/profile-switch races.
4. Run live bounded discovery from the owner-approved Greenhouse/Lever register
   plus aggregators. Record direct targets separately from listing-only jobs and
   demonstrate neutral software/non-software search.
5. Authorize an exact synthetic multi-job full-auto batch from direct targets.
   Use safe local provider-form fixtures for submission mechanics unless the
   owner separately authorizes named live applications. Record frozen snapshot
   and queue state.
6. Launch the compiled Electron production entrypoint with the real API/database.
   Demonstrate two concurrent supported runs, one routine submitted receipt, and
   one isolated genuine exception while the other progresses.
7. Exercise local-model structured self-test, resume proposal, deterministic-first
   application answer, grounded generated answer, malformed/timeout response, and
   shared broker under concurrent workers.
8. Restart API and Electron during safe pre-submit states and verify recovery.
   Exercise renderer crash after submit attempt and prove no blind resubmission.
9. Run privacy/redaction scans over UI captures, logs, IPC test payloads, evidence
   metadata, and API errors. Keep synthetic personal values out of the published
   report except explicitly sanitized labels.
10. Run all deterministic validation, capture exact versions/commit/commands, and
    conduct a real browser/Electron accessibility and responsive walkthrough.
11. Record every unmet row as a blocker or bounded condition. Present the evidence
    to the owner, who alone records `GO`, `CONDITIONAL_GO`, or `NO_GO`.

## Deterministic validation

```bash
./ci.sh
corepack pnpm --filter @job-engine/web run test:e2e
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/desktop run test:production
git diff --check
```

Also run migration upgrade from `0006` with representative legacy data and from
an empty database to head. If a command cannot run, the report names it, why, and
the exact behavior left unverified.

## Evidence and safety rules

- No acceptance activity submits a real job application without the owner's
  explicit authorization for that exact profile, resume, and job set.
- Synthetic form success proves runtime behavior; live GET discovery proves
  catalog targets. Keep the evidence classes separate.
- Screenshots/video must show profile, target capability, batch, concurrent
  progress, exception, and receipt while redacting personal values and secrets.
- Any cross-profile leak, unresolved aggregator marked Auto Apply, ungrounded AI
  fact, routine second approval, or second blind submission forces `NO_GO` until
  remediated and re-reviewed.

## Completion evidence

Handoff includes the named commit, environment versions, commands/results,
traceability report, sanitized artifacts, unresolved conditions, and owner
verdict. It must not upgrade Draft/Review state or claim human approval itself.

