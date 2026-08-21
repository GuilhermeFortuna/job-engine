# Application Platform Coverage (CROSS-014)

**Evidence revision:** `cross-014-v5`
**Owner inventory decision:** Option (b) — dual-number reporting with vacuous-slice fallback to (c), confirmed in the CROSS-014 planning session (2026-08-20 AskQuestion)
**Work order:** [CROSS-014](../work-orders/cross-repo/CROSS-014-broad-application-platform-coverage.md)
**Authoritative status:** `READY` in [`docs/work-orders/STATUS.md`](../work-orders/STATUS.md) (Work Order header text that still says `BLOCKED` is stale secondary documentation)

## Measurability verdict: option (c) escalation — not acceptance-complete

The frozen inventory is built from the committed Himalayas, Jobicy, and Remote OK source API fixtures. Every stored `application_url` / `applicationLink` / `url` in those fixtures is a **feed listing host**, not a downstream ATS apply URL.

| Fact | Value |
| --- | --- |
| Distinct sanitized application URLs | **9** |
| Distinct templated path families | **3** |
| Resolvable downstream application URLs | **0** |
| ≥95% eligible-URL result | **unmeasurable** (vacuous denominator) |

Listing pages are bot-gated (403 to metadata fetch). There are no redirects to classify.

Under the owner-approved honesty rule, **do not publish a percentage from a zero denominator**. Source URL resolution / storage of downstream application URLs is a **prerequisite outside CROSS-014 owned files** (do not modify source ingestion in this work). Generic, Greenhouse, and Lever production success evidence is **separate** from this unresolved feed inventory and must not be blended into a fake catalog percentage.

**CROSS-014 is not acceptance-complete** while the measured ≥95% criterion and required provider exception scenarios against a resolvable inventory remain absent.

The option (b) resolvable/unresolvable split remains published separately. For
the Work Order's ≥95% acceptance calculation, the denominator is the eligible
subset of distinct resolvable URLs. Missing adapter evidence is not a permitted
exclusion and therefore lowers measured coverage once such URLs enter the
inventory.

## Dual-number inventory summary

These numbers are **not blended**. Do not read them as “coverage of what the owner would actually apply to.”

| Metric | Value |
| --- | --- |
| Total source URL observations (frozen sample) | 9 |
| Distinct sanitized application URLs | 9 |
| Distinct path families (templated) | 3 |
| Unresolvable feed-listing URLs (`FEED_LISTING_UNRESOLVED`) | 9 |
| Resolvable application URLs | 0 |
| Eligible application URLs | 0 |
| Excluded resolvable application URLs | 0 |
| Auto-supported eligible URLs | 0 |
| **% of eligible application URLs** | **not published** (vacuous slice) |

Frozen data: [`apps/api/tests/fixtures/application_platform_inventory.json`](../../apps/api/tests/fixtures/application_platform_inventory.json)

Per-URL rows classify every distinct sanitized URL exactly once. Path-family aggregation is published separately under `path_families` with derived `count`/`share` (never hardcoded).

## Production family numerator (standard-form corpus)

Separate from the feed-listing inventory: committed standard-form scenarios exercised through the compiled Electron production entrypoint (`dist/main/index.js`) via `corepack pnpm --filter @job-engine/desktop run test:production`.

| Family | Support tier | Production evidence |
| --- | --- | --- |
| `generic_standard_html` | `AUTO_SUPPORTED` | full-auto submitted; semi-auto armed → `release-submit` → submitted |
| `greenhouse` | `AUTO_SUPPORTED` | full-auto submitted (`platform_adapter_id=greenhouse`) |
| `lever` | `AUTO_SUPPORTED` | full-auto submitted (`platform_adapter_id=lever`) |

**Numerator for AUTO_SUPPORTED standard-form families:** 3 / 3 committed synthetic families (generic, Greenhouse, Lever).

**Ashby, SmartRecruiters, and Workday do not count toward auto-supported coverage.**

## Platform family decisions

| Family | Support tier | Reason | Notes |
| --- | --- | --- | --- |
| `generic_standard_html` | `AUTO_SUPPORTED` | — | Production smoke + CROSS-010 fixtures |
| `greenhouse` | `AUTO_SUPPORTED` | — | Production smoke + CROSS-007 fixtures |
| `lever` | `AUTO_SUPPORTED` | — | Production smoke + CROSS-008 fixtures |
| `ashby` | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Matcher unregistered; exact `jobs.ashbyhq.com` hard-vetoed — never generic fallthrough |
| `smartrecruiters` | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Matcher unregistered; exact `jobs.smartrecruiters.com` hard-vetoed |
| `workday` | `UNSUPPORTED` | `LEGAL_GATE` | Detector only; never generic fallback |
| `feed_listing` | `UNSUPPORTED` | `FEED_LISTING_UNRESOLVED` | Catalog stores listing URLs only |
| unbound Lever EU (`jobs.eu.lever.co`) | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | First-party unbound — not labelled lookalike |
| approved Greenhouse/Lever host + unproven path | soft `UNAPPROVED_ATS_PATH` | — | Falls through to generic; not a hard veto |
| unknown / unproven hosts (inventory) | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Inventory never invents `AUTO_SUPPORTED` for arbitrary hosts |

## Registry and selection behavior

- Default registry order: Greenhouse → Lever → generic fallback. Ashby/SmartRecruiters are **not** registered.
- Exact Ashby/SmartRecruiters hosts are classified `UNSUPPORTED` / `MISSING_ADAPTER_EVIDENCE` with **no runnable adapter**.
- `classify()`: feed listings, Workday, unbound first-party ATS, unproven exact ATS hosts, hostile lookalikes (suffix + infix), ambiguous multi-match.
- Soft `UNAPPROVED_ATS_PATH` only for proven Greenhouse/Lever exact hosts whose path misses the adapter matcher.
- `selectAdapter()`: visible-URL hard veto is unconditional; backend adapter IDs and canonical URLs cannot override it. Visible vs canonical platform disagreement → `PLATFORM_DRIFT`.
- Coverage/manual pauses **retain** the embedded `WebContentsView`, stop automation, dispose the isolated-world session, forget the lease, set `busy = false`, publish the exact reason, and do **not** auto-dequeue another run onto the retained page.

## Negative-path evidence matrix

| Scenario | Reason / outcome | Evidence class |
| --- | --- | --- |
| Feed-listing unresolved | `FEED_LISTING_UNRESOLVED` | Unit (`selection`, `adapter`, inventory) + coordinator retain |
| Missing adapter evidence (Ashby/SR/unbound) | `MISSING_ADAPTER_EVIDENCE` | Unit + coordinator retain + production smoke retain |
| Legal gate (Workday) | `LEGAL_GATE` | Unit (`adapter`, `selection`) |
| Lookalike host | `LOOKALIKE_HOST` | Unit (`adapter`, `selection`) |
| Ambiguous detection | `AMBIGUOUS_DETECTION` | Unit (registry multi-match) |
| Platform drift | `PLATFORM_DRIFT` | Unit (`selection`) |
| Authentication pause | `AUTH_REQUIRED` | Fixture runners (generic/GH/Lever) — **unit/fixture**, not production live |
| CAPTCHA pause | `CAPTCHA_REQUIRED` | Fixture runners (generic/GH/Lever) — **unit/fixture** |
| Unsupported control | `UNSUPPORTED_CONTROL` | Fixture runners — **unit/fixture** |
| Validation failure | step validation → pause/terminal | Fixture corpus — **unit/fixture** |
| Ambiguous receipt / submission reconciliation | `SUBMISSION_UNKNOWN` / `submission_unknown` | Coordinator crash-during-submit + fixture submit paths — **unit/fixture** |
| Generic / Greenhouse / Lever happy path | `AUTO_SUPPORTED` submitted | **Production-entrypoint** `test:production` |

Production-entrypoint evidence is required for anything claimed as production-supported. Unit-only and fixture-only rows are labelled as such. No unauthorized live submissions.

## Production-entrypoint evidence

```text
corepack pnpm --filter @job-engine/desktop run test:production
```

Includes full-auto/semi-auto success for generic/Greenhouse/Lever and a coverage-veto retain regression (`MISSING_ADAPTER_EVIDENCE` with embedded view still attached).

## Backend audit note (report-only)

[`applications.py`](../../apps/api/src/job_engine/services/applications.py) `_detect_platform_adapter` uses substring matching when persisting `platform_adapter_id`. Desktop selection ignores backend-named adapters on public non-loopback hosts. Audit rows can misreport the adapter actually used. Out of CROSS-014 owned scope.

## Out-of-scope prerequisite (blocks acceptance)

Downstream application URLs must be **resolved and stored** from approved job sources before measured catalog ≥95% coverage can be accepted. Do not modify source ingestion in this PR.

## CROSS-013 bindings

- Inventory path: `apps/api/tests/fixtures/application_platform_inventory.json` (`cross-014-v5`)
- Recalculate from frozen per-URL rows; do not copy the measurability verdict without re-counting
- Publish resolvable vs unresolvable counts separately; calculate the acceptance percentage over the eligible resolvable subset and publish its numerator, denominator, and exclusions
- Production-entrypoint family traces: generic / Greenhouse / Lever only; Ashby / SmartRecruiters / Workday excluded from the numerator
- Do not invent a feed-listing percentage from production family traces

## Regenerating the inventory

```bash
node apps/desktop/scripts/generate-platform-inventory.mjs
git diff --exit-code -- apps/api/tests/fixtures/application_platform_inventory.json
corepack pnpm --filter @job-engine/desktop run test -- tests/unit/platform-coverage.test.ts
```
