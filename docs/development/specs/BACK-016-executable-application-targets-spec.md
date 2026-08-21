# BACK-016: Executable application targets and ATS-native discovery

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Depends on:** CROSS-015  
**Implementation plan:** [`../plans/BACK-016-executable-application-targets-plan.md`](../plans/BACK-016-executable-application-targets-plan.md)

## Purpose

Separate discovery provenance from executable application targets and add
approved Greenhouse and Lever sources. Job Engine must never label an
aggregator listing as Auto Apply merely because it is the catalog's only URL.

## Requirements

### Catalog contract

- Every source posting preserves a `listing_url` identifying where it was
  discovered. A separate optional application target stores the canonical
  direct URL, provider (`greenhouse`, `lever`, or another reviewed adapter),
  resolution method, confidence/evidence, verification time, and status.
- Target status is one of `executable`, `assisted`, `external`, or
  `unresolved`. `executable` requires a direct HTTP(S) URL and a
  production-supported desktop adapter ID; URL shape alone is insufficient.
- Grouped jobs expose all listing sources and a deterministic preferred target.
  Preference order is executable, assisted, external, then unresolved; ties use
  earliest source link time and stable posting ID.
- Aggregator adapters migrate their current `application_url` to `listing_url`.
  Their target remains null unless a bounded resolver produces verified direct
  evidence. No run can be created from a null/unresolved target.

### ATS-native discovery

- Add independently configurable Greenhouse and Lever source adapters driven
  only by the owner-approved CROSS-015 register.
- ATS adapters preserve the provider-hosted listing/application URL as both
  discovery provenance and a verified direct target when the desktop registry
  confirms that exact provider/host/path family is production-supported.
- Normalization, deduplication, freshness, partial-source failures, provenance,
  and restart-safe ingestion retain existing catalog behavior. New sources must
  support roles outside software engineering without forcing technology tags.

### Public API and run guard

- Job list/detail responses replace ambiguous `primary_application_url` with
  `preferred_application_target` and add `listing_url` plus target metadata to
  each source posting. During one repository-wide migration, all consumers and
  tests move to the new shape.
- The application-run create service accepts a target ID, reloads it, and
  verifies `executable` status plus adapter compatibility transactionally. It
  never trusts a client-supplied arbitrary URL or adapter ID.
- Assisted/external actions link to the best known safe URL and give a specific
  reason; unresolved jobs remain searchable and useful.

## Constraints and non-goals

- No authenticated employer application API is assumed. Submission continues
  through hosted forms in the audited Electron runtime.
- No generic web crawler, search-engine scraping, URL guessing, CAPTCHA bypass,
  or arbitrary redirect chasing is introduced.
- Ashby, SmartRecruiters, Workday, and broad provider expansion remain outside
  this first pair unless separately specified.

## Acceptance criteria

1. Catalog results contain real approved Greenhouse and Lever postings with
   direct executable targets, including non-software roles from the register.
2. All legacy aggregator postings retain listing provenance and are never
   reported executable without separately verified targets.
3. Run creation rejects unresolved, stale/closed, mismatched, forged, and
   unsupported targets with stable reason codes.
4. API ordering and target selection are deterministic, and partial failure of
   one ATS source leaves persisted results from healthy sources searchable.
5. Existing Greenhouse/Lever desktop selection tests and a backend-to-desktop
   contract test agree on provider ID, URL, and capability state.
