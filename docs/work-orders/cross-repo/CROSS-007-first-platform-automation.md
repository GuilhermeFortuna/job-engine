# CROSS-007: Greenhouse Embedded Assisted Apply

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-010

**Unblocks:** CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`

## Objective

Implement a Greenhouse adapter for the visible embedded workspace: exact platform detection, field observation, authorized filling, resume upload, conditional questions, prepared-review handoff, owner-released one-time submission, and receipt capture. Do not create a background or unattended submission path.

## Owned files

- `/apps/desktop/src/main/adapters/greenhouse.ts` (new)
- `/apps/desktop/src/main/adapters/registry.ts` (Greenhouse registration only)
- `/apps/desktop/tests/adapters/greenhouse.test.ts` (new)
- `/apps/desktop/tests/fixtures/greenhouse/**` (new; sanitized/minimal)
- `/docs/automation/platform-register.md` (Greenhouse evidence/support update only)

## Platform contract

- Bind only adapter ID `greenhouse` and the exact HTTPS host/path families in the platform register.
- Require at least two stable detection signals; hostname alone is insufficient.
- Normalize all controls through CROSS-010. Applicant answers and policies remain backend-owned.
- Support standard contact/link fields, resume upload, labelled custom questions, voluntary demographic groups, conditional reveal, validation, and the platform's actual review/confirmation behavior evidenced during implementation.
- Keep the application page visible while observing/filling and expose sanitized field/review progress to the trusted workspace.
- Pause for any legal attestation, signature, missing decision, unsupported control, CAPTCHA/challenge, unexpected origin, or unclear platform state.
- Checkpoint `SUBMIT_ARMED` only after re-observing the final form and verifying every required value.
- Submit only after the owner activates the trusted workspace action and the same run is released/reclaimed. Activate the Greenhouse submit control once.
- Capture only platform-bound confirmation signals. Missing or ambiguous confirmation becomes `SUBMISSION_UNKNOWN` without another click.

## Fixture requirements

Use minimal, synthetic, license-compatible fixtures covering:

- Approved Greenhouse host/path and lookalike rejection
- Standard, custom, conditional, and voluntary demographic questions
- Text, textarea, select, radio, checkbox, and resume controls
- Resume acceptance and rejection
- Client/server validation errors
- CAPTCHA/challenge marker
- Prepared review with unresolved and fully resolved variants
- Owner release, confirmed receipt, and ambiguous post-submit response
- Minor non-semantic DOM drift

Do not commit complete copied pages, third-party scripts, employer branding, personal data, production tokens, or real application payloads.

## Procedure

1. Reconfirm current first-party Greenhouse candidate-flow evidence, host patterns, and `LEGAL-GATE-ATS-001` on the implementation date.
2. Implement collision-safe detection and read-only observation against fixtures.
3. Implement platform-specific fill, upload, validation, conditional re-observation, and intermediate navigation using CROSS-010 decisions/checkpoints.
4. Implement visible prepared review, explicit owner release, one-time submit, and receipt reconciliation.
5. Test every fixture outcome, including hostile text, DOM drift, unresolved fields, and ambiguous submit.
6. Perform an owner-authorized live non-submitting inspection in the embedded workspace. Stop before submission unless the owner separately names an exact desired job or authorized test target.
7. Update only Greenhouse support variants, evidence date, known gaps, and maintenance triggers in the platform register.

## Required validation

```bash
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test -- greenhouse
corepack pnpm --filter @job-engine/desktop run test:fixtures -- greenhouse
corepack pnpm --filter @job-engine/desktop run build
git diff --check
```

## Acceptance criteria

- Detection accepts only the registered Greenhouse flows and rejects lookalikes and unapproved origins.
- A complete synthetic Greenhouse application remains visible, fills verified values, handles conditional fields/upload/validation, pauses for review, and submits once only after owner release.
- Sensitive, unresolved, challenge, unsupported, and ambiguous cases produce the correct exception/outcome without losing the application session.
- The adapter contains no applicant data and no Lever/generic fallback assumptions.
- The platform register truthfully distinguishes fixture support, authorized live inspection, and live submission evidence.

## Forbidden decisions

- Do not expose or execute `FULL_AUTO`.
- Do not broaden host patterns, add another platform, or silently fall back after a recognized Greenhouse flow fails.
- Do not hardcode applicant answers, credentials, resume paths, or employer-specific data.
- Do not bypass CAPTCHA, validation, consent, authentication, rate limits, or disabled controls.
- Do not claim production support from fixtures or inspection alone.
- Do not submit a live application without exact owner authorization.

## Handoff evidence

- Detection and flow map
- Sanitized fixture manifest and provenance
- Visible fill/upload/conditional/review/release/receipt transcript
- Challenge, validation, drift, and ambiguous-submit evidence
- Authorized live non-submitting inspection notes
- Greenhouse platform-register update

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
