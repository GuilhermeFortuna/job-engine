# CROSS-008: Second Approved Platform Automation

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-011, CROSS-006

**Unblocks:** CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`, to be created and mechanically bound by CROSS-005 before this order becomes dispatchable.

## Objective

Implement complete automatic application support for `<PRIMARY_ATS_TWO_ID>`, the second independent platform family selected by CROSS-005, without coupling its selectors, stages, authentication behavior, or receipt rules to the first adapter.

CROSS-005 must replace the placeholder, title, concrete adapter filenames, host allowlist, test commands, and platform-specific acceptance details before this order is handed off.

## Owned files

- `/apps/automation/src/adapters/<PRIMARY_ATS_TWO_ID>.ts` (new; bind filename in CROSS-005)
- `/apps/automation/src/adapters/registry.ts` (registration only)
- `/apps/automation/tests/adapters/<PRIMARY_ATS_TWO_ID>.test.ts` (new; bind filename)
- `/apps/automation/tests/fixtures/<PRIMARY_ATS_TWO_ID>/**` (new; sanitized/minimal)
- `/docs/automation/platform-register.md` (implementation evidence for this platform only)

## Platform contract

- Match only the exact HTTPS hosts/path families approved in the platform register.
- Detect the platform using at least two stable signals and prove it does not collide with `<PRIMARY_ATS_ONE_ID>` or the generic adapter.
- Model the second platform's actual stages rather than forcing the first adapter's page assumptions into shared code.
- Normalize observed controls through the CROSS-006 contract and obtain BACK-011 decisions; applicant answers never live in adapter code.
- Verify resume-upload acceptance and all required field values after platform-side validation.
- Re-observe the final page, checkpoint `SUBMIT_ARMED`, obtain the backend permit, activate submit once, and capture the bound receipt signals.
- Report missing/ambiguous confirmation as `SUBMISSION_UNKNOWN` without an automatic second click.

## Fixture requirements

Create minimal synthetic fixtures for every platform-specific stage bound by CROSS-005, plus:

- Logged-out/authenticated entry where applicable
- Required standard, custom, and conditional questions
- Platform-specific composite controls or autocomplete widgets
- Resume upload success/rejection
- Navigation validation and server error
- CAPTCHA/challenge or rate-limit detection
- Confirmed and ambiguous submission outcomes
- Minor DOM drift and explicit unsupported variants
- Detection-collision tests against the first and generic adapters

Fixtures must not contain complete copied pages, third-party scripts, employer branding, personal data, production tokens, or real application payloads.

## Procedure

1. Reconfirm the platform binding, permitted method, first-party evidence, and flow variants on the implementation date.
2. Implement platform detection and step observation independently from CROSS-007.
3. Implement platform-specific fill, upload, navigation, validation, and checkpoint behavior while reusing only the shared adapter contract/utilities.
4. Implement authentication/challenge handling, review/submit arming, one-time submission, and receipt capture.
5. Add full fixture coverage, detection-collision coverage, DOM drift, and ambiguous-submit tests.
6. Run a headed owner-authorized dry run without submitting. A genuine owner-selected application or explicitly authorized test submission is executed only by CROSS-009.
7. Update the platform register with supported variants, known gaps, evidence date, and maintenance triggers.

## Required validation

```bash
corepack pnpm --filter @job-engine/automation run check
corepack pnpm --filter @job-engine/automation run test -- <PRIMARY_ATS_TWO_ID>
corepack pnpm --filter @job-engine/automation run test -- adapter-detection-collisions
corepack pnpm --filter @job-engine/automation run build
git diff --check
```

CROSS-005 must replace placeholders with the bound test selectors.

## Acceptance criteria

- The adapter supports the complete approved second-platform flow through confirmed synthetic submission.
- Detection is stable, host-bounded, and collision-free against the first and generic adapters.
- Platform-specific controls, conditional behavior, uploads, authentication, validation, challenges, and receipts behave as bound.
- Submit is activated at most once and ambiguous outcomes never auto-retry.
- The implementation does not contaminate the first adapter with second-platform selectors or stage assumptions.
- The platform register records supported/unsupported variants and current evidence truthfully.

## Forbidden decisions

- Do not clone the first adapter and retain selectors or assumptions that are not evidenced for the second platform.
- Do not broaden platform scope, host allowlists, or add a third adapter.
- Do not hardcode applicant data, credentials, resume paths, or employer-specific values.
- Do not bypass CAPTCHA, authentication, rate limits, validation, or disabled controls.
- Do not claim production support from fixtures alone.

## Handoff evidence

- Independent second-platform flow/detection map
- Sanitized fixture manifest and provenance
- Collision, multi-step, upload, submit, and receipt test transcripts
- Headed authorized dry-run notes
- Platform-register maintenance update

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
