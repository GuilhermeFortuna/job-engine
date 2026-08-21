# Application Platform Coverage (CROSS-014)

**Evidence revision:** `cross-014-v3`
**Owner inventory decision:** Option (b) — dual-number reporting with vacuous-slice fallback to (c), confirmed in the CROSS-014 planning session (2026-08-20 AskQuestion)
**Work order:** [CROSS-014](../work-orders/cross-repo/CROSS-014-broad-application-platform-coverage.md)
**Base:** `development` at `c3ebbb8` (CROSS-012 production runtime `DONE`)

## Measurability verdict: option (c) escalation

The frozen inventory is built from the committed Himalayas, Jobicy, and Remote OK source API fixtures. Every stored `application_url` / `applicationLink` / `url` in those fixtures is a **feed listing host**, not a downstream ATS apply URL.

Listing pages are bot-gated (403 to metadata fetch). There are no redirects to classify.

Under the owner-approved honesty rule, **the ≥95% resolvable-URL criterion is unmeasurable** against the current ingestion contract. Source URL resolution is a prerequisite defect outside CROSS-014 owned files. Do **not** blend production family traces into that vacuous percentage.

## Dual-number inventory summary

These numbers are **not blended**. Do not read them as “coverage of what the owner would actually apply to.”

| Metric | Value |
| --- | --- |
| Total source URL count (frozen sample) | 9 |
| Distinct path families | 3 (after templating) |
| Unresolvable feed-listing URLs (`FEED_LISTING_UNRESOLVED`) | 9 |
| Resolvable application URLs | 0 |
| Auto-supported resolvable URLs | 0 |
| **% of resolvable application URLs** | **not published** (vacuous slice) |

Frozen data: [`apps/api/tests/fixtures/application_platform_inventory.json`](../../apps/api/tests/fixtures/application_platform_inventory.json)

## Production family numerator (standard-form corpus)

Separate from the feed-listing inventory: committed standard-form scenarios exercised through the compiled Electron production entrypoint (`dist/main/index.js`) via `corepack pnpm --filter @job-engine/desktop run test:production`.

| Family | Support tier | Production evidence (2026-08-21) |
| --- | --- | --- |
| `generic_standard_html` | `AUTO_SUPPORTED` | full-auto submitted; semi-auto armed → `release-submit` → submitted |
| `greenhouse` | `AUTO_SUPPORTED` | full-auto submitted (`platform_adapter_id=greenhouse`) |
| `lever` | `AUTO_SUPPORTED` | full-auto submitted (`platform_adapter_id=lever`) |

**Numerator for AUTO_SUPPORTED standard-form families:** 3 / 3 committed synthetic families (generic, Greenhouse, Lever).
**Transcript:** 4 passed production Electron smoke tests (generic full-auto, Greenhouse full-auto, Lever full-auto, generic semi-auto).
**Harness:** CROSS-012 `apps/desktop/scripts/run-production-smoke.mjs` + `tests/production/production-smoke.test.ts`.
**Selection path:** `RuntimeCoordinator` private `selectAdapter` delegates to [`selection.ts`](../../apps/desktop/src/main/adapters/selection.ts).

## Platform family decisions

| Family | Support tier | Reason | Notes |
| --- | --- | --- | --- |
| `generic_standard_html` | `AUTO_SUPPORTED` | — | Production smoke + CROSS-010 fixtures |
| `greenhouse` | `AUTO_SUPPORTED` | — | Production smoke + CROSS-007 fixtures |
| `lever` | `AUTO_SUPPORTED` | — | Production smoke + CROSS-008 fixtures |
| `ashby` | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Matcher module exists but **unregistered** so generic keeps handling hosts |
| `smartrecruiters` | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | Same — unregistered until production evidence |
| `workday` | `UNSUPPORTED` | `LEGAL_GATE` | Detector only; never generic fallback |
| `feed_listing` | `UNSUPPORTED` | `FEED_LISTING_UNRESOLVED` | Catalog stores listing URLs only |
| unbound Lever EU (`jobs.eu.lever.co`) | `UNSUPPORTED` | `MISSING_ADAPTER_EVIDENCE` | First-party unbound — not labelled lookalike |
| approved ATS host + unproven path | soft `UNAPPROVED_ATS_PATH` | — | Falls through to generic; not a hard veto |

## Registry and selection behavior

- Default registry order: Greenhouse → Lever → generic fallback. Ashby/SmartRecruiters are **not** registered (avoids speculative hard-veto coverage loss).
- `classify()` in [`registry.ts`](../../apps/desktop/src/main/adapters/registry.ts): feed listings, Workday, unbound first-party ATS, hostile lookalikes (suffix + infix), ambiguous multi-match.
- Soft `UNAPPROVED_ATS_PATH` for exact approved ATS hosts whose path misses the adapter matcher — falls through to generic.
- Hostile lookalikes: `evil.boards.greenhouse.io` (suffix) and `boards.greenhouse.io.evil.test` (infix). Genuine unbound first-party (`jobs.eu.lever.co`) is `MISSING_ADAPTER_EVIDENCE`, not `LOOKALIKE_HOST`.
- `selectAdapter()` in [`selection.ts`](../../apps/desktop/src/main/adapters/selection.ts): visible-URL hard veto is unconditional. Loopback `platform_adapter_id` still respects capability hard vetoes.
- **Integration:** `RuntimeCoordinator.selectAdapter` (CROSS-012) calls the adapters-package `selectAdapter` and surfaces `vetoReason` on pause.

## Production-entrypoint evidence

CROSS-014 acceptance requires standard-form scenarios through the compiled Electron production entrypoint. CROSS-012 owns the harness; this branch consumes it after rebase onto `c3ebbb8`.

```text
corepack pnpm --filter @job-engine/desktop run test:production
# Test Files  1 passed (1)
# Tests  4 passed (4)
```

Supporting fixture corpus: generic/Greenhouse/Lever under `apps/desktop/tests/fixtures/`.

## Backend audit note (report-only)

[`applications.py`](../../apps/api/src/job_engine/services/applications.py) `_detect_platform_adapter` uses substring matching when persisting `platform_adapter_id`. Desktop selection ignores backend-named adapters on public non-loopback hosts. Audit rows can misreport the adapter actually used. Out of CROSS-014 owned scope.

## CROSS-013 bindings

- Inventory path: `apps/api/tests/fixtures/application_platform_inventory.json`
- Recalculate from frozen rows; do not copy the measurability verdict without re-counting
- Publish resolvable vs unresolvable counts separately; label any percentage **"% of resolvable application URLs"** only
- Production-entrypoint family traces: generic / Greenhouse / Lever proven via `test:production` (see numerator table above); do not invent a feed-listing percentage from those traces

## Regenerating the inventory

```bash
node apps/desktop/scripts/generate-platform-inventory.mjs
corepack pnpm --filter @job-engine/desktop run test -- tests/unit/platform-coverage.test.ts
```
