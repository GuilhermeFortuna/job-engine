# V1 Source Register

**Work order:** [CROSS-002](../work-orders/cross-repo/CROSS-002-source-feasibility.md)

**Retrieved:** 2026-08-15 (UTC); WWR programming RSS re-retrieved and reclassified 2026-08-16T22:54:56Z

**Owner-review status:** `PENDING_OWNER`

This register is the CROSS-002 research record. It does not implement adapters, store a job corpus, or mark source selection accepted.

---

## 1. Decision summary

Proposed V1 primaries (two of three seats):

| Rank | Source ID | Operator | Access | Decision |
| --- | --- | --- | --- | --- |
| 1 | `himalayas` | Himalayas Remote Jobs Pty Ltd | Public JSON API with pagination and country/worldwide search | `APPROVED_PRIMARY` |
| 2 | `jobicy` | Jobicy | Public JSON API, latest 100 per request, explicit `jobGeo` including Brazil/LATAM | `APPROVED_PRIMARY` |

Third seat: **unresolved owner/legal gate**. Candidates:

| Candidate | Operator | Access | Decision |
| --- | --- | --- | --- |
| `weworkremotely` | We Work Remotely | Official public programming RSS feed | `PENDING_OWNER` (not approved) |
| `remoteok` | Remote OK | Public JSON snapshot | `APPROVED_BACKUP` (rank 1) |

Ranked backups:

1. `remoteok` — public JSON snapshot, strongest software density among remaining remote aggregators; weak geographic evidence. Same conservative classification as WWR; **0** sampled software jobs with explicit Brazil/LATAM/worldwide evidence.
2. `remotive` — official public API with a good schema, but the live public feed returned only 16 jobs on 2026-08-15. Revisit if inventory recovers.

Why two primaries are supportable now:

- Himalayas and Jobicy have first-party JSON access. No HTML scraping is required.
- Himalayas supplies catalog depth (`totalCount` 101,077), structured `locationRestrictions`, salary, seniority, employment type, and `expiryDate`.
- Jobicy supplies explicit Brazil/LATAM eligibility text (`jobGeo`) and a documented `geo=brazil` / `geo=latam` filter. A `geo=brazil` request returned 100 listings whose geos included `Brazil`, `LATAM, Brazil`, and related LATAM combinations.
- Pairwise URL/(company, title, location) overlap in the 2026-08-15 windows was **zero**.

Why the third seat is not accepted in this register:

- The 2026-08-15 register treated every WWR programming-feed item as software because it appeared in that feed. Independent review rejected that rule. Re-retrieval on 2026-08-16 (`n=25`) and title/description classification found **6** software roles (density **0.24**) and **5** software roles that remain Brazil/worldwide-eligible after geographic vetoes. Representative contamination includes marketing, legal, operations, underwriting, and general program-management titles filed under `Full-Stack Programming`.
- RSS docs invite feed use with attribution. JSON API terms prohibit storing “API” data and require a partner token for JSON. That is an unresolved owner/legal gate, not permission. WWR is not unconditionally approved while that gate is open.
- Promoting `remoteok` without the same conservative rules would be invalid. With those rules it remains software-dense (48/100) and contributes **0** sampled software jobs with explicit Brazil/LATAM/worldwide evidence. Remote status is not Brazil eligibility.
- Corrected trio math: `himalayas` + `jobicy` + `weworkremotely` union software **45**, software-eligible **12**; `himalayas` + `jobicy` + `remoteok` union software **87**, software-eligible **7**. Eligibility still favors WWR, but the margin no longer outweighs feed-category contamination, a ~26-day median age, and the storage gate. CROSS-002 therefore does not name a final third primary.

Arbeitnow remains unfit: 0/100 sampled jobs had explicit Brazil/LATAM/worldwide evidence, and 0/100 were remote software.

---

## 2. Primary mapping

```text
BACK-004 -> himalayas
BACK-005 -> jobicy
BACK-006 -> remoteok
```

Mapping order: richest paginated JSON contract first (`himalayas`), then a second JSON source with Brazil/LATAM filters (`jobicy`), then the ranked approved backup (`remoteok`). CROSS-002 left BACK-006 unbound because We Work Remotely stayed `PENDING_OWNER` (RSS-storage legal gate). BACK-006 bound `remoteok` from that approved-backup evidence after `STATUS.md` marked CROSS-002 `DONE` and BACK-006 `READY`. `weworkremotely` is not implemented.

---

## 3. Research method

### Retrieval

- Date/time: 2026-08-15, approximately 23:20–23:27 UTC (all candidates except the WWR reclassification below).
- WWR programming RSS re-retrieved: 2026-08-16T22:54:56Z, HTTP 200, `n=25`.
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; CROSS-002 source feasibility research)`
- Public GET only. No accounts, API keys, or HTML listing scrapes.
- First-party documentation and terms pages were fetched on 2026-08-15. Jobicy HTML docs returned HTTP 403 to this User-Agent; the JSON API and GitHub README succeeded, and the HTML docs page was also retrieved successfully via a separate browser-class fetch.

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
| We Work Remotely | 25 | Programming category RSS, re-retrieved 2026-08-16T22:54:56Z. All-jobs RSS (2026-08-15) contained 100 items and was not mixed into density math. |
| Greenhouse | 578 | Single public board (`stripe`) to prove schema, not catalog coverage. |
| Adzuna | none | Live jobs calls require `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`. No account was created. |

### Software classification

A job counted as software-development when the **role title** showed product/platform software, data, or similar engineering work. When the title was ambiguous, the description was read. Source category, industry, or tags may support classification and must **not** override a clearly non-software title such as marketing, legal, operations, underwriting, creative, communications, general program-management, country-director, pre-sales/partner solutions, customer professional-services architect, or internal enterprise-IT architect.

Himalayas, Jobicy, Remote OK, Remotive, and Arbeitnow samples from 2026-08-15 already used title/category evidence other than “feed membership” and were not re-sampled. We Work Remotely is no longer treated as software by programming-feed membership.

### Geographic eligibility

Explicit evidence only:

- Himalayas: empty `locationRestrictions` counted as worldwide (documented API behavior). Named countries counted as Brazil/LATAM only when Brazil/Brasil or a LATAM country/region appeared.
- Remotive: `candidate_required_location` text. `Worldwide` counted. `Americas` and `USA` did **not** count as Brazil-eligible.
- Jobicy: `jobGeo` tokens (`Anywhere`, `Brazil`, `LATAM`, and related country names).
- Arbeitnow: `location` + tags. `remote=true` did **not** count.
- Remote OK: `location` + tags.
- We Work Remotely: RSS `region` is the primary signal (`Anywhere in the World` in this sample). A title or description that clearly restricts geography (for example `Remote in Europe`, `Based in Bangalore`, `Country Director, India`) **vetoes** worldwide/Brazil eligibility even when `region` is worldwide. Headquarters strings alone do not imply eligibility.

A generic remote flag never implied Brazil eligibility.

### Historical correction (CROSS-002 independent review)

The 2026-08-15 register treated the WWR programming RSS as software by feed membership. Obsolete figures that must not be used as current evidence: 100% software; Software 25; software density 1.00; WWR utility 0.805; union software 61 / software-eligible 32 for `himalayas` + `jobicy` + `weworkremotely`; claim that that trio wins selection.

Corrected WWR window (2026-08-16T22:54:56Z, `n=25`): software 6 (0.24); software Brazil/worldwide-eligible 5; utility 0.614. See §4.3, §6, §8, and §9.

The same 2026-08-15 text also reported union job counts such as 208 for `himalayas` + `jobicy` + `weworkremotely` while pairwise job matches were 0 and sample sizes were 100 + 100 + 25. Union job counts below are recomputed as `n1+n2+n3` when pairwise URL/tuple matches are 0. Unique-company columns for non-WWR trios are unchanged from 2026-08-15; WWR unique companies in the 2026-08-16 sample are 7.

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
- We Work Remotely JSON API requires a partner token; RSS is the unauthenticated method. API terms also prohibit “saving or storing” API data. RSS vs API-terms storage is an owner/legal gate, not permission.
- WWR programming-feed membership is not software evidence. Title/description classification is conservative and will miss some roles and include some adjacent data/AI work.
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

V1 ingestion uses search (`country=Brazil` with `exclude_worldwide=true`, and `worldwide=true`), not a 101k unfiltered crawl. BACK-004 implements those two windows only; additional LATAM-country search windows are out of scope.

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
- Closure: none in schema. Absence from a later latest-100 window is a last-seen signal only and is **not** authoritative closure. See §10.
- Stable ID: integer `id` (also `jobSlug`).
- Original URL: `url` (Jobicy canonical).
- Implemented ingest (BACK-005): three disjoint latest-100 pulls, `count` default 100, stop after `jobicy_max_windows` (default **3**). Window slugs pinned from the 2026-08-16 taxonomy (`geoSlug`/`industrySlug`): `geo=brazil`, `geo=latam`, `industry=engineering` (`engineering` is Software Engineering; deprecated `dev` is not used). Taxonomies are not fetched on every ingest. Defensive integer `id` dedup across windows. Absence from these windows is not closure.

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

### 4.3 We Work Remotely (`weworkremotely`) — `PENDING_OWNER`

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
| Retrieval | 2026-08-15 (docs/terms); programming RSS re-retrieved 2026-08-16T22:54:56Z |

#### Access

- Method for V1 if accepted: **official public RSS**. RSS docs: “Anyone can use the feed, all we ask is that you attribute the links back to We Work Remotely.”
- JSON `/api` requires a partnership token. Not used.
- Credential name: `none` for RSS.
- API terms (JSON API page): applications must route applying through weworkremotely.com; do not compete with/replace WWR; **“API Only”** clause says the only data you may use is that exposed via the API and that scraping/copying/saving/storing is prohibited.
- Unresolved gate: RSS page invites filling a job feed; API terms prohibit storing “API” data and the JSON API is partner-gated. That is not permission. Owner must confirm whether storing attributed RSS items in a personal catalog, with apply links kept on weworkremotely.com, is accepted. This register does not treat WWR as approved while that gate is open.

#### Retrieval

- Finite RSS windows: programming feed **25** items (2026-08-16); all-jobs feed **100** items (2026-08-15). No pagination.
- Recurring ingestion is bounded by feed length, not by a page API.
- Closure: no expiry field. Drop-from-feed is a last-seen signal only. The 25-item window is not a complete active catalog.
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
| location eligibility | PRESENT | `region` (sample: `Anywhere in the World`; title/description may veto) |
| salary | PARTIAL | only if present in HTML description |
| published date | PRESENT | `pubDate` |
| updated date | ABSENT | — |
| expiry/closure | PARTIAL | drop from feed is last-seen only, not authoritative closure |
| employment type | ABSENT | — |
| seniority | ABSENT | — |
| technologies/tags | PARTIAL | `category` (untrustworthy in this sample) |
| stable posting ID | PRESENT | `guid` |
| original URL | PRESENT | `link` |

#### Coverage (programming RSS, n=25, 2026-08-16T22:54:56Z)

Classification rule: title first; description only when the title is ambiguous; RSS `category` must not override a clearly non-software title. Geographic veto when title/description clearly restricts region.

Software (6):

1. Stripe: Fullstack Engineer, Privy
2. Gusto, Inc.: Staff Software Engineer, AI Developer Tools
3. Coinbase: Analytics Engineer, GFCO Analytics (description: data pipelines / analytics engineering)
4. Stripe: Backend Engineer, Core Technology
5. Gusto, Inc.: Business Money Engineering (description: Staff Engineer / professional software development)
6. MapTiler: Location Services Engineer | Maps Platform (Remote in Europe)

Not software (19). Representative false positives demonstrating feed-category contamination (all tagged programming categories):

- Stripe: Head of Self-Serve Paid Media (marketing)
- Stripe: GTM Operations Process Architect (operations)
- Coinbase: Counsel, Commercial (legal)
- Stripe: Credit Risk Analyst, North American Underwriter (underwriting)
- Coinbase: GFCO Program Manager (general program-management)
- Cloudflare: Country Director, India (general management)
- Cloudflare: Principal Partner Solutions Engineer, SAARC (Based in Bangalore) (pre-sales)
- Dropbox: Director, Product Design (design)

Software density: **6 / 25 = 0.24**.

Structured `region` was `Anywhere in the World` on all 25 items. Title/description geographic vetoes: MapTiler `Remote in Europe`; Cloudflare Partner Solutions Engineer `Based in Bangalore`; Cloudflare `Country Director, India`. Eligible-for-Brazil rate for the sample: **22 / 25 = 0.88**. Software and Brazil/worldwide-eligible: **5** (MapTiler vetoed). LATAM/Brazil labels: 0.

- Salary-like text in 15 descriptions (0.60) from the 2026-08-15 reading of the same items.
- Unique companies **7** (0.28) — Stripe, Coinbase, Airtable, Gusto, Dropbox, Cloudflare, MapTiler.
- Posted within 7d: **0**; within 30d: **25**; median age **25.66 days**.

Shallow, older, category-contaminated window. Not treated as a curated software feed.

#### Quality risks

- Programming RSS is not a software-only inventory. Category cannot drive classification or ingest filters without title review.
- Small feed; not a large catalog.
- Median age ~26 days; weak freshness versus Himalayas/Jobicy heads.
- Company/title parsing from a single string.
- JSON API unavailable without partnership.
- Storage-terms ambiguity is unresolved; not permission.
- API terms also say do not build a competing job board. A personal catalog with outbound WWR apply links is a possible RSS use, but is not a legal opinion.
- `region` can contradict title-level location (`Remote in Europe`, Bangalore, India).

#### Harmless verification

- HTTP 200, 2026-08-16T22:54:56Z, programming RSS (`n=25`). All-jobs RSS was HTTP 200 on 2026-08-15.
- Redacted sample (contamination example, not counted as software):

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

Software example from the same feed: `Stripe: Fullstack Engineer, Privy`.

#### Decision

`PENDING_OWNER`, not `APPROVED_PRIMARY`. Not mapped to BACK-006. Official RSS access exists, but (1) programming-feed membership is not software evidence and the sampled density is 0.24, (2) RSS storage versus JSON API “do not store” language is an unresolved legal gate, and (3) the feed is a small, ~26-day-old window. Do not promote `remoteok` in its place without applying the same conservative classification and eligibility rules; Remote OK remains `APPROVED_BACKUP` with 0 sampled software-eligible jobs.

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

`APPROVED_BACKUP`. Do not auto-promote to the third primary. Conservative classification leaves **0** sampled software jobs with explicit Brazil/LATAM/worldwide evidence. Remote status is not Brazil eligibility. Owner may still choose it for BACK-006 after accepting that eligibility gap.

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
| weworkremotely | 25 | 6 | 0.24 | 0 | 0 | 22 | 0.88 | 5 | 0.60 | 7 | 25.66 | 0.57 |
| remoteok | 100 | 48 | 0.48 | 0 | 1 | 1 | 0.02 | 0 | 0.02 | 85 | 3.86 | 0.60 |
| remotive | 16 | 6 | 0.38 | 0 | 0 | 6 | 0.38 | 2 | 0.75 | 12 | 15.76 | 0.73 |
| arbeitnow | 100 | 29 | 0.29 | 0 | 0 | 0 | 0.00 | 0 | 0.00 | 45 | 0.37 | 0.67 |

Additional catalog/filter evidence (not in the table):

- Himalayas search `country=Brazil`: 4,784 jobs; `worldwide=true`: 1,649.
- Jobicy `geo=brazil`: 100 latest Brazil/LATAM-oriented rows; `industry=engineering`: 100 rows, 19 with Brazil/LATAM geo.

Freshness (dated jobs): Himalayas/Jobicy/Arbeitnow heads are <1 day; Remote OK median 3.9 days; Remotive 15.8; WWR programming median 25.66 days (0/25 within 7d).

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

Union after the same URL/tuple collapse used for overlap. Pairwise job matches in the 2026-08-15 windows were 0, so union jobs = `n1+n2+n3`. Union software and union software-eligible are the same sums using each source's classified counts. Unique-company figures for non-WWR trios are unchanged from 2026-08-15; WWR-containing trios subtract one company because the 2026-08-16 WWR sample has 7 unique companies rather than 8.

| Trio | union jobs | union software | union software eligible | unique companies | mean Jaccard |
| --- | ---: | ---: | ---: | ---: | ---: |
| himalayas + jobicy + weworkremotely | 225 | 45 | 12 | 109 | 0 |
| himalayas + remotive + weworkremotely | 141 | 35 | 11 | 64 | 0 |
| himalayas + weworkremotely + remoteok | 225 | 77 | 9 | 134 | 0 |
| jobicy + weworkremotely + remoteok | 225 | 70 | 8 | 149 | 0 |
| himalayas + jobicy + remoteok | 300 | 87 | 7 | 184 | 0 |
| himalayas + remotive + jobicy | 216 | 45 | 9 | 114 | 0 |
| himalayas + jobicy + arbeitnow | 300 | 68 | 7 | 147 | 0 |
| remotive + jobicy + arbeitnow | 216 | 51 | 5 | 114 | 0 |
| himalayas + remotive + arbeitnow | 216 | 58 | 6 | 102 | 0 |
| himalayas + remotive + remoteok | 216 | 77 | 6 | 138 | 0 |

No trio is selected as the accepted V1 set. `himalayas` + `jobicy` + `weworkremotely` still has the highest sampled software-eligible union (**12** vs **7** with Remote OK), but that margin does not overcome WWR feed-category contamination, freshness, or the RSS-storage gate. Remote OK wins raw software union (**87**) and does not move eligibility. Arbeitnow adds volume without eligibility. Remotive adds little union size. The third seat remains an owner/legal decision.

---

## 9. Source utility scores

Component scores in 0–1. Uniqueness is 1.0 everywhere because snapshot Jaccard was 0; it does not differentiate and must not be over-read.

```text
weworkremotely utility =
  0.20 * 0.24
+ 0.25 * 0.88
+ 0.15 * 0.57
+ 0.20 * 1.00
+ 0.10 * 0.00
+ 0.10 * 0.60
= 0.048 + 0.220 + 0.0855 + 0.200 + 0.000 + 0.060
= 0.6135 → 0.614
```

| Source | software dens. | geo eligible | fields | uniqueness | freshness | access | **utility** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| weworkremotely | 0.24 | 0.88 | 0.57 | 1.00 | 0.00 | 0.60 | **0.614** |
| himalayas | 0.23 | 0.07 | 0.87 | 1.00 | 1.00 | 0.95 | **0.589** |
| remoteok | 0.48 | 0.02 | 0.60 | 1.00 | 1.00 | 0.65 | **0.556** |
| jobicy | 0.16 | 0.07 | 0.77 | 1.00 | 1.00 | 0.80 | **0.545** |
| remotive | 0.38 | 0.38 | 0.73 | 1.00 | 0.13 | 0.45 | **0.536** |
| arbeitnow | 0.29 | 0.00 | 0.67 | 1.00 | 1.00 | 0.75 | **0.533** |

Access judgments: Himalayas 0.95 (OpenAPI, pagination, 429, 24h cache). Jobicy 0.80 (clear fair use, latest-100 cap, HTML 403). WWR 0.60 (official RSS, small window, untrustworthy programming category, JSON partner + storage-clause tension). Remote OK 0.65 (legal in-feed, no pagination). Arbeitnow 0.75 (paginated, revocable). Remotive 0.45 (schema good, live inventory collapsed).

Jobicy is below Remote OK on this score because unfiltered density/geo in the latest-100 mix is modest. It is still a proposed primary because **filtered** `geo=brazil` / `industry=engineering` access is what V1 will call. The score is support, not a selector, and does not approve WWR.

---

## 10. Per-primary operational notes

Lifecycle ownership: [BACK-002](../work-orders/back/BACK-002-canonical-model-persistence.md) persists `JobStatus` (`active`, `stale`, `closed`, `unknown`) plus first-seen / last-seen / closed timestamps. [BACK-004](../work-orders/back/BACK-004-adapter-contract-source-one.md) extracts last-seen and closure signals through the adapter contract. Source adapters apply the defaults below unless the owner revises them. This register does not implement those Work Orders.

Shared invariant: **absence during a failed or `partial_success` run never stales or closes a posting.** Only consecutive **successful** observations of that source’s bounded retrieval may change status from absence. A posting that is not observed because the run did not complete remains `active`, `stale`, `closed`, or `unknown` as last successfully recorded.

### `himalayas` (BACK-004)

- Credentials: `none`
- Refresh cadence: upstream cached 24h. At most **once per day**. Faster polling is not justified.
- First-seen: first successful persist of `guid`. Last-seen: each successful run that observes that `guid`.
- Authoritative expiry/closure: `expiryDate` in the past → `closed`. Search pages are not a full active set, so a single miss does not close.
- Stale: after **2 consecutive successful** bounded search runs without the `guid`, mark `stale`.
- Closed / expired / unknown: `expiryDate` past → `closed`. No `expiryDate` and still missing after the stale rule → remain `stale`, not `closed`. Latest run failed or partial → no transition (`unknown` only if status was never established).
- Failed/partial ingestion: no stale or closed transition from absence.
- Ingest shape (BACK-004 implemented): bounded **search**, not browse. Two disjoint windows, `page` 1-based, stop at `totalCount` or `himalayas_max_pages_per_window` (default **5**, 20 jobs/page):
  - worldwide: `worldwide=true&sort=recent`
  - Brazil: `country=Brazil&exclude_worldwide=true&sort=recent` so worldwide jobs do not consume the Brazil page budget
  - Defensive `guid` dedup across windows. Absence from search is not closure.
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; personal catalog; himalayas adapter)`
- Attribution: visible “sourced from Himalayas” and keep `applicationLink`.
- Fixtures: sanitized success envelope with three jobs covering empty and non-empty `locationRestrictions` (string and `{name,alpha2,slug}`), salary null vs numbers, future vs past `expiryDate`, unix-ms dates; one malformed job missing `guid`. Strip emails/phones; truncate `description`; keep `guid`/URL/title/company.
- Implemented field map (BACK-004 adapter):

| Canonical input | Source |
| --- | --- |
| `source_id` | `"himalayas"` |
| `source_posting_id` | `guid` (required; missing → reject) |
| `application_url` | `applicationLink` |
| title / company | `title` / `companyName` |
| description | `description` HTML as stored source text |
| location text | joined `locationRestrictions` names; empty → `"Worldwide"` |
| `remote_evidence` | `"remote"` (Remote Jobs API; eligibility stays separate) |
| employment / seniority evidence | `employmentType` string; `seniority` array joined |
| compensation | `minSalary` / `maxSalary` / `currency` / `salaryPeriod` (`annual`→year; weekly/fortnightly not annualized) |
| technologies text | `categories` joined |
| eligibility evidence | empty restrictions → `"worldwide"`; else joined names (strings or `{name,alpha2,slug}`) |
| published_at | `pubDate`: int ms if `> 1e12`, else seconds; or ISO string |
| closed | observed past `expiryDate` → posting `CLOSED` on persist |
| raw metadata | small dict (`guid`, `companySlug`, `expiryDate`, categories); no full description |

### `jobicy` (BACK-005)

- Credentials: `none`
- Refresh cadence: docs say a few times per day, **not more than once per hour**. Recommend **1–2 times per day**.
- First-seen: first successful persist of integer `id`. Last-seen: each successful run that observes that `id` in the configured pulls.
- Authoritative expiry/closure: **none**. The latest-100 window is not a complete catalog. Drop-from-window is last-seen only and must not close a posting.
- Stale: after **3 consecutive successful** ingestions of the configured `geo`/`industry` pulls without `id`, mark `stale`.
- Closed / expired / unknown: do not auto-`closed`. Remain `stale` while last successful runs keep missing the id. If the latest run failed or was partial, leave the prior status unchanged (treat observability as `unknown` for that run, not as absence).
- Failed/partial ingestion: no stale or closed transition from absence.
- Ingest shape (BACK-005 implemented): bounded **latest-100** pulls, not deep pagination. Three disjoint windows, stop at `jobicy_max_windows` (default **3**), `count` default **100**:
  - brazil: `geo=brazil`
  - latam: `geo=latam`
  - engineering: `industry=engineering` (Software Engineering slug from 2026-08-16 `?get=industries`; `dev` is deprecated)
  - Slugs pinned in Settings rather than live taxonomy discovery on each run
  - Defensive integer `id` dedup across windows. Absence from these windows is not closure.
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; personal catalog; jobicy adapter)`
- Attribution: credit Jobicy; application actions must use feed `url`.
- Fixtures: sanitized success envelope with three jobs covering `jobGeo` Brazil / LATAM / Anywhere, salary present vs omitted keys, `jobLevel` Senior vs Any, HTML entity in `jobIndustry`; one malformed job missing `id`. Strip emails/phones; truncate `jobDescription`; keep `id`/URL/title/company.
- Implemented field map (BACK-005 adapter):

| Canonical input | Source |
| --- | --- |
| `source_id` | `"jobicy"` |
| `source_posting_id` | integer `id` stringified (required; missing → reject) |
| `application_url` | `url` |
| title / company | `jobTitle` / `companyName` |
| description | `jobDescription` HTML as stored source text |
| location text | `jobGeo` |
| `remote_evidence` | `"remote"` (Remote Jobs API; eligibility stays separate) |
| employment / seniority evidence | joined `jobType`; `jobLevel` except `"Any"` → omitted (unknown) |
| compensation | optional `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod` (`yearly` left native; omitted keys → unknown) |
| technologies text | HTML-unescaped `jobIndustry` joined (function labels, not a stack) |
| eligibility evidence | native `jobGeo` (`Anywhere` is worldwide evidence; LATAM-without-Brazil stays LATAM) |
| published_at | ISO `pubDate` |
| closed | never from this adapter; no expiry field |
| raw metadata | small dict (`id`, `jobSlug`, `jobIndustry`, `jobGeo`, `jobLevel`); no description / `friendlyNotice` |

### `weworkremotely` (third-seat candidate, not BACK-006)

Apply only if the owner later accepts this source. These defaults are recorded so that handoff is implementable.

- Credentials: `none` (RSS). Do not call partner JSON API.
- Refresh cadence: no documented cadence. Programming feed median age ~26 days; **daily** RSS GET is enough and gentle.
- First-seen: first successful persist of `guid`. Last-seen: each successful programming-feed parse that contains that `guid`.
- Authoritative expiry/closure: **none**. The 25-item feed is not all active jobs. Drop-from-feed is last-seen only, not closure.
- Stale: after **2 consecutive successful** programming-feed fetches without `guid`, mark `stale`.
- Closed / expired / unknown: never auto-`closed` from RSS absence. Remain `stale`. Failed/partial: no transition.
- Failed/partial ingestion: no stale or closed transition from absence.
- Ingest shape: programming RSS. Do not treat `category` as software proof; classify from title (and description when needed). Parse `Company: Role`. Keep `link` as apply URL (do not bypass WWR apply).
- User-Agent: identifying RSS client string as above.
- Attribution: links back to We Work Remotely; do not use WWR marks as product branding.
- Fixtures: one RSS `<item>` with `guid`/`link`/`region`; one malformed item missing `link`. Truncate description HTML. No bulk dump.
- Gate: owner confirms RSS storage for a personal catalog is acceptable despite JSON API “do not store” language. Until then this source is not approved.

### `remoteok` (BACK-006)

- Credentials: `none`
- Refresh cadence: treat as delayed (historically ~24h). At most **once per day**.
- First-seen: first successful persist of stringified `id`. Last-seen: each successful snapshot fetch that contains that `id`.
- Authoritative expiry/closure: **none**. The snapshot is not a full active set. Drop-from-snapshot is last-seen only and must not close a posting.
- Stale: after **3 consecutive successful** snapshot fetches without `id`, mark `stale`.
- Closed / expired / unknown: do not auto-`closed`. Remain `stale` while last successful runs keep missing the id. If the latest run failed or was partial, leave the prior status unchanged.
- Failed/partial ingestion: no stale or closed transition from absence.
- Ingest shape (BACK-006 implemented): bounded **latest-~100 snapshot**, not pagination and not `?tag=` windows. One `GET /api`, stop after that page:
  - Skip the leading legal/metadata object (has `legal` and no job `id`)
  - Remaining array elements are jobs
  - Defensive `id` dedup inside the snapshot. Absence from the snapshot is not closure.
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; personal catalog; remoteok adapter)`
- Attribution: credit Remote OK; application actions must use feed `url` (Remote OK listing).
- Fixtures: sanitized JSON array with a short legal object plus three jobs covering non-zero salary vs `0`/`0` (unknown), noisy city-fragment `location`, and ops-like tags; one malformed job missing `id`. Strip emails/phones; truncate `description`; keep `id`/URL/title/company. Do not copy the live legal blob.
- Implemented field map (BACK-006 adapter):

| Canonical input | Source |
| --- | --- |
| `source_id` | `"remoteok"` |
| `source_posting_id` | `id` stringified (required; missing → reject) |
| `application_url` | `url`; fallback `apply_url` if `url` missing (missing both → reject) |
| title / company | `position` / `company` |
| description | `description` HTML/text as stored source text |
| location text | native `location` (city fragments stay original) |
| `remote_evidence` | `"remote"` (remote board; eligibility stays separate) |
| employment / seniority evidence | omitted (unknown) |
| compensation | `salary_min` / `salary_max`; `0` or omitted → unknown |
| technologies text | `tags` joined |
| eligibility evidence | native `location` (no Brazil/worldwide inference from remote) |
| published_at | `epoch` seconds or ISO `date` |
| closed | never from this adapter; no expiry field |
| raw metadata | small dict (`id`, `slug`, `tags`, `location`); no description / legal blob |

---

## 11. Rejected / post-V1 sources

| ID | Decision | Why not V1 primary now |
| --- | --- | --- |
| `weworkremotely` | `PENDING_OWNER` | Official RSS, but programming-feed membership is not software evidence (6/25 software after title/description review); RSS storage vs JSON API terms is unresolved. Not bound to BACK-006. |
| `remoteok` | backup; BACK-006 | Software-dense (48/100) but 0 sampled software jobs with explicit Brazil/LATAM/worldwide evidence; 100-job snapshot. Bound to BACK-006 as the ranked approved backup after WWR stayed legally gated. |
| `remotive` | backup | Official API; live public inventory is 16 jobs. |
| `arbeitnow` | `REJECTED` | Lawful EU/ATS API; 0 sampled Brazil/worldwide-eligible software jobs. |
| `greenhouse` | `POST_V1` | Per-company boards, not a catalog. |
| `adzuna` | `POST_V1` | Keys required; Brazil/remote behavior untested. |
| LinkedIn / Indeed / YC WaaS / Gupy | `REJECTED` | No lawful personal catalog access. |

---

## 12. Unresolved review gates

1. **Third primary / BACK-006 bind:** BACK-006 bound `remoteok` (ranked `APPROVED_BACKUP`) because `weworkremotely` remains `PENDING_OWNER` on the RSS-storage legal gate. Eligibility gaps stay unknown; WWR is not implemented.
2. **WWR RSS storage:** confirm personal catalog persistence with attribution and WWR apply URLs is allowed, given JSON API terms that forbid storing API data and require partner tokens for JSON. RSS docs are not a legal opinion and are not treated as permission.
3. **Owner acceptance of the two proposed primaries** `himalayas` and `jobicy`.
4. **Himalayas ingest filter set:** confirm V1 should search Brazil + worldwide (and optional LATAM countries) rather than ingest the unfiltered 101k browse feed.
5. **Jobicy HTML 403** to non-browser UAs: docs remain usable via JSON notice + GitHub + browser fetch; re-check if that hardens.
6. **Adzuna / Greenhouse** remain unavailable for V1 without credentials or a board-token program.
7. **Remotive inventory:** re-sample before any promotion; do not assume GitHub README “all active jobs” matches the live 16-row feed.

No gate is silently treated as permission.

---

## 13. Handoff evidence

### Validation commands

```bash
test -f docs/sources/v1-source-register.md
rg -n "APPROVED_PRIMARY|APPROVED_BACKUP|REJECTED|PENDING_OWNER" docs/sources/v1-source-register.md
rg -n "BACK-004|BACK-005|BACK-006" docs/sources/v1-source-register.md
rg -n "100% software|Software 25|0\\.805|software dens.*1\\.00" docs/sources/v1-source-register.md
git diff --check
git status --short
```

### Independent-review remediation (2026-08-16)

WWR programming RSS re-retrieved 2026-08-16T22:54:56Z (HTTP 200, `n=25`). Classification no longer uses feed membership. CROSS-002 status is `REVIEW`, not `DONE`. BACK-004/BACK-005/BACK-006 remain `BLOCKED`.

Exactly two sources are labeled `APPROVED_PRIMARY` (`himalayas`, `jobicy`). `weworkremotely` is `PENDING_OWNER`. Two sources are `APPROVED_BACKUP`. BACK-006 is unbound.

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
| WWR | https://weworkremotely.com/categories/remote-programming-jobs.rss | feed | 200 (also 2026-08-16T22:54:56Z) |
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

Please review the two proposed primaries, the unbound third seat, and the WWR storage gate. CROSS-002 is implemented and in `REVIEW`.

```text
Status: PENDING_OWNER
```

Do not mark CROSS-002 `DONE` until the owner accepts a three-source set (or explicitly accepts two primaries and a named third-seat decision). Do not bind adapter placeholders in this remediation.
