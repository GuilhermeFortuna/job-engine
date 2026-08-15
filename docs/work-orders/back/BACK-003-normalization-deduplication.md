# BACK-003: Deterministic Normalization and Deduplication

**Status:** `BLOCKED`

**Owner:** Unassigned

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

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
