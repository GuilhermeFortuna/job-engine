# CROSS-008: Lever Embedded Assisted Apply

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-010

**Unblocks:** CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`

## Objective

Implement an independent Lever adapter for the visible embedded workspace: exact detection, platform-specific observation and filling, resume upload, custom fields, prepared review, owner-released one-time submission, and receipt capture without importing Greenhouse selectors or flow assumptions.

## Owned files

- `/apps/desktop/src/main/adapters/lever.ts` (new)
- `/apps/desktop/src/main/adapters/registry.ts` (Lever registration only)
- `/apps/desktop/tests/adapters/lever.test.ts` (new)
- `/apps/desktop/tests/fixtures/lever/**` (new; sanitized/minimal)
- `/docs/automation/platform-register.md` (Lever evidence/support update only)

## Platform contract

- Bind only adapter ID `lever` and the exact HTTPS host/path families in the platform register.
- Require at least two stable detection signals and prove no collision with Greenhouse or generic fixtures.
- Model Lever's actual page, validation, custom-field, upload, and confirmation behavior; do not force Greenhouse stages into shared code.
- Normalize observations and obtain decisions through CROSS-010/BACK-011. Do not store applicant answers in the adapter.
- Keep the application page visible and publish sanitized field/review progress to the trusted workspace.
- Verify platform-visible values and upload acceptance after mutation.
- Pause on legal/signature questions, missing decisions, unsupported composite controls, challenge/rate-limit state, unexpected origin, or unclear validation.
- Re-observe before `SUBMIT_ARMED`; submit only after trusted owner release and same-run reclaim; activate the site control once.
- Missing or ambiguous confirmation becomes `SUBMISSION_UNKNOWN` without retry.

## Fixture requirements

Use minimal synthetic fixtures covering:

- Approved Lever host/path and lookalike rejection
- Standard, custom, conditional, and voluntary demographic questions
- Lever-specific composite/autocomplete behavior encountered in current evidence
- Resume acceptance and rejection
- Validation/server error and challenge/rate-limit markers
- Prepared review with unresolved and resolved variants
- Owner release, confirmed receipt, and ambiguous response
- Minor DOM drift and explicit unsupported variants
- Detection collisions against Greenhouse and generic fixtures

Do not commit complete copied pages, third-party scripts, employer branding, personal data, production tokens, or real application payloads.

## Procedure

1. Reconfirm current first-party Lever candidate-flow evidence, host patterns, and `LEGAL-GATE-ATS-001` on the implementation date.
2. Implement read-only detection/observation independently from CROSS-007.
3. Implement Lever-specific fill, upload, conditional behavior, validation, and navigation while reusing only CROSS-010 contracts/utilities.
4. Implement visible prepared review, explicit owner release, one-time submit, and receipt reconciliation.
5. Test every fixture outcome plus adapter collision, hostile text, DOM drift, unsupported controls, and ambiguous submit.
6. Perform an owner-authorized live non-submitting inspection in the embedded workspace. Stop before submission unless the owner separately names an exact desired job or authorized test target.
7. Update only Lever support variants, evidence date, known gaps, and maintenance triggers in the platform register.

## Required validation

```bash
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test -- lever
corepack pnpm --filter @job-engine/desktop run test -- adapter-detection-collisions
corepack pnpm --filter @job-engine/desktop run test:fixtures -- lever
corepack pnpm --filter @job-engine/desktop run build
git diff --check
```

## Acceptance criteria

- Detection is host-bounded, collision-free, and rejects unapproved/lookalike flows.
- A complete synthetic Lever application remains visible, fills verified values, handles platform-specific controls/upload/validation, pauses for review, and submits once only after owner release.
- Sensitive, unresolved, challenge, unsupported, and ambiguous cases retain the session and report truthful outcomes.
- No Greenhouse selector or stage assumption contaminates the Lever adapter or shared contract.
- The platform register truthfully distinguishes fixture support, authorized live inspection, and live submission evidence.

## Forbidden decisions

- Do not expose or execute `FULL_AUTO`.
- Do not clone Greenhouse assumptions, broaden hosts, add another platform, or silently fall back after Lever detection.
- Do not hardcode applicant values, credentials, resume paths, or employer-specific data.
- Do not bypass CAPTCHA, auth, validation, rate limits, consent, or disabled controls.
- Do not claim production support from fixtures or inspection alone.
- Do not submit a live application without exact owner authorization.

## Handoff evidence

- Independent detection and flow map
- Sanitized fixture manifest and provenance
- Collision and visible fill/upload/review/release/receipt transcripts
- Challenge, validation, drift, unsupported, and ambiguous-submit evidence
- Authorized live non-submitting inspection notes
- Lever platform-register update

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
