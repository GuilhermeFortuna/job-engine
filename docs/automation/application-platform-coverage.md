# Application Platform Coverage (CROSS-014)

**Evidence revision:** `cross-014-v1`  
**Owner inventory decision:** Option (b) — dual-number reporting with vacuous-slice fallback to (c)  
**Work order:** [CROSS-014](../work-orders/cross-repo/CROSS-014-broad-application-platform-coverage.md)

## Measurability verdict: option (c) escalation

The frozen inventory is built from the committed Himalayas, Jobicy, and Remote OK source API fixtures (representative catalog sample). Every stored `application_url` / `applicationLink` / `url` in those fixtures is a **feed listing host**, not a downstream ATS apply URL:

| Source | Field | Host pattern |
| --- | --- | --- |
| Himalayas | `applicationLink` | `himalayas.app/companies/...` |
| Jobicy | `url` | `jobicy.com/jobs/...` |
| Remote OK | `url` | `remoteok.com/remote-jobs/...` |

Listing pages are bot-gated (403 to metadata fetch). There are no redirects to classify and no HTML to inspect without the embedded browser navigating owner-visible pages — which is out of scope for this inventory freeze.

Under the owner-approved honesty rule, **the ≥95% resolvable-URL criterion is unmeasurable** against the current ingestion contract. Source URL resolution is a prerequisite defect outside CROSS-014 owned files.

## Dual-number inventory summary

These numbers are **not blended**. Do not read them as “coverage of what the owner would apply to.”

| Metric | Value |
| --- | --- |
| Total distinct application URL families (frozen sample) | 9 |
| Unresolvable feed-listing families (`FEED_LISTING_UNRESOLVED`) | 9 |
| Resolvable application URL families | 0 |
| Auto-supported resolvable families | 0 |
| **% of resolvable application URLs** | **not published** (vacuous slice) |

Frozen data: [`apps/api/tests/fixtures/application_platform_inventory.json`](../../apps/api/tests/fixtures/application_platform_inventory.json)

## Platform family decisions

| Family | Support tier | Reason | Evidence |
| --- | --- | --- | --- |
| `generic_standard_html` | `AUTO_SUPPORTED` | — | CROSS-010 fixture corpus; production entrypoint smokes pending CROSS-012 |
| `greenhouse` | `AUTO_SUPPORTED` | — | CROSS-007 unit + fixture corpus; production entrypoint pending CROSS-012 |
| `lever` | `AUTO_SUPPORTED` | — | CROSS-008 unit + fixture corpus; production entrypoint pending CROSS-012 |
| `ashby` | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Exact host matcher registered; no production smoke |
| `smartrecruiters` | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Exact host matcher registered; no production smoke |
| `workday` | `UNSUPPORTED` | `LEGAL_GATE` | Platform register `RESEARCH_ONLY`; mandatory tenant auth |
| `feed_listing` | `UNSUPPORTED` | `FEED_LISTING_UNRESOLVED` | Catalog stores listing URLs only |

## Registry and selection behavior

- Ordered registry: Greenhouse → Lever → Ashby → SmartRecruiters → generic fallback.
- `classify()` strips query/fragment, rejects feed listings, Workday tenants, ATS lookalikes (`hostMatches` apex without exact adapter match), and ambiguous multi-match hosts.
- `selectAdapter()` in [`coordinator.ts`](../../apps/desktop/src/main/runtime/coordinator.ts): a hard veto on the **visible** URL is unconditional and is never overridden by `canonical_application_url` or loopback `platform_adapter_id`.
- Runtime reason codes extend [`RuntimeReasonCode`](../../apps/desktop/src/shared/contracts.ts) with: `LOOKALIKE_HOST`, `AMBIGUOUS_DETECTION`, `MISSING_ADAPTER_EVIDENCE`, `LEGAL_GATE`, `PLATFORM_DRIFT`, `FEED_LISTING_UNRESOLVED`.

## Production-entrypoint evidence

CROSS-014 acceptance requires standard-form scenarios through the compiled Electron production entrypoint (`dist/main/index.js`). On this branch **CROSS-012 is not yet complete**; fixture and unit evidence supports family behavior, but **numerator proof through `test:production` remains blocked on CROSS-012**.

Supporting fixture corpus (not numerator proof): generic/Greenhouse/Lever Electron fixture suites under `apps/desktop/tests/fixtures/`.

## Backend audit note (report-only)

[`applications.py`](../../apps/api/src/job_engine/services/applications.py) `_detect_platform_adapter` uses substring matching (`greenhouse.io`, `lever.co`) when persisting `platform_adapter_id`. The desktop coordinator ignores backend-named adapters on public non-loopback hosts and may drive a different adapter after `classify()` / veto rules. Audit rows can misreport the adapter actually used at runtime. Out of CROSS-014 owned scope.

## CROSS-013 bindings

- Inventory path: `apps/api/tests/fixtures/application_platform_inventory.json`
- Recalculate from frozen rows; do not copy the measurability verdict without re-counting.
- Publish resolvable vs unresolvable counts separately.
- Production-entrypoint family traces: pending CROSS-012 + CROSS-014 production smokes when CROSS-012 lands.

## Regenerating the inventory

```bash
node apps/desktop/scripts/generate-platform-inventory.mjs
```

Unit validation (frozen JSON only, no network):

```bash
corepack pnpm --filter @job-engine/desktop run test -- tests/unit/platform-coverage.test.ts
```
