# CROSS-007: First Approved Platform Automation

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-011, CROSS-006

**Unblocks:** CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`, to be created and mechanically bound by CROSS-005 before this order becomes dispatchable.

## Objective

Implement complete automatic application support for `<PRIMARY_ATS_ONE_ID>`, the first platform family selected by CROSS-005: detection, authenticated/multi-step navigation, conditional fields, resume upload, answer resolution, final submission, and receipt capture.

CROSS-005 must replace the placeholder, title, concrete adapter filenames, host allowlist, test commands, and platform-specific acceptance details before this order is handed off.

## Owned files

- `/apps/automation/src/adapters/<PRIMARY_ATS_ONE_ID>.ts` (new; bind filename in CROSS-005)
- `/apps/automation/src/adapters/registry.ts` (registration only)
- `/apps/automation/tests/adapters/<PRIMARY_ATS_ONE_ID>.test.ts` (new; bind filename)
- `/apps/automation/tests/fixtures/<PRIMARY_ATS_ONE_ID>/**` (new; sanitized/minimal)
- `/docs/automation/platform-register.md` (implementation evidence for this platform only)

## Platform contract

- Match only the exact HTTPS hosts/path families approved in the platform register.
- Detect the platform using at least two independent stable signals; hostname alone is insufficient when employers can host unrelated pages on the same domain.
- Support every required application stage documented by CROSS-005, including login/account creation only to the extent explicitly approved there.
- Normalize all observed controls through the CROSS-006 field contract and obtain BACK-011 decisions; do not embed applicant answers in selectors or adapter code.
- Upload only the run-selected PDF and verify the platform displays an accepted filename/status before advancing.
- Immediately before final submit, re-observe required fields, compare them with authorized decisions, checkpoint `SUBMIT_ARMED`, and obtain the backend idempotency permit.
- Capture the platform-bound receipt signals. If confirmation is missing or ambiguous, report `SUBMISSION_UNKNOWN` without clicking again.

## Fixture requirements

Committed fixtures must be minimal, synthetic, and license/terms-compatible. Cover:

- Logged-out and authenticated entry
- Required standard and custom questions
- Conditional question reveal
- Select/radio/checkbox/text/textarea controls
- Resume upload success and rejection
- Client/server validation error
- Multi-page back/forward behavior
- CAPTCHA/challenge detection
- Submit disabled, submit error, confirmation, and ambiguous post-submit response
- Minor non-semantic DOM drift that the adapter should tolerate

Do not commit complete copied pages, third-party scripts, employer branding, personal data, production tokens, or a real application payload.

## Procedure

1. Reconfirm the CROSS-005 platform binding, host patterns, first-party evidence, and permitted test method on the implementation date.
2. Implement stable detection and step observation against sanitized fixtures before mutation behavior.
3. Implement fill/advance/upload with post-action verification and checkpoint events.
4. Implement authenticated continuation, challenge detection, review/submit arming, one-time submit, and receipt capture.
5. Add fixture tests for every bound stage and failure mode, including DOM drift and ambiguous submit.
6. Run a headed dry run against an owner-authorized non-production or non-submitting target. Submission of a genuine owner-selected application or an explicitly authorized test application belongs to CROSS-009 acceptance.
7. Update the platform register with supported flow versions, known unsupported controls, evidence date, and maintenance triggers.

## Required validation

```bash
corepack pnpm --filter @job-engine/automation run check
corepack pnpm --filter @job-engine/automation run test -- <PRIMARY_ATS_ONE_ID>
corepack pnpm --filter @job-engine/automation run build
git diff --check
```

CROSS-005 must replace the placeholder in this validation command with the bound test selector.

## Acceptance criteria

- The adapter detects only the approved platform flow and rejects lookalikes/unapproved origins.
- Synthetic authenticated and multi-step applications complete through confirmed submission with correct checkpoints and field decisions.
- Conditional fields, file rejection, validation errors, challenge pages, and minor DOM drift behave as specified.
- Submit is activated at most once per armed run; ambiguous outcomes never trigger an automatic retry.
- The platform register truthfully lists supported and unsupported variants and current evidence.
- No personal data, real application, broad page capture, or third-party code is committed.

## Forbidden decisions

- Do not broaden the host allowlist or add another platform.
- Do not hardcode applicant answers, credentials, resume paths, or employer-specific personal data.
- Do not bypass CAPTCHA, login, platform validation, or disabled controls.
- Do not silently fall back to the generic adapter after a recognized platform adapter fails mid-run.
- Do not claim production support from fixtures alone.

## Handoff evidence

- Platform detection/flow map
- Sanitized fixture manifest and provenance
- Multi-step/upload/submit/receipt test transcript
- Headed authorized dry-run notes
- Known-variant and maintenance-trigger register update

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
