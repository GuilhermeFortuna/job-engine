# CROSS-015 implementation plan: ATS-native source feasibility

**Status:** Draft  
**Specification:** [`../specs/CROSS-015-ats-native-source-feasibility-spec.md`](../specs/CROSS-015-ats-native-source-feasibility-spec.md)

## Research boundary

This is a read-only external feasibility task plus repository documentation. It
does not add adapters or submit applications. Use the official Greenhouse
[Job Board API](https://developer.greenhouse.io/job-board.html) and Lever
[Postings API](https://github.com/lever/postings-api) documentation as primary
contract sources.

## Ordered implementation

1. Create a candidate table with at least six Greenhouse and six Lever employers
   across more than one job family. Record how each board token/site was obtained
   from its public hosted careers URL; do not guess tokens from company names.
2. Review provider documentation, access requirements, terms/robots posture,
   region/base URL, pagination, stable IDs, content/location/category fields, and
   hosted application URL fields. Record retrieval date and direct citations.
3. Probe candidates with bounded public GET requests, a descriptive user agent,
   low concurrency, no retries beyond one transient retry, and no application
   POST. Sanitize stored samples to job metadata only.
4. For each candidate, verify at least one current posting end to end from API
   record to hosted form URL. Classify direct target, redirect-only, dead/private,
   region mismatch, or other concrete rejection.
5. Sample titles/descriptions rather than provider categories alone and record
   whether the approved set includes credible non-software roles.
6. Publish `docs/sources/ats-native-source-register.md` with exact approved and
   rejected rows, provider contract summary, refresh policy, fixture provenance,
   and BACK-016 configuration payload. Freeze a revision ID and checksum for any
   committed sanitized fixtures.
7. Ask the owner to approve that exact register revision. Do not mark this pair
   complete and do not dispatch BACK-016 without the recorded approval.

## Validation

- Re-run every approved public GET and verify 2xx JSON plus at least one open job.
- Resolve every sample's hosted URL with GET/HEAD only as provider behavior
  permits; never interact with the form.
- Validate unique provider/token-or-site pairs, explicit Lever region, direct
  host allowlists, sample timestamps, source links, and rejection reasons.
- Run local Markdown-link resolution and:

```bash
git diff --check -- docs/sources/ats-native-source-register.md docs/development
```

## Completion evidence

The handoff provides the register revision, approved/rejected counts, provider
and job-family distribution, reproducible commands with no credentials, any
legal/access caveats, and the owner's decision. No source is described as
globally comprehensive.
