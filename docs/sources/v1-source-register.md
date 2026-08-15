# V1 Source Register

**Work order:** [CROSS-002](../work-orders/cross-repo/CROSS-002-source-feasibility.md)

**Retrieved:** 2026-08-15 (UTC)

**Owner-review status:** `PENDING_OWNER`

This register is the CROSS-002 research record. It does not implement adapters, store a job corpus, or mark source selection accepted.

---

## 1. Decision summary

Proposed V1 primary trio:

| Rank | Source ID | Operator | Access |
| --- | --- | --- | --- |
| 1 | `himalayas` | Himalayas Remote Jobs Pty Ltd | Public JSON API with pagination and country/worldwide search |
| 2 | `jobicy` | Jobicy | Public JSON API, latest 100 per request, explicit `jobGeo` including Brazil/LATAM |
| 3 | `weworkremotely` | We Work Remotely | Official public programming RSS feed |

Ranked backups:

1. `remoteok` — public JSON snapshot, strongest software density among remaining remote aggregators; weak geographic evidence.
2. `remotive` — official public API with a good schema, but the live public feed returned only 16 jobs on 2026-08-15. Revisit if inventory recovers.

Why this trio is sufficient for V1:

- All three have first-party machine-readable access (JSON or RSS). No HTML scraping is required.
- Himalayas supplies catalog depth (`totalCount` 101,077), structured `locationRestrictions`, salary, seniority, employment type, and `expiryDate`.
- Jobicy supplies explicit Brazil/LATAM eligibility text (`jobGeo`) and a documented `geo=brazil` / `geo=latam` filter. A `geo=brazil` request returned 100 listings whose geos included `Brazil`, `LATAM, Brazil`, and related LATAM combinations.
- We Work Remotely's programming RSS is 100% software in the sampled window and every item carried `region: Anywhere in the World`, which is explicit worldwide eligibility.
- Pairwise URL/(company, title, location) overlap in the sampled windows was **zero**. Recent inventory is complementary at snapshot level.
- Together they cover paginated catalog search, geo-filtered latest listings, and a curated programming feed.

Strongest alternative trio: `himalayas` + `jobicy` + `remoteok`.

Why the alternative lost: it produced more sampled software jobs (84 vs 61) and more unique companies (184 vs 110), but only **7** sampled software jobs with explicit Brazil/LATAM/worldwide evidence versus **32** for the selected trio. Remote OK's recent window is software-heavy and company-diverse, but almost never states worldwide/LATAM/Brazil eligibility. V1 search treats remote and Brazil eligibility as separate; a third source that does not help eligibility is the weaker complement.

Arbeitnow was the complementary EU/ATS candidate. It failed the user-fit test: 0/100 sampled jobs had explicit Brazil/LATAM/worldwide evidence, and 0/100 were remote software.

---

## 2. Primary mapping

```text
BACK-004 -> himalayas
BACK-005 -> jobicy
BACK-006 -> weworkremotely
```

Mapping order: richest paginated JSON contract first (`himalayas`), then a second JSON source with Brazil/LATAM filters (`jobicy`), then a different access method (RSS) (`weworkremotely`).

---

## 3. Research method

### Retrieval

- Date/time: 2026-08-15, approximately 23:20–23:27 UTC.
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; CROSS-002 source feasibility research)`
- Public GET only. No accounts, API keys, or HTML listing scrapes.
- First-party documentation and terms pages were fetched the same day. Jobicy HTML docs returned HTTP 403 to this User-Agent; the JSON API and GitHub README succeeded, and the HTML docs page was also retrieved successfully via a separate browser-class fetch.

### Samples

Where a public interface permitted it, up to 100 recent records were used. Exact sizes:

| Source | Sample | Notes |
| --- | --- | --- |
| Himalayas | 100 | Five `limit=20` browse pages (`offset` 0..80). Catalog `totalCount` 101,077. |
| Himalayas Brazil search | `totalCount` 4,784 | `GET /jobs/api/search?country=Brazil&page=1` (20 jobs returned; count from `totalCount`). |
| Himalayas worldwide search | `totalCount` 1,649 | `GET /jobs/api/search?worldwide=true&page=1`. |
| Remotive | 16 | Entire public feed. `job-count` and `total-job-count` were both 16. `category=software-dev` and unfiltered calls returned the same 16 jobs. |
| Jobicy | 100 | `count=100` unfiltered latest. Additional filtered pulls: `geo=brazil` (100), `geo=latam` (100), `industry=engineering` (100). |
| Arbeitnow | 100 | First 100 of page 1 (`per_page` 175). Page 1 had 8 remote jobs out of 175. |
| Remote OK | 100 | Public `/api` list minus the leading legal object (101 objects total). |
| We Work Remotely | 25 | Programming category RSS. All-jobs RSS contained 100 items and was not mixed into density math. |
| Greenhouse | 578 | Single public board (`stripe`) to prove schema, not catalog coverage. |
| Adzuna | none | Live jobs calls require `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`. No account was created. |

### Software classification

A job counted as software-development when source category/industry/tags indicated engineering/software/devops/data/QA/cybersecurity, or the title matched a conservative developer/engineer regex. Himalayas recent-window density is therefore lower than a dedicated Engineering search would be; Jobicy unfiltered density is similarly mixed. We Work Remotely programming RSS was treated as software by feed membership.

### Geographic eligibility

Explicit evidence only:

- Himalayas: empty `locationRestrictions` counted as worldwide (documented API behavior). Named countries counted as Brazil/LATAM only when Brazil/Brasil or a LATAM country/region appeared.
- Remotive: `candidate_required_location` text. `Worldwide` counted. `Americas` and `USA` did **not** count as Brazil-eligible.
- Jobicy: `jobGeo` tokens (`Anywhere`, `Brazil`, `LATAM`, and related country names).
- Arbeitnow: `location` + tags. `remote=true` did **not** count.
- Remote OK: `location` + tags.
- We Work Remotely: RSS `region` (`Anywhere in the World`).

A generic remote flag never implied Brazil eligibility.

### Overlap

Research-only matching, not production deduplication:

1. Canonicalized original URL (lowercase, strip scheme/`www`, strip query, strip trailing slash).
2. Normalized `(company, title, location)` after lowercasing, punctuation collapse, and common company-suffix removal.

### Scoring

Utility score (decision support, not an automatic selector):

```text
utility_score =
  0.20 * software_job_density
+ 0.25 * eligible_for_brazil_rate
+ 0.15 * field_completeness
+ 0.20 * uniqueness
+ 0.10 * freshness
+ 0.10 * access_stability
```

Field completeness is `PRESENT=1`, `PARTIAL=0.5`, `ABSENT/UNKNOWN=0` over 15 canonical fields, awarded only for structured/source-native fields (no title/description inference credit). Uniqueness is `1 - mean pairwise Jaccard` against the other sampled sources. Freshness is `posted_within_7d / sampled_jobs` when dates exist. Access stability is a documented 0–1 judgment (pagination, terms clarity, live inventory health).

### Limitations

- Samples are recent windows, not full catalogs except Remotive (entire public feed) and Himalayas `totalCount`/search counts.
- Zero snapshot overlap does not prove catalogs never syndicate the same employer roles over longer periods.
- Himalayas unfiltered recent 100 is US-restriction heavy (59/100 first restriction `United States`); Brazil usefulness is in the **search** API, not the unfiltered browse head.
- Jobicy returns at most 100 latest rows; there is no documented deep pagination.
- We Work Remotely JSON API requires a partner token; RSS is the unauthenticated method. API terms also prohibit “saving or storing” API data. RSS vs API-terms storage is an owner/legal gate.
- Software regex/category mapping is conservative and will miss some roles and include some adjacent AI/contractor gigs.
- Adzuna was not live-sampled.

---

## 4. Candidate evaluations

### 4.1 Himalayas (`himalayas`) — `APPROVED_PRIMARY`

#### Identity

| Field | Value |
| --- | --- |
| Source name | Himalayas Remote Jobs API |
| Stable ID | `himalayas` |
| Operator | Himalayas Remote Jobs Pty Ltd (ABN 89 663 721 088) |
| Home | https://himalayas.app |
| API | https://himalayas.app/jobs/api and https://himalayas.app/jobs/api/search |
| Docs | https://himalayas.app/docs/remote-jobs-api |
| OpenAPI | https://himalayas.app/docs/openapi.json |
| Terms | https://himalayas.app/terms |
| Retrieval | 2026-08-15 |

#### Access

- Method: public JSON API. No authentication.
- Credential name: `none`
- Docs state the API is for developers, job-board operators, dashboards, and AI tools; attribution required (visible link to himalayas.app and credit Himalayas). Do not resubmit listings to Jooble/Neuvoo/Google Jobs/LinkedIn Jobs.
- Site terms forbid data-mining/robots/screen-scraping of the **website**. JSON API use is the documented machine-access path.
- Rate limit: HTTP 429. Data cached and refreshed every 24 hours; docs say there is no benefit to polling more often than daily.

#### Retrieval

- Browse: `offset`/`limit`, max 20 per request, `totalCount` for stop condition.
- Search: `page` plus `q`, `country`, `worldwide`, `seniority`, `employment_type`, and others.
- Closure: `expiryDate` present on sampled jobs.
- Stable ID: `guid`.
- Original URL: `applicationLink` (Himalayas job URL).

#### Field availability

| Field | Status | Native |
| --- | --- | --- |
| title | PRESENT | `title` |
| company | PRESENT | `companyName` |
| description | PRESENT | `description`, `excerpt` |
| location text | PARTIAL | derived from `locationRestrictions` names |
| remote status | PARTIAL | feed is remote-only; no hybrid/onsite enum |
| location eligibility | PRESENT | `locationRestrictions` (empty = worldwide per docs) |
| salary | PRESENT | `minSalary`, `maxSalary`, `currency`, `salaryPeriod` |
| published date | PRESENT | `pubDate` (unix seconds in live payload) |
| updated date | ABSENT | — |
| expiry/closure | PRESENT | `expiryDate` |
| employment type | PRESENT | `employmentType` |
| seniority | PRESENT | `seniority` |
| technologies/tags | PRESENT | `categories` (noisy in sample) |
| stable posting ID | PRESENT | `guid` |
| original URL | PRESENT | `applicationLink` |

Live `locationRestrictions` were **strings** (country names), not `{alpha2,name,slug}` objects as in some doc examples. Adapters must accept both.

#### Coverage (n=100 unfiltered recent)

- Software 23 (0.23); remote software 23 (0.23).
- Worldwide explicit 3 (0.03); LATAM explicit 4 (0.04); Brazil explicit 0 in this window.
- Eligible-for-Brazil 7 (0.07); software eligible 4.
- Salary present 41 (0.41); unique companies 45 (0.45).
- All 100 dated within 24h (browse head is the newest slice). Median age 0.09 days.
- Catalog search: `country=Brazil` `totalCount` **4,784**; `worldwide=true` `totalCount` **1,649**.

V1 ingestion should use search (`country=Brazil`, `worldwide=true`, and possibly named LATAM countries), not a 101k unfiltered crawl (~5,000 requests).

#### Quality risks

- Unfiltered head is US-restriction dominated (59/100 first restriction United States).
- Category arrays can be tag-stuffed (see redacted sample).
- Contractor marketplace gigs appear in the newest slice.
- 24h cache: not a realtime board.
- HTML descriptions need sanitization.

#### Harmless verification

- HTTP 200 on five browse pages and two search pages, 2026-08-15.
- Representative fields: `title`, `companyName`, `guid`, `applicationLink`, `employmentType`, `minSalary`, `maxSalary`, `seniority`, `currency`, `locationRestrictions`, `categories`, `pubDate`, `expiryDate`, `excerpt`.
- Redacted sample (truncated):

```json
{
  "title": "AI Safety Specialist - Fully Remote | Upto $84/hr",
  "companyName": "mercor",
  "guid": "https://himalayas.app/companies/mercor/jobs/ai-safety-specialist-fully-remote-upto-84-hr-8181419582",
  "applicationLink": "https://himalayas.app/companies/mercor/jobs/ai-safety-specialist-fully-remote-upto-84-hr-8181419582",
  "employmentType": "Contractor",
  "minSalary": 70,
  "maxSalary": 84,
  "seniority": ["Mid-level"],
  "currency": "USD",
  "locationRestrictions": ["Bosnia and Herzegovina"],
  "pubDate": 1786832788,
  "expiryDate": 1792016787
}
```

#### Decision

`APPROVED_PRIMARY` mapped to **BACK-004**. Best documented JSON contract, Brazil/worldwide search counts, expiry signal, and salary/seniority fields.

---

### 4.2 Jobicy (`jobicy`) — `APPROVED_PRIMARY`

#### Identity

| Field | Value |
| --- | --- |
| Source name | Jobicy Remote Jobs API |
| Stable ID | `jobicy` |
| Operator | Jobicy |
| Home | https://jobicy.com |
| API | https://jobicy.com/api/v2/remote-jobs |
| Docs | https://jobicy.com/jobs-rss-feed (HTML); API `documentationUrl` https://jobi.cy/apidocs; https://github.com/Jobicy/remote-jobs-api |
| Terms / fair use | Fair-use section on the API docs page; `friendlyNotice` on every JSON response |
| Retrieval | 2026-08-15 |

#### Access

- Method: public JSON API. No API key.
- Credential name: `none`
- JSON `friendlyNotice` (live): credit Jobicy with a direct source link; application buttons must redirect to the original job URL in the feed.
- Fair-use docs: personal/job-discovery products allowed without a separate agreement; keep Jobicy as source; do not strip attribution; poll a few times per day and **not more than once per hour**; cache responses.
- HTML homepage/docs returned **403** to the research User-Agent; JSON API returned **200**. Treat HTML 403 as a fetch quirk, not as missing permission: the API itself publishes the fair-use notice.

#### Retrieval

- `count` 1–100 (default 100). Latest matching jobs only. No deep pagination.
- Filters: `geo`, `industry`, `tag`. Taxonomies: `?get=locations`, `?get=industries`.
- Closure: none in schema. Absence from a later latest-100 window is a last-seen signal only.
- Stable ID: integer `id` (also `jobSlug`).
- Original URL: `url` (Jobicy canonical).

#### Field availability

| Field | Status | Native |
| --- | --- | --- |
| title | PRESENT | `jobTitle` |
| company | PRESENT | `companyName` |
| description | PRESENT | `jobDescription` (HTML), `jobExcerpt` |
| location text | PRESENT | `jobGeo` |
| remote status | PARTIAL | remote-only feed |
| location eligibility | PRESENT | `jobGeo` (`Anywhere`, `Brazil`, `LATAM`, country lists) |
| salary | PARTIAL | `salaryMin`/`salaryMax`/`salaryCurrency`/`salaryPeriod` omitted on some objects; 59/100 sampled jobs had numeric salary bounds |
| published date | PRESENT | `pubDate` |
| updated date | ABSENT | — |
| expiry/closure | ABSENT | — |
| employment type | PRESENT | `jobType` |
| seniority | PRESENT | `jobLevel` (`Any` is common) |
| technologies/tags | PARTIAL | `jobIndustry` (function, not tech stack) |
| stable posting ID | PRESENT | `id` |
| original URL | PRESENT | `url` |

#### Coverage

Unfiltered latest 100:

- Software 16 (0.16); worldwide 1; LATAM 6; Brazil 2; eligible-for-Brazil 7 (0.07); software eligible 3.
- Salary 59 (0.59); unique companies 57; all 100 posted within 24h; median age 0.51 days.

Filtered pulls (not mixed into the unfiltered density table):

- `geo=brazil`: 100 jobs. Geos included `Brazil`, `LATAM, Brazil`, `Argentina, Brazil, Mexico`, broader LATAM combinations, and some `Anywhere`.
- `industry=engineering`: 100 jobs; 19 had Brazil or LATAM in `jobGeo`; 3 were `Anywhere`.

#### Quality risks

- Latest-100 window only; historical depth is not available through the public API.
- `jobGeo` can list many regions; Brazil presence is explicit when the token appears, but a `geo=brazil` filter also returned some LATAM-without-Brazil strings (treat those as LATAM, not Brazil).
- HTML entities in industry labels (`Finance &amp; Accounting`).
- Homepage 403 to non-browser UAs may affect future doc checks.

#### Harmless verification

- HTTP 200, 2026-08-15, `count=100` plus three filtered requests.
- Redacted sample:

```json
{
  "id": 150821,
  "url": "https://jobicy.com/jobs/150821-associate-cpa-smmm",
  "jobTitle": "Associate (CPA/SMMM)",
  "companyName": "Manay CPA Inc.",
  "jobIndustry": ["Finance & Accounting"],
  "jobType": ["Full-Time"],
  "jobGeo": "Türkiye",
  "jobLevel": "Any",
  "pubDate": "2026-08-15T16:20:22+00:00"
}
```

#### Decision

`APPROVED_PRIMARY` mapped to **BACK-005**. Best explicit Brazil/LATAM structured eligibility among public JSON feeds that remain large enough to ingest.

---

### 4.3 We Work Remotely (`weworkremotely`) — `APPROVED_PRIMARY`

#### Identity

| Field | Value |
| --- | --- |
| Source name | We Work Remotely |
| Stable ID | `weworkremotely` |
| Operator | We Work Relatively / We Work Remotely |
| Home | https://weworkremotely.com |
| Feed | https://weworkremotely.com/categories/remote-programming-jobs.rss (also category-specific and https://weworkremotely.com/remote-jobs.rss) |
| RSS docs | https://weworkremotely.com/remote-job-rss-feed |
| API terms | https://weworkremotely.com/api-terms-and-guidelines |
| JSON API | https://weworkremotely.com/api (partner token; posting-oriented) |
| Retrieval | 2026-08-15 |

#### Access

- Method for V1: **official public RSS**. RSS docs: “Anyone can use the feed, all we ask is that you attribute the links back to We Work Remotely.”
- JSON `/api` requires a partnership token. Not used.
- Credential name: `none` for RSS.
- API terms (JSON API page): applications must route applying through weworkremotely.com; do not compete with/replace WWR; **“API Only”** clause says the only data you may use is that exposed via the API and that scraping/copying/saving/storing is prohibited.
- Unresolved gate: RSS page invites filling a job feed; API terms prohibit storing “API” data and the JSON API is partner-gated. Owner should confirm that storing attributed RSS items in a personal catalog, with apply links kept on weworkremotely.com, is accepted. If not, replace this primary with `remoteok`.

#### Retrieval

- Finite RSS windows: programming feed **25** items; all-jobs feed **100** items. No pagination.
- Recurring ingestion is bounded by feed length, not by a page API.
- Closure: item disappearing from the feed (last-seen). No expiry field.
- Stable ID: `guid` (WWR job URL). Deterministic fallback: `link`.
- Original URL: `link`.

#### Field availability

| Field | Status | Native |
| --- | --- | --- |
| title | PARTIAL | `title` is `Company: Role` |
| company | PARTIAL | split from `title` |
| description | PRESENT | HTML `description` |
| location text | PRESENT | `region` |
| remote status | PARTIAL | remote board |
| location eligibility | PRESENT | `region` (sample: `Anywhere in the World`) |
| salary | PARTIAL | only if present in HTML description |
| published date | PRESENT | `pubDate` |
| updated date | ABSENT | — |
| expiry/closure | PARTIAL | drop from feed |
| employment type | ABSENT | — |
| seniority | ABSENT | — |
| technologies/tags | PARTIAL | `category` (Full-Stack Programming, etc.) |
| stable posting ID | PRESENT | `guid` |
| original URL | PRESENT | `link` |

#### Coverage (programming RSS, n=25)

- Software 25 (1.00); worldwide explicit 25 (1.00); LATAM/Brazil 0.
- Eligible-for-Brazil 25 (1.00) via worldwide region, **not** via a Brazil label.
- Salary-like text in 15 descriptions (0.60).
- Unique companies 8 (0.32) — repeat posters.
- Posted within 7d: 0; within 30d: 24; median age **24.68 days**.

High eligibility quality, shallow and older window.

#### Quality risks

- Small feed; not a large catalog.
- Median age ~25 days; weak freshness versus Himalayas/Jobicy heads.
- Company/title parsing from a single string.
- JSON API unavailable without partnership.
- Storage-terms ambiguity (see gate).
- API terms also say do not build a competing job board. A personal catalog with outbound WWR apply links is the intended RSS use, but is not a legal opinion.

#### Harmless verification

- HTTP 200, 2026-08-15, programming and all-jobs RSS.
- Redacted sample:

```json
{
  "title": "Stripe: GTM Operations Process Architect",
  "link": "https://weworkremotely.com/remote-jobs/stripe-gtm-operations-process-architect",
  "guid": "https://weworkremotely.com/remote-jobs/stripe-gtm-operations-process-architect",
  "region": "Anywhere in the World",
  "category": "Full-Stack Programming",
  "pubDate": "Wed, 22 Jul 2026 07:02:54 +0000"
}
```

#### Decision

`APPROVED_PRIMARY` mapped to **BACK-006**, subject to the RSS-storage owner/legal gate. Selected because it contributed the most unique worldwide software listings in trio math, via a different access method than the two JSON aggregators.

---

### 4.4 Remote OK (`remoteok`) — `APPROVED_BACKUP` (rank 1)

#### Identity

| Field | Value |
| --- | --- |
| Source name | Remote OK |
| Stable ID | `remoteok` |
| Operator | Remote OK |
| Home | https://remoteok.com |
| API | https://remoteok.com/api |
| Docs | https://remoteok.featurebase.app/help/articles/3140840-is-there-an-api-or-rssjson-feed-of-remote-jobs |
| Terms | Embedded `legal` object in the JSON feed |
| Retrieval | 2026-08-15 |

#### Access

- Public JSON (and RSS). No auth. Credential name: `none`.
- Live legal object requires follow-link attribution to the Remote OK URL, mention of Remote OK as source, and no Remote OK logo without permission. Help article: aggregators should credit Remote OK and link original job URLs.
- Help article documents `?tag=` / `?tags=` filters.

#### Retrieval

- Snapshot of the latest ~100 jobs. No pagination to older jobs.
- First array element is metadata/legal, not a job.
- Delay historically described as 24h (not restated in the 2026-08-15 legal object; still treat as delayed).
- Stable ID: `id` / `slug`. Original URL: `url` / `apply_url`.

#### Field availability

| Field | Status | Native |
| --- | --- | --- |
| title | PRESENT | `position` |
| company | PRESENT | `company` |
| description | PRESENT | `description` |
| location text | PARTIAL | `location` often city fragments (`Evansville,`) |
| remote status | PARTIAL | remote board |
| location eligibility | PARTIAL | unstructured `location`/tags; almost never worldwide/LATAM/Brazil in sample |
| salary | PARTIAL | `salary_min`/`salary_max`; 2/100 non-zero |
| published date | PRESENT | `date`, `epoch` |
| updated date | ABSENT | — |
| expiry/closure | ABSENT | drop from snapshot |
| employment type | ABSENT | — |
| seniority | ABSENT | — |
| technologies/tags | PRESENT | `tags` |
| stable posting ID | PRESENT | `id` |
| original URL | PRESENT | `url` |

#### Coverage (n=100)

- Software 48 (0.48) — highest software density among large JSON samples.
- Worldwide 1; LATAM 1; Brazil 0; eligible-for-Brazil 2 (0.02); software eligible 0.
- Salary 2 (0.02); unique companies 85 (0.85).
- Posted within 24h 0; within 7d 100; median age 3.86 days.

#### Quality risks

- Location noise; cannot support V1 Brazil filters without inference.
- Tag/title noise (non-job editorial posts appeared).
- No pagination; 100-job cap.
- Salary mostly zero.

#### Harmless verification

- HTTP 200, 2026-08-15. Legal object recorded (not copied in full beyond the attribution/logo clauses above).
- Redacted sample: id `1136792`, position “Why Your First Weeks a New Role Shape Everything That Follows”, company `Decode-X`, location `Evansville,`, tags `ops`, salary 0/0.

#### Decision

`APPROVED_BACKUP`. Promote if WWR storage is rejected, accepting weaker eligibility.

---

### 4.5 Remotive (`remotive`) — `APPROVED_BACKUP` (rank 2)

#### Identity

| Field | Value |
| --- | --- |
| Source name | Remotive Remote Jobs Public API |
| Stable ID | `remotive` |
| Operator | Remotive |
| Home | https://remotive.com |
| API | https://remotive.com/api/remote-jobs |
| Docs | https://remotive.com/remote-jobs/api ; https://github.com/remotive-com/remote-jobs-api (https://remotive.com/api-documentation redirects here) |
| Terms | Live `0-legal-notice` on every API response; https://support.remotive.com/en/article/terms-of-service-u4kbkf/ |
| Retrieval | 2026-08-15 |

#### Access

- Public JSON. No auth. Credential name: `none`.
- Legal notice: share jobs with Remotive URL + attribution; do not submit to Jooble/Neuvoo/Google Jobs/LinkedIn; 24h delay; max about 4 GETs/day; more than 2 requests/minute blocked; do not use listings to collect emails.
- Schema includes `id`, `url`, `candidate_required_location` (docs example `Worldwide`), `salary`, `job_type`, `tags`.

#### Retrieval

- Documented as “all active listings” with optional `category`, `limit`, `search`.
- **Live 2026-08-15 inventory: 16 jobs total.** `limit=100`, no limit, and `category=software-dev` all returned the same 16.
- Closure: absence from the “active” list.
- Stable ID: numeric `id`. Original URL: `url`.

#### Field availability

Strong schema (see matrix). Seniority absent. Salary is free text (`PARTIAL`).

#### Coverage (n=16, entire public feed)

- Software 6 (0.375); worldwide 6 (0.375); LATAM/Brazil 0; eligible-for-Brazil 6; software eligible 2.
- Locations included `Worldwide`, `USA`, `Europe`, `Americas, Europe, Israel`. `Americas` was not counted as Brazil-eligible.
- Salary text 12 (0.75); unique companies 12.
- Posted within 7d: 2; median age 15.76 days.

#### Quality risks

- Public feed is currently too small for material V1 coverage.
- Category filter did not reduce/expand the 16-job set.
- 24h delay.

#### Harmless verification

- HTTP 200, 2026-08-15. `job-count` 16. Redacted sample: id `2091093`, TELUS Digital, `candidate_required_location` `USA`.

#### Decision

`APPROVED_BACKUP` rank 2, not primary. Official access and schema are fine; **live volume fails “material software-development coverage.”** Re-check before promoting.

---

### 4.6 Arbeitnow (`arbeitnow`) — `REJECTED`

#### Identity

| Field | Value |
| --- | --- |
| Source name | Arbeitnow Job Board API |
| Stable ID | `arbeitnow` |
| Operator | Arbeitnow (Berlin) |
| Home | https://www.arbeitnow.com |
| API | https://www.arbeitnow.com/api/job-board-api |
| Docs | https://www.arbeitnow.com/blog/job-board-api ; Postman https://documenter.getpostman.com/view/18545278/UVJbJdKh |
| Terms | https://www.arbeitnow.com/terms §11 API |
| Retrieval | 2026-08-15 |

#### Access

- Public JSON, no key. Credential name: `none`.
- Response `meta.terms`: free public API, do not abuse, link back to Arbeitnow.com, agree to site terms.
- Site terms §11: as-is API, must link back, permission revocable at any time.
- `meta.info`: jobs updated every hour, ordered by `created_at`, paginate with `?page=`.

#### Retrieval

- Page-based, `per_page` 175 on 2026-08-15.
- Stable ID: `slug`. Original URL: `url`.
- Closure: drop from later pages / last-seen. No expiry field.

#### Field availability

Remote boolean is `PRESENT`. Location eligibility `ABSENT` as a structured field (city strings like `Dusseldorf`). Compensation `ABSENT`. Seniority `ABSENT`.

#### Coverage (n=100 of page 1)

- Software 29 (0.29); remote software **0**.
- Page 1 overall: 8/175 remote.
- Worldwide/LATAM/Brazil explicit **0**. Eligible-for-Brazil **0**.
- Salary 0. Unique companies 45. All 100 dated within 24h (newest page).

#### Quality risks

- Germany/EU onsite ATS inventory. Complementary geographically in the wrong direction for a Brazil-based remote searcher.
- `remote=true` still would not imply Brazil eligibility.

#### Harmless verification

- HTTP 200, pages 1–5, 2026-08-15. Redacted sample: German-language marketing role in Dusseldorf, `remote: false`.

#### Decision

`REJECTED` for V1. Lawful API, but it does not contribute Brazil/LATAM/worldwide software coverage. Possible later EU-local expansion, not a V1 primary.

---

### 4.7 Greenhouse Job Board API (`greenhouse`) — `POST_V1`

#### Identity

| Field | Value |
| --- | --- |
| Source name | Greenhouse Job Board API |
| Stable ID | `greenhouse` |
| Operator | Greenhouse Software |
| Home / docs | https://developers.greenhouse.io ; https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview |
| API | `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` |
| Retrieval | 2026-08-15 |

#### Access

- Public unauthenticated **read** of one company's published board. Harvest API is private and out of scope.
- Not a multi-employer catalog. V1 would have to own a curated `board_token` list.
- Credential name for read: `none`. Apply-POST would need a Job Board API key (not needed for V1 ingest).

#### Retrieval / fields

- List jobs per board; optional `content=true` for descriptions.
- Stable ID: numeric `id`. URL: `absolute_url`.
- Sample board `stripe`: HTTP 200, `meta.total` 578.
- Location is an office string (`SF, NYC, SEA, CHI`). No Brazil eligibility field. Remote/compensation/seniority generally absent unless in optional metadata.

#### Decision

`POST_V1`. Schema is fine; the **catalog strategy** is not. A later curated-employer program (Greenhouse/Lever/Ashby/Workable) may add unique direct postings after V1.

Harmless verification redacted sample: Stripe `Account Executive, Bridge`, `absolute_url` on stripe.com, `id` 8077887.

---

### 4.8 Adzuna (`adzuna`) — `POST_V1`

#### Identity

| Field | Value |
| --- | --- |
| Source name | Adzuna API |
| Stable ID | `adzuna` |
| Operator | Adzuna Ltd |
| Home | https://www.adzuna.com (HTTP 403 to research UA) |
| Docs | https://developer.adzuna.com ; https://developer.adzuna.com/overview |
| Retrieval | 2026-08-15 |

#### Access

- Authenticated REST: `https://api.adzuna.com/v1/api/jobs/{country}/search/{page}` with obligatory `app_id` and `app_key`.
- Credential names: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.
- Registration required (https://developer.adzuna.com/signup). **No account was created** for this order. Live verification is an unresolved credential gate.
- Country-partitioned (`gb`, and others). Brazil discoverability was not measured.

#### Decision

`POST_V1`. Official API exists, but V1 must not depend on unverified credentials or unmeasured Brazil/remote coverage.

---

### 4.9 Optional brief rejections

| Candidate | Decision | First-party reason |
| --- | --- | --- |
| LinkedIn | `REJECTED` | No permitted personal jobs catalog API for this product. Official access is partner/restricted; scraping would violate CROSS-002. |
| Indeed | `REJECTED` | Publisher/partner APIs are not a self-serve personal catalog. Arbeitnow's own docs note Indeed API access is not practically obtainable. |
| YC Work at a Startup | `REJECTED` | No first-party public jobs API. Existing tools are reverse-engineered/scrapers, which CROSS-002 forbids. |
| Gupy | `REJECTED` | Official API is employer-scoped and authenticated for a company's own jobs, not a public multi-employer catalog. |

---

## 5. Field-coverage matrix

| Canonical field | himalayas | jobicy | weworkremotely | remoteok | remotive | arbeitnow | greenhouse |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Posting ID | PRESENT `guid` | PRESENT `id` | PRESENT `guid` | PRESENT `id` | PRESENT `id` | PRESENT `slug` | PRESENT `id` |
| Original URL | PRESENT `applicationLink` | PRESENT `url` | PRESENT `link` | PRESENT `url` | PRESENT `url` | PRESENT `url` | PRESENT `absolute_url` |
| Job title | PRESENT | PRESENT `jobTitle` | PARTIAL `Company: Role` | PRESENT `position` | PRESENT | PRESENT | PRESENT |
| Company | PRESENT `companyName` | PRESENT | PARTIAL split | PRESENT | PRESENT `company_name` | PRESENT | PARTIAL per board |
| Description | PRESENT | PRESENT HTML | PRESENT HTML | PRESENT | PRESENT HTML | PRESENT | PARTIAL `content=true` |
| Location text | PARTIAL from restrictions | PRESENT `jobGeo` | PRESENT `region` | PARTIAL | PRESENT `candidate_required_location` | PRESENT city | PRESENT office string |
| Remote status | PARTIAL feed-level | PARTIAL feed-level | PARTIAL feed-level | PARTIAL feed-level | PARTIAL feed-level | PRESENT `remote` | ABSENT |
| Location eligibility | PRESENT `locationRestrictions` | PRESENT `jobGeo` | PRESENT `region` | PARTIAL | PRESENT | ABSENT | ABSENT |
| Compensation | PRESENT structured | PARTIAL optional | ABSENT/HTML | PARTIAL mostly 0 | PARTIAL text | ABSENT | ABSENT |
| Published date | PRESENT `pubDate` | PRESENT `pubDate` | PRESENT `pubDate` | PRESENT `date` | PRESENT | PRESENT `created_at` | PARTIAL `first_published` |
| Updated date | ABSENT | ABSENT | ABSENT | ABSENT | ABSENT | ABSENT | PRESENT `updated_at` |
| Closure signal | PRESENT `expiryDate` | ABSENT | PARTIAL drop-from-feed | ABSENT | PARTIAL active-list | PARTIAL drop-from-page | PARTIAL deadline |
| Employment type | PRESENT | PRESENT `jobType` | ABSENT | ABSENT | PARTIAL `job_type` | PARTIAL `job_types` | ABSENT |
| Seniority | PRESENT | PRESENT `jobLevel` | ABSENT | ABSENT | ABSENT | ABSENT | ABSENT |
| Technologies/tags | PRESENT `categories` | PARTIAL industry | PARTIAL category | PRESENT `tags` | PRESENT `tags` | PRESENT `tags` | ABSENT |

Field completeness scores (15 fields): himalayas 0.87, jobicy 0.77, remotive 0.73, arbeitnow 0.67, remoteok 0.60, weworkremotely 0.57, greenhouse 0.47.

---

## 6. Quantitative coverage comparison

Unfiltered recent windows (Remotive = entire public feed). Rates are sample rates, not catalog estimates except where `totalCount` is noted in method.

| Source | n | software | sw density | BR | LATAM | WW | eligible BR rate | sw eligible | salary cov. | unique cos | median age d | field complete |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| himalayas | 100 | 23 | 0.23 | 0 | 4 | 3 | 0.07 | 4 | 0.41 | 45 | 0.09 | 0.87 |
| jobicy | 100 | 16 | 0.16 | 2 | 6 | 1 | 0.07 | 3 | 0.59 | 57 | 0.51 | 0.77 |
| weworkremotely | 25 | 25 | 1.00 | 0 | 0 | 25 | 1.00 | 25 | 0.60 | 8 | 24.68 | 0.57 |
| remoteok | 100 | 48 | 0.48 | 0 | 1 | 1 | 0.02 | 0 | 0.02 | 85 | 3.86 | 0.60 |
| remotive | 16 | 6 | 0.38 | 0 | 0 | 6 | 0.38 | 2 | 0.75 | 12 | 15.76 | 0.73 |
| arbeitnow | 100 | 29 | 0.29 | 0 | 0 | 0 | 0.00 | 0 | 0.00 | 45 | 0.37 | 0.67 |

Additional catalog/filter evidence (not in the table):

- Himalayas search `country=Brazil`: 4,784 jobs; `worldwide=true`: 1,649.
- Jobicy `geo=brazil`: 100 latest Brazil/LATAM-oriented rows; `industry=engineering`: 100 rows, 19 with Brazil/LATAM geo.

Freshness (dated jobs): Himalayas/Jobicy/Arbeitnow heads are <1 day; Remote OK median 3.9 days; Remotive 15.8; WWR programming 24.7.

---

## 7. Pairwise overlap matrix

Metric: `jaccard = matched / |A ∪ B|` using URL or normalized `(company, title, location)`.

Matched counts were **0** for every required pair in these windows.

| A \ B | himalayas | remotive | jobicy | arbeitnow | remoteok | weworkremotely |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| himalayas | — | 0 | 0 | 0 | 0 | 0 |
| remotive | 0 | — | 0 | 0 | 0 | 0 |
| jobicy | 0 | 0 | — | 0 | 0 | 0 |
| arbeitnow | 0 | 0 | 0 | — | — | — |
| remoteok | 0 | 0 | 0 | — | — | 0 |
| weworkremotely | 0 | 0 | 0 | — | 0 | — |

Interpretation: the aggregator-duplication risk did **not** appear in 2026-08-15 recent windows. That supports mixing two JSON remote boards. It does not prove long-horizon syndication is zero. Production BACK-003 dedup remains required.

---

## 8. Trio comparison

Union after the same URL/tuple collapse used for overlap.

| Trio | union jobs | union software | union software eligible | unique companies | mean Jaccard |
| --- | ---: | ---: | ---: | ---: | ---: |
| himalayas + jobicy + weworkremotely | 208 | 61 | **32** | 110 | 0 |
| himalayas + remotive + weworkremotely | 124 | 51 | 31 | 65 | 0 |
| himalayas + weworkremotely + remoteok | 208 | 93 | 29 | 135 | 0 |
| jobicy + weworkremotely + remoteok | 225 | 89 | 28 | 150 | 0 |
| himalayas + jobicy + remoteok | 283 | **84** | 7 | **184** | 0 |
| himalayas + remotive + jobicy | 199 | 42 | 9 | 114 | 0 |
| himalayas + jobicy + arbeitnow | 282 | 65 | 7 | 147 | 0 |
| remotive + jobicy + arbeitnow | 215 | 51 | 5 | 114 | 0 |
| himalayas + remotive + arbeitnow | 198 | 55 | 6 | 102 | 0 |
| himalayas + remotive + remoteok | 199 | 74 | 6 | 138 | 0 |

Selected trio wins on **union software jobs with explicit Brazil/LATAM/worldwide evidence**, which is the V1 user objective. Remote OK wins raw software union and company diversity but does not move eligibility. Arbeitnow adds volume without eligibility. Remotive adds almost no union size.

---

## 9. Source utility scores

Component scores in 0–1. Uniqueness is 1.0 everywhere because snapshot Jaccard was 0; it does not differentiate and must not be over-read.

| Source | software dens. | geo eligible | fields | uniqueness | freshness | access | **utility** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| weworkremotely | 1.00 | 1.00 | 0.57 | 1.00 | 0.00 | 0.70 | **0.805** |
| himalayas | 0.23 | 0.07 | 0.87 | 1.00 | 1.00 | 0.95 | **0.589** |
| remoteok | 0.48 | 0.02 | 0.60 | 1.00 | 1.00 | 0.65 | **0.556** |
| jobicy | 0.16 | 0.07 | 0.77 | 1.00 | 1.00 | 0.80 | **0.545** |
| remotive | 0.38 | 0.38 | 0.73 | 1.00 | 0.13 | 0.45 | **0.536** |
| arbeitnow | 0.29 | 0.00 | 0.67 | 1.00 | 1.00 | 0.75 | **0.533** |

Access judgments: Himalayas 0.95 (OpenAPI, pagination, 429, 24h cache). Jobicy 0.80 (clear fair use, latest-100 cap, HTML 403). WWR 0.70 (official RSS, small window, JSON partner + storage-clause tension). Remote OK 0.65 (legal in-feed, no pagination). Arbeitnow 0.75 (paginated, revocable). Remotive 0.45 (schema good, live inventory collapsed).

Jobicy is below Remote OK on this score because unfiltered density/geo in the latest-100 mix is modest. It is still a primary because **filtered** `geo=brazil` / `industry=engineering` access is what V1 will call, and because trio math with WWR beats Remote OK on eligibility. The score is support, not a selector.

---

## 10. Per-primary operational notes

### `himalayas` (BACK-004)

- Credentials: `none`
- Refresh: upstream cached 24h. Recommend at most **once per day**. Faster polling is not justified.
- Closure: persist `expiryDate`; also last-seen if a guid vanishes from search pages.
- Ingest shape: bounded search, not full browse. Suggested first queries: `worldwide=true`, `country=Brazil`, then additional LATAM country filters if needed. Cap pages. Honor 429.
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; personal catalog; himalayas adapter)`
- Attribution: visible “sourced from Himalayas” and keep `applicationLink`.
- Fixtures: one sanitized success job with `guid`, `applicationLink`, empty and non-empty `locationRestrictions`, salary null vs numbers, `expiryDate`; one malformed (missing `guid`). Strip emails/phones; truncate `description`; keep IDs/URLs/title/company.

### `jobicy` (BACK-005)

- Credentials: `none`
- Refresh: docs say a few times per day, **not more than once per hour**. Recommend **1–2 times per day**.
- Closure: no expiry. Last-seen against the latest-100 (and filtered) windows. Do not invent 14/30-day global lifecycle here.
- Ingest shape: `count=100` with `industry` engineering/software slugs plus `geo=brazil` and `geo=latam` (discover slugs via `?get=industries` / `?get=locations`). Dedup by `id` across those pulls.
- User-Agent: same identifying pattern as Himalayas.
- Attribution: credit Jobicy; application actions must use feed `url`.
- Fixtures: success object with `id`, `url`, `jobGeo: "Brazil"`, optional salary fields present; success without salary keys; malformed missing `id`. HTML-unescape `jobIndustry`. Truncate `jobDescription`.

### `weworkremotely` (BACK-006)

- Credentials: `none` (RSS). Do not call partner JSON API.
- Refresh: no documented cadence. Programming feed median age ~25 days; **daily** RSS GET is enough and gentle.
- Closure: drop-from-feed last-seen only.
- Ingest shape: programming RSS, optionally also full-stack / back-end / front-end / devops category RSS. Parse `Company: Role`. Keep `link` as apply URL (API attribution: do not bypass WWR apply).
- User-Agent: identifying RSS client string as above.
- Attribution: links back to We Work Remotely; do not use WWR marks as product branding.
- Fixtures: one RSS `<item>` with `guid`/`link`/`region`; one malformed item missing `link`. Truncate description HTML. No bulk dump.
- Gate: owner confirms RSS storage for a personal catalog is acceptable despite JSON API “do not store” language.

Lifecycle thresholds such as “14 days stale / 30 days closed” are **not** set here; they are absent from the product spec and belong to a later data-model/ingestion order. This register only records upstream evidence.

---

## 11. Rejected / post-V1 sources

| ID | Decision | Why not V1 primary now |
| --- | --- | --- |
| `remoteok` | backup | Software-dense but almost no explicit Brazil/LATAM/worldwide evidence; 100-job snapshot. |
| `remotive` | backup | Official API; live public inventory is 16 jobs. |
| `arbeitnow` | `REJECTED` | Lawful EU/ATS API; 0 sampled Brazil/worldwide-eligible software jobs. |
| `greenhouse` | `POST_V1` | Per-company boards, not a catalog. |
| `adzuna` | `POST_V1` | Keys required; Brazil/remote behavior untested. |
| LinkedIn / Indeed / YC WaaS / Gupy | `REJECTED` | No lawful personal catalog access. |

---

## 12. Unresolved review gates

1. **Owner acceptance of the trio** `himalayas`, `jobicy`, `weworkremotely` (`PENDING_OWNER`).
2. **WWR RSS storage:** confirm personal catalog persistence with attribution and WWR apply URLs is allowed, given JSON API terms that forbid storing API data and require partner tokens for JSON. If rejected, bind BACK-006 to `remoteok` instead.
3. **Himalayas ingest filter set:** confirm V1 should search Brazil + worldwide (and optional LATAM countries) rather than ingest the unfiltered 101k browse feed.
4. **Jobicy HTML 403** to non-browser UAs: docs remain usable via JSON notice + GitHub + browser fetch; re-check if that hardens.
5. **Adzuna / Greenhouse** remain unavailable for V1 without credentials or a board-token program.
6. **Remotive inventory:** re-sample before any promotion; do not assume GitHub README “all active jobs” matches the live 16-row feed.

No gate is silently treated as permission.

---

## 13. Handoff evidence

### Validation commands

```bash
test -f docs/sources/v1-source-register.md
rg -n "APPROVED_PRIMARY|APPROVED_BACKUP|REJECTED|POST_V1" docs/sources/v1-source-register.md
rg -n "BACK-004|BACK-005|BACK-006" docs/sources/v1-source-register.md
rg -n "PENDING_OWNER" docs/sources/v1-source-register.md
git diff --check
git status --short
```

Recorded 2026-08-15 after the register was written:

```text
test -f docs/sources/v1-source-register.md
# OK

rg -n "APPROVED_PRIMARY|APPROVED_BACKUP|REJECTED|POST_V1" docs/sources/v1-source-register.md
# matches present for all four decision labels

rg -n "BACK-004|BACK-005|BACK-006" docs/sources/v1-source-register.md
# BACK-004 -> himalayas; BACK-005 -> jobicy; BACK-006 -> weworkremotely

rg -n "PENDING_OWNER" docs/sources/v1-source-register.md
# matches present, including "Status: PENDING_OWNER"

git diff --check
# no whitespace errors

git status --short
# ?? docs/sources/
```

Exactly three sources are labeled `APPROVED_PRIMARY` (`himalayas`, `jobicy`, `weworkremotely`). Two are `APPROVED_BACKUP`. No other repo paths were added.

### Manual first-party link check (2026-08-15)

| Source | URL | Role | HTTP |
| --- | --- | --- | --- |
| Himalayas | https://himalayas.app | home | 200 |
| Himalayas | https://himalayas.app/docs/remote-jobs-api | docs | 200 |
| Himalayas | https://himalayas.app/docs/openapi.json | OpenAPI | 200 |
| Himalayas | https://himalayas.app/terms | terms | 200 |
| Himalayas | https://himalayas.app/jobs/api?limit=20&offset=0 | API | 200 |
| Jobicy | https://jobicy.com | home | 403 to research UA; 200 via browser-class fetch |
| Jobicy | https://jobicy.com/jobs-rss-feed | docs/fair use | 403 to research UA; 200 via browser-class fetch |
| Jobicy | https://jobicy.com/api/v2/remote-jobs?count=100 | API | 200 |
| Jobicy | https://github.com/Jobicy/remote-jobs-api | first-party GitHub docs | 200 |
| WWR | https://weworkremotely.com | home | 200 |
| WWR | https://weworkremotely.com/remote-job-rss-feed | RSS docs | 200 |
| WWR | https://weworkremotely.com/api-terms-and-guidelines | API terms | 200 |
| WWR | https://weworkremotely.com/categories/remote-programming-jobs.rss | feed | 200 |
| Remotive | https://remotive.com | home | 200 |
| Remotive | https://remotive.com/remote-jobs/api | API landing | 200 |
| Remotive | https://remotive.com/api/remote-jobs?limit=100 | API | 200 |
| Remotive | https://support.remotive.com/en/article/terms-of-service-u4kbkf/ | terms | 200 |
| Arbeitnow | https://www.arbeitnow.com | home | 200 |
| Arbeitnow | https://www.arbeitnow.com/blog/job-board-api | docs | 200 |
| Arbeitnow | https://www.arbeitnow.com/terms | terms | 200 |
| Arbeitnow | https://www.arbeitnow.com/api/job-board-api?page=1 | API | 200 |
| Remote OK | https://remoteok.com | home | 200 |
| Remote OK | https://remoteok.com/api | API | 200 |
| Remote OK | https://remoteok.featurebase.app/help/articles/3140840-is-there-an-api-or-rssjson-feed-of-remote-jobs | help | 200 |
| Greenhouse | https://developers.greenhouse.io | docs | 200 |
| Greenhouse | https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview | overview | 200 |
| Greenhouse | https://boards-api.greenhouse.io/v1/boards/stripe/jobs | sample board | 200 |
| Adzuna | https://developer.adzuna.com | docs | 200 |
| Adzuna | https://developer.adzuna.com/overview | overview | 200 |
| Adzuna | https://www.adzuna.com | home | 403 to research UA |

No application code, dependencies, `.env`, secrets, or job corpus were added to the repository. Sample payloads stayed outside the worktree (`/tmp`).

---

## 14. Owner review request

Please review the proposed trio and the WWR storage gate.

```text
Status: PENDING_OWNER
```

Do not mark CROSS-002 `DONE` until the owner accepts the three-source set (or names a replacement, typically `remoteok` for BACK-006).
