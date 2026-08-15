# Job Engine V1 Product Specification

**Status:** Approved baseline for V1 planning

**Purpose:** Product and scope authority for the first batch of Work Orders

**Background:** [Job Engine project context](job-engine-context.md)

## 1. Product definition

Job Engine V1 is a personal job-search engine that collects software-development job offers from multiple sources and presents matching opportunities in one consistent interface.

V1 is an aggregator and search tool. It is not yet an AI career adviser, an application tracker, or an autonomous recommendation system.

The core V1 flow is:

```text
Job sources
    -> source adapters
    -> normalized job records
    -> duplicate detection
    -> persisted searchable catalog
    -> parameter-based search
    -> unified results UI
```

## 2. Target user and search objective

V1 has one user: the project owner, a software developer living in Brazil who is primarily looking for fully remote international roles with US or European companies.

Relevant role families include:

- Software Developer
- Full-Stack Developer
- Backend Developer
- Python Developer
- TypeScript / React Developer
- AI Application Developer
- Applied AI roles that do not require deep machine-learning research experience

The search should make it practical to find roles related to the user's strengths in Python, TypeScript/JavaScript, React/Next.js, backend APIs, PostgreSQL/SQL, Docker, Git/GitHub/CI/CD, AWS/GCP, AI/LLM integrations, data processing, automation, and analytics.

The target compensation is at least USD 4,000 per month or USD 48,000 per year. Missing or ambiguous compensation must remain visible as unknown rather than being treated as below target.

## 3. V1 goals

V1 must:

1. Ingest currently open job postings from at least three independently configured sources.
2. Convert source-specific postings into one validated canonical job model.
3. Detect likely duplicate postings without discarding source provenance.
4. Store the normalized catalog so users do not depend on live upstream responses while searching.
5. Allow the user to search and filter jobs using explicit parameters.
6. Present results from every enabled source in one coherent UI.
7. Preserve the original posting URL and enough source metadata to verify and apply externally.
8. Show when data is missing, stale, ambiguous, or source-derived instead of inventing certainty.
9. Isolate source-specific behavior so another source can be added without changing core search or UI contracts.

## 4. V1 non-goals

The following are outside V1 unless this specification is explicitly revised:

- AI/LLM extraction, summarization, or scoring
- Personalized fit scores or application-priority rankings
- Automated legal or work-authorization determinations
- Automatic applications, outreach, or form completion
- Resume or cover-letter generation
- Application pipeline/CRM features
- Accounts, teams, or multi-user authorization
- Notifications, saved searches, or scheduled digests
- Market analytics, salary trends, or skill-gap analytics
- Scraping sources whose terms or technical controls do not permit the chosen access method
- A general-purpose workflow/orchestration platform

V1 may preserve fields and boundaries that make later features possible, but it must not implement those features speculatively.

## 5. Definitions

- **Source:** An external API, feed, dataset, or permitted integration that provides job postings.
- **Source adapter:** Source-owned code that fetches and translates one source's data into the ingestion contract.
- **Canonical job:** The normalized representation used by persistence, search, and presentation.
- **Posting:** One source's representation of a job opportunity.
- **Job group:** One canonical opportunity with one or more source postings judged to refer to the same role.
- **Unknown:** A first-class state used when a source does not provide enough evidence for a value.
- **Active job:** A job that has not been marked closed and has not exceeded the configured staleness policy.

## 6. Required user experience

### 6.1 Search controls

The results UI must support these V1 parameters:

| Parameter | Required behavior |
| --- | --- |
| Keywords | Free-text search across title, company, description, and normalized technology terms. |
| Role family | Multi-select filter using a small controlled list of role families. |
| Technologies | Multi-select filter; selected technologies use match-any behavior in V1. |
| Remote status | Filter for remote, hybrid, on-site, or unknown. |
| Location eligibility | Filter for jobs explicitly open to Brazil, Latin America, worldwide/anywhere, or unknown. |
| Seniority | Multi-select filter for internship, junior, mid-level, senior, lead/staff, or unknown. |
| Compensation | Minimum annual USD compensation filter with an explicit option to include jobs whose compensation is unknown. |
| Source | Multi-select filter by enabled source. |
| Posted date | Filter by a bounded recent period, including 24 hours, 7 days, 30 days, or any available date. |

The initial query may be empty. An empty query returns active jobs subject to the selected filters.

### 6.2 Results

Each result must show, when available:

- Job title
- Company name
- Location text
- Remote status
- Location-eligibility evidence or an `Unknown` label
- Seniority
- Compensation as published, plus normalized annual USD values only when normalization is supported by explicit source data
- Relevant technology terms
- Posted date
- Source or sources
- Short description excerpt
- Link to the original posting
- Last-seen or freshness information

Results must default to newest first. The user must also be able to sort by compensation where normalized compensation exists. Jobs without normalized compensation must not be silently assigned a zero value.

The UI must distinguish loading, no-results, partial-source-failure, and total-error states. A failure in one source's latest ingestion must not prevent already persisted results from other sources from being searched.

### 6.3 Job details

V1 must provide either a dedicated details view or an accessible details panel. It must show the normalized record, the available source description, source provenance, freshness, and an external application link.

Applications happen on the original source or employer site. Job Engine does not submit applications in V1.

### 6.4 URL state

Search text, filters, sorting, and pagination must be represented in the page URL. Refreshing or sharing that URL must reproduce the same search state, subject to changes in the underlying catalog.

## 7. Canonical job contract

The backend must own a strongly validated canonical job model. Exact implementation names may be established by a Work Order, but the V1 contract must represent:

| Field | Requirement |
| --- | --- |
| Internal job-group ID | Stable identifier used by the application. |
| Title | Required normalized display value plus original value when different. |
| Company | Required normalized display value plus source-provided value. |
| Description | Source-provided plain text or safely rendered supported markup. |
| Source postings | One or more source names, source posting IDs, original URLs, and source timestamps. |
| Location | Original location text and any normalized country/region values supported by evidence. |
| Remote status | `remote`, `hybrid`, `onsite`, or `unknown`. |
| Location eligibility | Explicit eligible regions/countries plus evidence text and `unknown` support. |
| Employment type | Full-time, part-time, contract, temporary, internship, or unknown. |
| Seniority | Controlled V1 value plus original text and unknown support. |
| Technologies | Normalized terms and, where practical, the text that produced them. |
| Compensation | Original text, currency, period, minimum, maximum, and normalized annual USD bounds when supported. |
| Dates | Published date when provided, first-seen time, last-seen time, and closed/expired time when known. |
| Status | Active, stale, closed, or unknown according to explicit catalog rules. |
| Ingestion metadata | Adapter version or run identity sufficient to diagnose provenance and freshness. |

Normalization must preserve the original source values needed to audit a transformed value. An absent value must not be inferred merely to satisfy a required UI field.

## 8. Source adapter contract

Each V1 source adapter must:

1. Have an explicit source identifier and configuration boundary.
2. Fetch jobs through a permitted, documented access method.
3. Map source records into the canonical ingestion contract.
4. Preserve the source posting ID and canonical application URL.
5. Support deterministic pagination or bounded retrieval where the source provides it.
6. Record fetch time and report structured errors.
7. Be independently testable with committed fixtures that contain no secrets or personal data.
8. Tolerate one malformed posting without discarding an otherwise valid ingestion batch.
9. Define how a posting is recognized as updated, closed, expired, or no longer observed.

Source credentials and rate limits must remain source-specific. Secrets must not be committed or exposed to the frontend.

The specific first three sources are an implementation-planning decision and must be chosen through a feasibility Work Order that evaluates access terms, API/feed stability, required credentials, rate limits, available fields, and Brazil/international-remote coverage.

## 9. Normalization rules

V1 normalization must be deterministic and testable.

- Preserve raw/source values alongside normalized values where transformation affects meaning.
- Normalize controlled enums without forcing ambiguous text into a confident category.
- Normalize technology aliases only through an explicit mapping, such as `JS` to `JavaScript`.
- Treat remote work arrangement and location eligibility as separate concepts. A job marked remote is not automatically eligible for a worker living in Brazil.
- Treat missing salary as unknown.
- Normalize compensation to annual USD only when currency, amount, and pay period are explicit. Any exchange-rate strategy must be separately specified before non-USD conversion is enabled.
- Store all timestamps in UTC and retain source-provided timezone/precision when relevant.
- Sanitize source content before rendering it in the frontend.

V1 may use deterministic keyword and pattern rules. It must not require an LLM to ingest or search jobs.

## 10. Duplicate detection

Duplicate detection must prevent repeated opportunities from dominating search results while preserving every known source link.

V1 must:

- Treat an identical source identifier plus source posting ID as the same posting.
- Group exact high-confidence cross-source matches using deterministic evidence such as normalized company, normalized title, and canonicalized application URL.
- Keep ambiguous possible matches separate rather than merging them destructively.
- Retain all source postings and provenance in a grouped result.
- Make deduplication repeatable and covered by fixtures for exact duplicates, cross-source duplicates, similar-but-distinct roles, and reposted roles.

Fuzzy or AI-assisted deduplication is not required for V1.

## 11. Search semantics

Search and filter behavior must be implemented by the backend over persisted normalized records. The frontend owns search interaction and URL state, not business-rule interpretation.

V1 search must:

- Combine different active filter categories with AND semantics.
- Use OR semantics among multiple selected values within the same category.
- Return one result per job group.
- Return total result count and deterministic pagination metadata.
- Apply a stable secondary ordering so pagination does not shuffle equal-ranked results.
- Exclude closed jobs by default.
- Allow unknown values to be intentionally included where ambiguity materially affects the search, especially compensation and location eligibility.

Free-text relevance may use PostgreSQL-native capabilities. A separate search service or vector database is outside V1 unless measured requirements prove it necessary.

## 12. Persistence and ingestion behavior

PostgreSQL is the V1 system of record for normalized jobs, source postings, ingestion runs, and freshness state.

Ingestion must be executable independently from interactive search requests. V1 must provide a documented manual or scheduled invocation path, but it does not require a general workflow engine or ingestion-management UI.

Each ingestion run must record:

- Source
- Start and completion times
- Success, partial success, or failure
- Counts fetched, accepted, rejected, inserted, updated, and marked stale/closed where supported
- Structured error summaries without secrets

Repeated ingestion of unchanged source data must be idempotent: it must not create duplicate source postings or job groups.

The freshness/staleness policy must be configurable and source-aware because not all sources expose closure events. The UI must not label a job active solely because it exists in the database.

## 13. Technical boundaries

The V1 monorepo follows the direction in the project context:

- **Python/FastAPI** owns source ingestion, validation, normalization, duplicate detection, persistence, and search semantics.
- **PostgreSQL** owns durable catalog and ingestion state.
- **TypeScript/React/Next.js** owns presentation, search controls, URL state, and result/detail interactions.
- **Source adapters** depend on a canonical ingestion boundary; domain/search code must not depend directly on a source's payload shape.
- **Frontend code** consumes backend API contracts and must not contain source-specific normalization or eligibility logic.

V1 should begin as a modular monorepo application. Microservices, message brokers, vector databases, Kubernetes, and plugin frameworks are not justified by this specification.

## 14. API capability requirements

The exact route names and schemas belong in an implementation Work Order, but the V1 backend must expose capabilities to:

- Search active job groups with all V1 parameters, sorting, and pagination
- Retrieve one job group's normalized details and source postings
- List filter vocabulary needed by the UI, including enabled sources and controlled values
- Report catalog freshness and partial ingestion/source health without exposing secrets

Ingestion-control endpoints are not required for the public frontend.

## 15. Quality requirements

### 15.1 Correctness and observability

- Canonical models and API payloads must be runtime validated.
- Source adapter, normalization, deduplication, persistence, and search behavior must have automated tests.
- Logs must identify the source and ingestion run while excluding credentials and unnecessarily copied job descriptions.
- A malformed or unavailable source must produce diagnosable partial failure, not silent data loss.

### 15.2 Security and source compliance

- Source credentials are backend-only secrets.
- Source descriptions must be sanitized before browser rendering.
- Redirect/application links must use validated HTTP or HTTPS URLs.
- Each enabled source must have its access method and relevant usage constraints documented before production ingestion is accepted.

### 15.3 Accessibility and responsiveness

- Search, filters, results, pagination, and details must be keyboard accessible.
- Controls must have programmatic labels and visible focus states.
- Status and error messages must not rely on color alone.
- The primary flow must remain usable on mobile and desktop widths.

### 15.4 Performance

V1 does not set a speculative scale target. The first Work Orders must define a representative local dataset and record measured search/API performance. Search pagination must occur in the backend; the frontend must not download the entire catalog to filter it locally.

## 16. V1 acceptance criteria

V1 is product-complete only when all of the following are demonstrated:

1. At least three approved sources can be ingested through independent adapters.
2. Re-running ingestion is idempotent for unchanged fixtures and live source records.
3. Source failures and malformed records are recorded without corrupting a successful batch.
4. Normalized jobs from all enabled sources appear in one results interface.
5. The complete V1 filter set, sorting, URL state, and deterministic pagination work against persisted backend data.
6. Remote status and Brazil/international location eligibility remain separate, evidence-based values with explicit unknown states.
7. Compensation filtering does not misclassify missing or unsupported compensation as zero or below target.
8. Duplicate source postings are grouped without losing their original URLs or provenance, while similar distinct roles remain separate.
9. A user can inspect job details and continue to the original application page.
10. Stale or closed jobs do not appear as current results by default under the documented freshness policy.
11. Automated tests cover adapter contracts, normalization, deduplication, persistence, API search semantics, and critical frontend interactions.
12. A human acceptance pass confirms the end-to-end search flow, partial-error communication, keyboard use, responsive layout, and source-link behavior.

Passing unit tests alone does not establish V1 product acceptance; the integrated flow must be demonstrated with representative records from every approved source.

## 17. First-batch Work Order boundaries

The first batch should establish the smallest vertical foundation for this specification. Work Orders should be independently reviewable and should not combine unrelated risks. The expected responsibility areas are:

1. **Repository and local development foundation:** monorepo layout, supported runtimes, dependency management, environment conventions, and minimal backend/frontend/database startup.
2. **Canonical domain and persistence contract:** validated job/source/ingestion models, migrations, and fixtures.
3. **Source feasibility and selection:** evaluate candidates and approve the initial three sources before production adapters are assigned.
4. **Adapter contract and first source:** implement the shared boundary and prove it with one approved source.
5. **Additional source adapters:** assign each independently where credentials, access constraints, or payload behavior differ.
6. **Normalization and deterministic deduplication:** implement and test the rules in Sections 9 and 10.
7. **Search API:** persisted filtering, sorting, pagination, details, vocabularies, and catalog health.
8. **Unified search UI:** URL-backed controls, results, details, and all required states.
9. **Integrated V1 verification:** representative multi-source fixture/live evidence, accessibility, responsiveness, and acceptance review.

Each Work Order derived from this document must state exact scope, owned files, dependencies, exclusions, ordered implementation steps, acceptance checks, validation commands, and evidence required for handoff. A Work Order must not silently revise this specification; product-scope changes must update this document explicitly.

## 18. Deferred decisions

The following decisions must be resolved by bounded Work Orders rather than guessed in advance:

- Which three sources are approved for the initial release
- Repository package/workspace tooling and exact supported runtime versions
- Canonical API route names and concrete schema identifiers
- Database migration tooling
- Ingestion scheduling mechanism and source-specific freshness thresholds
- The controlled role-family and technology-alias vocabularies
- Whether supported non-USD compensation conversion is needed in V1 and, if so, its auditable rate source and time policy
- Representative dataset size and measured performance thresholds

Resolving a deferred decision does not authorize adding a V1 non-goal.

## 19. Change control

This document is the V1 product-scope authority. The broader [project context](job-engine-context.md) remains authoritative for long-term direction and development philosophy.

Work Orders may refine implementation details but must conform to the goals, non-goals, user-visible behavior, data truthfulness rules, and acceptance criteria here. Any intentional deviation must be proposed as an explicit specification change with its rationale and downstream Work Order impact.
