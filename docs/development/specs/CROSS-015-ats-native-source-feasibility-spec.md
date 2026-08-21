# CROSS-015: Greenhouse and Lever source feasibility register

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Implementation plan:** [`../plans/CROSS-015-ats-native-source-feasibility-plan.md`](../plans/CROSS-015-ats-native-source-feasibility-plan.md)

## Purpose

Freeze a truthful, owner-reviewable set of public Greenhouse boards and Lever
sites before implementing ATS-native discovery. These platforms expose jobs per
employer rather than a global cross-company search, so concrete identifiers and
access evidence are a prerequisite, not an executor guess.

## Requirements

- Produce `docs/sources/ats-native-source-register.md` containing the exact
  Greenhouse board tokens and Lever site names/instance regions approved for the
  first implementation.
- Use only public, documented GET access that does not require employer-owned
  credentials. Greenhouse Job Board API and Lever Postings API application POST
  endpoints are not used by Job Engine; hosted forms remain browser targets.
- The approved register contains at least three live employers per provider and
  includes both software and non-software open roles when available. It records
  employer, token/site, API base/region, hosted-board host, sample retrieval
  date, field availability, pagination/rate observations, terms/robots review,
  and stable application URL evidence.
- Representative sampling must establish that each source yields a direct
  Greenhouse or Lever hosted application target, not an aggregator listing or
  employer careers redirect.
- Tokens/sites that are dead, private, credentialed, region-ambiguous, or lack a
  stable hosted application path are rejected with a recorded reason.
- The register is data/configuration authority for BACK-016. Adding employers
  later is a data review, not an adapter redesign.

## External contracts

- Greenhouse discovery uses the public [Job Board API](https://developer.greenhouse.io/job-board.html)
  `GET /v1/boards/{board_token}/jobs?content=true` contract.
- Lever discovery uses the public [Postings API](https://github.com/lever/postings-api)
  JSON `GET /v0/postings/{site}` contract on the documented global or EU base
  and records which instance owns each site.
- Evidence records retrieval metadata and sanitized samples, never applicant
  data and never a live application submission.

## Constraints and non-goals

- No production adapter, database migration, UI, scraping bypass, authenticated
  API, or application submission is implemented in this pair.
- No board/site is accepted merely because its URL shape looks plausible.
- The register does not claim global Greenhouse/Lever coverage and does not set
  a misleading percentage over an unbounded provider population.

## Acceptance criteria

1. At least three retrievable, terms-reviewed employers per provider are either
   approved or the register records a concrete blocker requiring owner action.
2. Approved samples demonstrate stable IDs, job content, location/category data,
   and direct hosted application URLs.
3. The sample includes a meaningful non-software role check and does not assume
   every `Engineer` title is software work.
4. A reviewer can reproduce every approved probe without credentials and can
   distinguish global from EU Lever sites.
5. The owner explicitly approves the register revision before BACK-016 begins.
