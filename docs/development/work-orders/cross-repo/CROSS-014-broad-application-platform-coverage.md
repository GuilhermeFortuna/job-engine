# CROSS-014: Broad Application-Platform Coverage

**Status:** `READY` (authoritative: [`docs/work-orders/STATUS.md`](../STATUS.md); any prior `BLOCKED` header text was stale)

**Owner:** Unassigned

**Depends on:** CROSS-011, BACK-013, CROSS-012

**Unblocks:** CROSS-013

**Product contract:** [V2.1 Auto-Apply Owner Outcome Contract](../../v2.1-auto-apply-outcome-contract.md), section 7

**CROSS-011 audit:** [Production-Wiring Audit](../../automation/production-wiring-audit.md), outcome 10

## Objective

Extend the production embedded-browser runtime from the initial Greenhouse, Lever, and generic paths to broad, measurable application-platform coverage. Auto Apply must work across all technically automatable standard forms in the accepted corpus and most eligible application URLs observed from the approved job sources. Every remaining provider or page must expose an exact unsupported/pause reason; the product must never imply universal coverage that has not been demonstrated.

## Owned files

- `/docs/automation/platform-register.md` (Batch 04 coverage evidence and bindings only)
- `/docs/automation/application-platform-coverage.md` (new)
- `/apps/desktop/src/main/adapters/contract.ts` (shared platform capability contract only)
- `/apps/desktop/src/main/adapters/generic.ts` (cross-platform compatibility only)
- `/apps/desktop/src/main/adapters/registry.ts` (new)
- `/apps/desktop/src/main/adapters/ashby.ts` (new if bound by the coverage audit)
- `/apps/desktop/src/main/adapters/smartrecruiters.ts` (new if bound by the coverage audit)
- `/apps/desktop/src/main/adapters/workday.ts` (new if bound by the coverage audit)
- `/apps/desktop/src/main/adapters/{greenhouse,lever}.ts` (shared registry/capability integration only)
- `/apps/desktop/src/main/forms/**` (provider-neutral compatibility changes only)
- `/apps/desktop/src/main/runtime/coordinator.ts` (adapter-registry selection and unsupported-state reporting only)
- `/apps/desktop/tests/adapters/**` (new or existing coverage tests)
- `/apps/desktop/tests/fixtures/platforms/**` (new synthetic provider-family fixtures)
- `/apps/desktop/tests/fixtures/platform-coverage.test.ts` (new)
- `/apps/api/tests/fixtures/application_platform_inventory.json` (new; URL/host metadata only, no personal data)

Do not edit job-source ingestion behavior, applicant/answer policy, full-auto authorization, React presentation beyond already bound capability contracts, personal data, or approval statuses.

## Coverage definitions

- **Job source** means Himalayas, Jobicy, or Remote OK. **Application platform** means the downstream form host/family such as Greenhouse, Lever, Ashby, SmartRecruiters, Workday, an employer-hosted standard form, or another discovered ATS. Coverage is measured by application platform, not by feed-source name.
- **AUTO_SUPPORTED** means a production-wired synthetic scenario proves discovery, verified fill, conditional fields, résumé upload, intermediate navigation, final submission, and receipt/uncertainty reconciliation for that platform family.
- **ASSISTED_SUPPORTED** means the embedded page and safe field assistance work, but a documented control or final-step limitation requires owner action.
- **UNSUPPORTED** means the runtime stops before unsafe mutation and reports a stable reason code such as authentication required, CAPTCHA, nonstandard inaccessible control, hostile origin change, missing adapter evidence, legal gate, or platform drift.
- **Standard form** means accessible HTML inputs/selects/textareas/buttons/file controls whose labels, values, required state, validation, and step controls are observable through the existing isolated-world contract.

## Fixed product behavior

- Auto Apply remains an explicit desktop mode for owner-selected jobs. The production code operates the real Chromium `WebContentsView` embedded inside Job Engine; it does not launch a hidden normal-browser profile or require the owner to copy data between windows.
- The deterministic runtime owns navigation, DOM observation, verified field writes, résumé upload, step advancement, and one-shot submit. BACK-013 AI may supply only policy-approved grounded answer decisions; it never directly clicks, navigates, uploads, or submits.
- Build one ordered adapter registry with exact host/path/fingerprint matching, platform capability metadata, and generic fallback. Lookalike hosts and ambiguous detection fail closed.
- Inventory every distinct application host/family from a frozen representative catalog sample across all three approved job sources. Record count, share, platform binding, support tier, evidence, and unsupported reason.
- Improve the generic adapter before adding provider-specific code. Add a dedicated adapter only when the platform materially differs and a separate adapter reduces risk or increases coverage.
- Initial required families are generic standard HTML, Greenhouse, and Lever. The audit must evaluate at least Ashby, SmartRecruiters, and Workday plus every additional family needed to account for the frozen inventory.
- Unsupported pages remain visible in the embedded browser with **Apply with assistance** or **Automation unavailable — reason**; they are never silently dropped or mislabelled Auto Apply.

## Coverage target and completion rule

- Classify 100% of distinct application URLs in the frozen inventory into a platform family and support tier.
- Demonstrate `AUTO_SUPPORTED` for 100% of standard-form scenarios in the committed synthetic corpus.
- Demonstrate `AUTO_SUPPORTED` for application-platform families accounting for at least 95% of eligible URLs in the frozen inventory, with a documented plan for every remaining family. The stretch target is 100%; do not weaken safety rules to reach it.
- A provider counts toward the percentage only after production-entrypoint evidence passes. A unit adapter test or manual page inspection alone does not count.
- Any authentication, CAPTCHA, inaccessible custom control, legal restriction, or unverified live drift is excluded from automatic completion only with a visible, stable reason and retained assisted/manual path.

## CROSS-011 binding

- Freeze a metadata-only inventory containing every distinct application URL in
  the representative Himalayas, Jobicy, and Remote OK catalog sample. Strip
  query/fragment data and record source, normalized host/path family, provider,
  count/share, eligibility, support tier, stable reason, and evidence revision.
- Classify every inventory row as `AUTO_SUPPORTED`, `ASSISTED_SUPPORTED`, or
  `UNSUPPORTED`. Unknown providers are not placeholders: they receive
  `UNSUPPORTED` with a stable missing-evidence reason until proven otherwise.
- Resolve adapters in fixed order: exact proven provider adapter, then proven
  generic standard-form fallback, otherwise no automation. Greenhouse, Lever,
  generic, Ashby, SmartRecruiters, Workday, every additional inventoried family,
  and hostile lookalikes each require a recorded decision.
- The eligible denominator excludes only a documented auth, CAPTCHA,
  inaccessible-control, legal, or verified drift condition with a visible
  assisted/manual reason. The numerator includes only families proven through
  CROSS-012's compiled production entrypoint. Publish both counts, the percentage,
  every exclusion, and the 100% stretch gap.
- Acceptance requires 100% classification, 100% of committed standard-form
  scenarios, and auto-supported families covering at least 95% of eligible
  inventory URLs. Neither fixture-only construction nor an unauthorized live
  submission counts.

## Procedure

1. Re-read CROSS-011, BACK-013, CROSS-012, the current platform register, catalog application URLs, generic form contract, and existing Greenhouse/Lever evidence.
2. Generate and commit a metadata-only frozen application-platform inventory from representative catalog data; strip query secrets and personal data.
3. Define the ordered adapter registry, capability schema, detection evidence, support tiers, and stable unsupported reason codes.
4. Measure generic coverage first and extend provider-neutral form observation/fill/validation only where the behavior is safe across families.
5. Implement and test dedicated adapters in descending inventory coverage/risk order, including at least a recorded decision for Ashby, SmartRecruiters, and Workday.
6. Exercise each family through the production Electron coordinator with local HTTPS multi-step, conditional-field, upload, submit, receipt, ambiguity, auth, CAPTCHA, validation, and drift fixtures.
7. Calculate coverage from evidence, not implementation claims. Record numerator, denominator, exclusions, unsupported reasons, and stretch gaps.
8. Run full desktop and production-path validation and hand the matrix to CROSS-013.

## Required validation

```bash
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/desktop run test:production
corepack pnpm --filter @job-engine/desktop run build
rg -n "AUTO_SUPPORTED|ASSISTED_SUPPORTED|UNSUPPORTED" docs/automation/application-platform-coverage.md apps/desktop/src/main/adapters
rg -n "T[B]D|TO_BE_BOUN[D]|UNKNOWN_PROVIDE[R]" docs/automation/application-platform-coverage.md docs/automation/platform-register.md
git diff --check
```

## Acceptance criteria

- The platform inventory covers all frozen application URLs from Himalayas, Jobicy, and Remote OK and distinguishes feed source from downstream ATS/provider.
- One production adapter registry selects exact trusted families, uses generic fallback where proven, and rejects lookalikes/ambiguity.
- All committed standard-form scenarios are auto-supported through the production Electron entrypoint.
- Auto-supported families represent at least 95% of eligible URLs in the frozen inventory; the report states the measured percentage and 100% stretch gaps without marketing inflation.
- Greenhouse, Lever, generic, and every newly counted family prove full-auto success plus exception, validation, drift, and ambiguous-submit behavior.
- BACK-013 AI assists only with permitted grounded answers; deterministic runtime code exclusively performs browser actions.
- Every non-auto-supported page remains visible with assisted/manual continuation and an exact reason.
- No provider counts as supported from fixture-only construction, unauthorized live submission, or a single happy-path selector test.

## Forbidden decisions

- Do not claim all-provider or universal coverage without the frozen inventory and production evidence.
- Do not weaken CAPTCHA, auth, origin, legal, confidence/evidence, required-field, receipt, or one-shot-submit safeguards to increase the percentage.
- Do not use AI as an unconstrained browser agent or let model output directly choose selectors/clicks/navigation/submission.
- Do not identify a platform from a display name alone, accept arbitrary URLs, or share sessions with the owner's normal browser.
- Do not add provider adapters speculatively when generic behavior already proves the family safely.
- Do not store page credentials, cookies, personal form content, or résumé bytes in the coverage inventory/evidence.
- Do not change source ingestion, scoring, job selection, or unrelated UI styling.

## Handoff evidence

- Frozen metadata-only platform inventory and coverage calculation
- Adapter registry/detection/capability contract
- Generic, Greenhouse, Lever, and newly bound provider production traces
- Standard-form 100% result and overall eligible-URL percentage
- Unsupported/excluded provider matrix with stable reasons and assisted fallback
- Auth, CAPTCHA, validation, drift, lookalike, crash, and ambiguity evidence
- Complete desktop test/fixture/production/build transcripts
- CROSS-013 bindings for every counted platform family

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `cursor/cross-014-platform-coverage-833f`
- Dispatched at: 2026-08-20T08:45:00+00:00

## Completion record

- Commit: Pending owner review (PR remains draft; CROSS-014 is **not** acceptance-complete)
- Evidence: [`docs/automation/application-platform-coverage.md`](../../automation/application-platform-coverage.md) (`cross-014-v5`), [`apps/api/tests/fixtures/application_platform_inventory.json`](../../apps/api/tests/fixtures/application_platform_inventory.json)
- Independent reviewer: Pending platform-coverage review
- Measurability: Owner option (b) → vacuous resolvable slice → option (c); **9 distinct URLs / 3 path families / 0 resolvable**; ≥95% **not published**
- Integration: `RuntimeCoordinator` retains embedded view on coverage/manual pauses; `selectAdapter` hard-vetoes Ashby/SmartRecruiters/Workday/lookalikes/feed listings/platform drift
- Production numerator: 3/3 standard-form families via `test:production`; Ashby/SR/Workday excluded; feed inventory remains option (c)
- Prerequisite blocker: downstream application URLs must be resolved/stored before measured catalog coverage can be accepted (out of CROSS-014 ingestion scope)
