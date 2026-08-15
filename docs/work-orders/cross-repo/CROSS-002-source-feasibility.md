# CROSS-002: V1 Source Feasibility and Selection

**Status:** `READY`

**Owner:** Unassigned

**Depends on:** None

**Unblocks:** BACK-004, BACK-005, BACK-006

**Product spec:** Sections 3, 8, 12, 16, and 18 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Research candidate job sources and approve exactly three primary V1 sources whose documented access methods can support a lawful, maintainable job catalog relevant to an international remote developer living in Brazil.

This is a research and decision order. It must not implement adapters, install dependencies, or ingest production data into Job Engine.

## Owned files

- `/docs/sources/v1-source-register.md` (new)

No application, dependency, environment, or lockfile changes are allowed.

## Required candidate evaluation

Evaluate at least five credible candidates. For every candidate, record:

- Source name, operator, and stable source identifier proposal
- Official product/home page and official API/feed/integration documentation
- Access method: public API, authenticated API, official feed, permitted dataset, or other documented mechanism
- Terms/robots/licensing constraints relevant to collection, storage, display, and application links
- Authentication and credential requirements
- Rate limits, pagination, update/closure signals, and practical refresh cadence
- Available title, company, description, location, remote, salary, date, employment, and stable-ID fields
- Expected coverage of software roles open worldwide, in Latin America, or specifically in Brazil
- Data-quality risks and operational failure modes
- A harmless verification result using public documentation, a sample response, or an authorized test request
- Decision: `APPROVED_PRIMARY`, `APPROVED_BACKUP`, or `REJECTED`, with rationale

## Selection rules

Approve exactly three primary sources and rank at least one backup. A primary source must:

1. Have an official or explicitly permitted machine-access method.
2. Provide a stable posting identity or enough deterministic fields to construct one safely.
3. Preserve a valid original job/application URL.
4. Support bounded pagination or retrieval.
5. Provide terms compatible with the intended V1 storage and display, or identify an explicit owner/legal review gate before credentials are used.
6. Offer material software-development coverage relevant to the V1 user.
7. Not require bypassing authentication, anti-bot controls, CAPTCHAs, or access restrictions.

Prefer sources with complementary coverage rather than three interfaces over substantially identical inventory.

## Procedure

1. Create `docs/sources/` and the source register using the required fields above.
2. Research current first-party documentation and terms. Record retrieval dates because access policies drift.
3. Where permitted without secrets, make one harmless test request or inspect an official example response. Redact tokens and personal identifiers from evidence.
4. Compare candidate schemas against the canonical V1 fields and state which fields will remain unknown for each source.
5. Select exactly three primaries, assign stable lowercase source IDs, and map them in order to `BACK-004`, `BACK-005`, and `BACK-006`.
6. Record source-specific fixture sanitization rules, proposed refresh/staleness policy, and credential names. Do not include credential values.
7. Add a decision summary stating why the selected trio is sufficient for V1 and why each rejected source is not selected now.
8. Run documentation validation and submit the register for owner review.

## Required validation

```bash
test -f docs/sources/v1-source-register.md
rg -n "APPROVED_PRIMARY|APPROVED_BACKUP|REJECTED" docs/sources/v1-source-register.md
rg -n "BACK-004|BACK-005|BACK-006" docs/sources/v1-source-register.md
git diff --check
git status --short
```

The handoff must also include a manual link check for every primary source's official documentation and terms page.

## Acceptance criteria

- At least five candidates have complete, current, source-backed evaluations.
- Exactly three primary sources and at least one backup are named.
- Each primary is explicitly mapped to one adapter Work Order and a stable source ID.
- Terms/access conclusions cite first-party evidence and distinguish confirmed permission from an unresolved review gate.
- Field gaps, closure behavior, refresh constraints, credential names, and fixture policy are explicit.
- No application code, dependencies, secrets, or production ingestion data were added.
- The owner accepts the selected three-source set before this order becomes `DONE`.

## Forbidden decisions

- Do not select a source based only on search-result snippets, third-party tutorials, or assumed API behavior.
- Do not authorize prohibited scraping or evasion of technical controls.
- Do not expose credentials or copy an unnecessarily large corpus into the repository.
- Do not implement a source adapter or shared adapter abstraction.
- Do not promise Brazil eligibility merely because a source labels a role remote.

## Handoff evidence

- Candidate comparison and primary/backup decision
- First-party documentation and terms links with retrieval dates
- Sanitized harmless-access evidence
- Field-coverage matrix
- Owner approval or specific unresolved review gate

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending

