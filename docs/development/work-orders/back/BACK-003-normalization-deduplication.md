# BACK-003: Deterministic Normalization and Deduplication

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** BACK-002

**Unblocks:** BACK-004, BACK-007

**Product spec:** Sections 7, 9, 10, and 11 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement source-independent, deterministic normalization and high-confidence duplicate grouping over canonical records. Preserve ambiguity and provenance; do not add fuzzy or AI-based matching.

## Owned files

- `/apps/api/src/job_engine/domain/taxonomy.py`
- `/apps/api/src/job_engine/services/__init__.py`
- `/apps/api/src/job_engine/services/normalization.py`
- `/apps/api/src/job_engine/services/deduplication.py`
- `/apps/api/src/job_engine/data/role_families.json`
- `/apps/api/src/job_engine/data/technology_aliases.json`
- `/apps/api/tests/fixtures/normalization_cases.json`
- `/apps/api/tests/fixtures/deduplication_cases.json`
- `/apps/api/tests/services/test_normalization.py`
- `/apps/api/tests/services/test_deduplication.py`
- `/apps/api/tests/services/test_deduplication_persistence.py`

## Fixed rules

- Unicode normalize, trim, collapse whitespace, and case-fold comparison keys without overwriting display text.
- Company/title comparison may remove only an explicit, tested set of punctuation and legal suffixes stored in code.
- Technology aliases come only from `technology_aliases.json`; initial canonical entries must cover the profile technologies named in the V1 spec and retain unmatched terms rather than invent mappings.
- Role-family IDs come only from `role_families.json`: `software_developer`, `full_stack`, `backend`, `python`, `frontend`, `ai_application`, and `applied_ai`. Each mapping must list explicit title terms; a job may belong to multiple families.
- Location-eligibility search categories are `brazil`, `latin_america`, `worldwide`, and `unknown`; only explicit source evidence may assign the first three.
- Remote status, location eligibility, seniority, employment type, and compensation normalize only from explicit structured/source text evidence; ambiguous values become `unknown`.
- USD annualization supports explicit hourly, monthly, and yearly periods using 2,080 hours/year and 12 months/year. Non-USD conversion remains unsupported and preserves original values.
- Exact same-source identity is `(source_id, source_posting_id)`.
- Cross-source grouping requires either the same canonicalized application URL or the exact normalized tuple `(company, title, location)` with compatible employment type. Similarity alone is insufficient.
- Reposts with different source IDs remain separate source postings; they may join an existing group only under the same high-confidence rules.

## Procedure

1. Encode normalization as pure typed functions that return normalized values plus evidence/reason metadata where required by the domain contract.
2. Add the explicit role-family and technology-alias vocabularies and reject duplicate aliases/IDs at load time.
3. Implement canonical URL handling that removes tracking parameters but preserves identity-relevant path/query components; support only HTTP/HTTPS.
4. Implement a deduplication decision value with `same_posting`, `same_job_group`, or `distinct` and a machine-readable reason.
5. Integrate decisions through BACK-002 repositories without deleting postings or reassigning ambiguous records.
6. Add table-driven fixtures for exact duplicates, cross-source URL duplicates, exact tuple duplicates, similar distinct jobs, remote-versus-eligible ambiguity, missing salary, non-USD salary, and reposts.
7. Prove repeated processing produces identical groups and counts.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/services
git diff --check
```

## Acceptance criteria

- Normalization is deterministic, typed, fixture-driven, and preserves original values.
- Remote status never implies Brazil/worldwide eligibility.
- Unknown and non-USD compensation are never coerced to zero or USD.
- High-confidence duplicates group with all source postings retained.
- Similar-but-distinct roles remain separate in required fixtures.
- Reprocessing the same fixture produces stable job-group membership and counts.

## Forbidden decisions

- No fuzzy string threshold, embeddings, vector database, LLM, geocoding service, or exchange-rate API.
- No destructive deletion of duplicate source postings.
- No source-specific conditionals in normalization services; adapters must provide evidence through the canonical input contract.
- No HTTP routes or UI changes.

## Handoff evidence

- Rule table and technology vocabulary summary
- Fixture matrix with expected/actual decisions
- Stable repeated-run group counts
- Required-validation transcript

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `feat/back-003-normalization-deduplication`
- Dispatched at: 2026-08-16T22:17:00-03:00

## Completion record

- Commit: Pending
- Evidence: See below
- Independent reviewer: Pending

### Rule table

| Field | Rule |
| --- | --- |
| Display text | Unicode NFC, trim, collapse whitespace; original casing kept |
| Comparison keys | NFC, trim, collapse, `casefold`, strip tested punctuation; company/title also strip trailing legal suffixes (`inc`, `incorporated`, `llc`, `ltd`, `limited`, `corp`, `corporation`, `plc`, `gmbh`, `ag`, `sa`) |
| Remote | Explicit tokens only (`remote`, `hybrid`, `onsite`/`on-site`/`on site`); otherwise `unknown`. Remote never assigns eligibility |
| Eligibility | `brazil` / `latin_america` / `worldwide` from explicit evidence only; else `location_eligibility_unknown` with zero child rows |
| Location country/region | Left `None` (no geocoding) |
| Seniority / employment | Explicit tokens; otherwise `unknown`; original seniority text retained |
| Compensation | Missing amounts stay `None`, never `0`. USD annualization: hourly × 2080, monthly × 12, yearly as-is. Non-USD preserved with `annual_usd_* = None` |
| URL | Persist original; canonical form lowercases host, drops default port/fragment/trailing slash and tracking query keys, keeps identity query |
| Dedup | `(source_id, source_posting_id)` → `same_posting`; same canonical URL → `same_job_group`; exact `(company, title, location)` keys + compatible employment → `same_job_group`; empty location cannot tuple-merge; similarity is insufficient |

### Technology vocabulary summary

Canonical terms in `technology_aliases.json`: Python, JavaScript, TypeScript, React, Next.js, FastAPI, PostgreSQL, SQL, Docker, Git, GitHub, CI/CD, AWS, GCP, LLM. Aliases include `js`→JavaScript and `postgres`→PostgreSQL. Unmatched tokens are retained. Duplicate aliases/IDs are rejected at load.

Role-family IDs: `software_developer`, `full_stack`, `backend`, `python`, `frontend`, `ai_application`, `applied_ai`. A title may match multiple families.

### Fixture matrix

| Case | Expected | Actual |
| --- | --- | --- |
| `same_source_identity` | `same_posting` / `source_identity` | match |
| `cross_source_canonical_url` | `same_job_group` / `canonical_url` | match |
| `exact_tuple_compatible_employment` | `same_job_group` / `identity_tuple` | match |
| `unknown_employment_is_compatible` | `same_job_group` / `identity_tuple` | match |
| `incompatible_employment_stays_distinct` | `distinct` / `no_high_confidence_match` | match |
| `similar_but_distinct_titles` | `distinct` / `no_high_confidence_match` | match |
| `remote_versus_eligible_ambiguity_distinct` | `distinct` / `no_high_confidence_match` | match |
| `missing_and_non_usd_salary_do_not_affect_grouping` | `same_job_group` / `identity_tuple` | match |
| `repost_different_source_ids_join_by_url` | `same_job_group` / `canonical_url` | match |
| `empty_location_does_not_tuple_merge` | `distinct` / `no_high_confidence_match` | match |

Normalization fixtures also cover display vs comparison keys, remote ≠ Brazil eligibility, missing salary, non-USD preservation, USD hourly/monthly annualization, unknown enums, technology alias + unmatched retain, multi-family titles, and URL tracking strip.

### Stable repeated-run group counts

`test_repeated_corpus_produces_stable_groups_and_counts` applies an 8-posting corpus twice. Both runs persist **6 job groups** and **8 source postings**, with identical group membership sets (`source_id`, `source_posting_id`). No postings are deleted.

### Required-validation transcript

```text
$ docker compose up -d postgres
Container job-engine-postgres-1 Started

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
34 files already formatted

$ cd apps/api && uv run mypy src tests
Success: no issues found in 30 source files

$ cd apps/api && uv run pytest tests/services tests/domain tests/db
collected 58 items
58 passed

$ git diff --check
(no whitespace errors)
```
