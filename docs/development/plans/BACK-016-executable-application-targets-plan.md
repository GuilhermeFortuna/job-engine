# BACK-016 implementation plan: Executable targets and ATS discovery

**Status:** Draft  
**Specification:** [`../specs/BACK-016-executable-application-targets-spec.md`](../specs/BACK-016-executable-application-targets-spec.md)  
**Depends on:** Owner-approved CROSS-015 register revision

## Current-system context

`SourcePosting.application_url` currently conflates discovery and apply URLs;
search serializes `primary_application_url`; run creation accepts a client URL
and derives adapter identity with substring matching. The desktop has audited
Greenhouse/Lever host/path selection, while the three aggregator fixtures contain
only aggregator listing URLs.

## Implementation decisions

- Add migration `0009_executable_application_targets.py`. Rename persisted
  `application_url(_canonical)` to `listing_url(_canonical)` and create
  `application_targets` with UUID, unique `source_posting_id`, target/canonical
  URL, provider, desktop adapter ID, capability status, resolution method,
  evidence JSON, `verified_at`, and timestamps.
- Existing aggregator rows receive no target. Do not copy their listing URL into
  the new table. Existing application runs keep their frozen URLs for history.
- Add `greenhouse` and `lever` source IDs. One adapter per provider iterates the
  approved register entries; board-level failures produce one source
  `PARTIAL_SUCCESS` with sanitized board errors while healthy board postings
  persist.
- Backend capability uses a shared declarative provider host/path contract
  mirrored by a contract fixture consumed in desktop selection tests. It does
  not use substring matching or accept client adapter claims.

## Ordered implementation

1. Freeze the approved CROSS-015 register revision into typed backend data and
   sanitized provider fixtures. Fail startup/config validation for malformed or
   unapproved entries.
2. Implement migration/domain/repository changes for listing URLs and target
   records. Update normalization and deduplication without using target URLs as
   job identity.
3. Implement Greenhouse Job Board and Lever Postings adapters with bounded
   pagination, explicit global/EU bases, stable posting IDs, HTML-to-text
   handling, direct hosted URLs, field-level unknowns, and existing retry/error
   policy.
4. During ingestion, create/update an executable target only when the URL matches
   the frozen provider contract and the production desktop adapter ID is
   supported. Clear/downgrade a target when the source closes or later evidence
   invalidates it; retain audit metadata.
5. Replace API source URL fields and `primary_application_url` with listing and
   preferred-target schemas. Implement deterministic group selection and update
   the web types/components atomically.
6. Change application-run create/preview inputs from arbitrary URL/adapter fields
   to `application_target_id`. Transactionally reload target, source, group,
   status, freshness, and provider contract; persist the server-derived URL and
   adapter into the frozen run.
7. Remove backend substring adapter detection. Update desktop contract tests to
   consume the same provider fixture while retaining visible-URL veto,
   lookalike, drift, and unsupported-provider safeguards.
8. Extend catalog health/filter/source projections and source documentation for
   two ATS sources without weakening partial-failure behavior.

## Validation

- Migration tests prove aggregator URLs become listing-only and existing runs are
  unchanged.
- Adapter tests cover each approved provider/region, duplicate board postings,
  pagination, malformed data, partial board failure, closure, non-software jobs,
  and hosted target construction.
- API/service tests cover deterministic target order and rejection of forged,
  stale, closed, unresolved, lookalike, mismatched, and unsupported targets.
- Run backend/desktop contract fixtures through both sides and retain all current
  navigation/platform-coverage regressions.

```bash
corepack pnpm --filter @job-engine/api run check
corepack pnpm --filter @job-engine/api run test
corepack pnpm --filter @job-engine/api run build
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
```

- Run a bounded live GET smoke against the approved register and show persisted
  Greenhouse/Lever executable targets. Do not submit a live application.

## Completion evidence

Report register revision, source run counts, direct-target rows by provider,
aggregator unresolved counts, public API example, cross-runtime contract result,
and all validation. Explicitly separate fixture support from live target discovery.

