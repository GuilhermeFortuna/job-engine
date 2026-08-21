# ATS-native source register (Greenhouse and Lever)

**Specification:** [CROSS-015](../development/specs/CROSS-015-ats-native-source-feasibility-spec.md)  
**Plan:** [CROSS-015 plan](../development/plans/CROSS-015-ats-native-source-feasibility-plan.md)  
**Status authority:** [`../development/STATUS.md`](../development/STATUS.md)

**Register revision:** `CROSS-015-REG-2026-08-21.1`  
**Retrieved:** 2026-08-21T11:19:19Z  
**Owner-review status:** `APPROVED`

This register is the CROSS-015 feasibility record and the data/configuration
authority for [BACK-016](../development/specs/BACK-016-executable-application-targets-spec.md).
It does not implement adapters, persist a job corpus, or authorize application
submission.

This set is not a global Greenhouse or Lever catalog. Percent coverage over an
unbounded provider population is not claimed.

---

## 1. Decision summary

First-implementation approved sources: **4 Greenhouse boards** and **4 Lever
global sites**. Each approved row produced a public JSON GET (HTTP 200) with at
least one open job and a direct provider-hosted application URL on an allowlisted
host.

| Rank | Source ID | Provider | Token / site | Region | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | `greenhouse:khanacademy` | Greenhouse | `khanacademy` | n/a (Job Board API) | `APPROVED` |
| 2 | `greenhouse:thenewyorktimes` | Greenhouse | `thenewyorktimes` | n/a | `APPROVED` |
| 3 | `greenhouse:nationalpublicradioinc` | Greenhouse | `nationalpublicradioinc` | n/a | `APPROVED` |
| 4 | `greenhouse:wikimedia` | Greenhouse | `wikimedia` | n/a | `APPROVED` |
| 5 | `lever:ro` | Lever | `ro` | `global` | `APPROVED` |
| 6 | `lever:lucasmuseum` | Lever | `lucasmuseum` | `global` | `APPROVED` |
| 7 | `lever:coloradocoalition` | Lever | `coloradocoalition` | `global` | `APPROVED` |
| 8 | `lever:Osmind` | Lever | `Osmind` | `global` | `APPROVED` |

Rejected (must not be ingested by BACK-016):

| Source ID | Decision | Reason |
| --- | --- | --- |
| `greenhouse:stripe` | `REJECTED` | `redirect_only`: Job Board `absolute_url` is `stripe.com`, not a Greenhouse hosted form |
| `lever:lever` | `REJECTED` | `dead_or_private`: public Postings API returned `[]` |
| `lever:prosus` | `REJECTED` | `region_mismatch`: live EU instance (`api.eu.lever.co` / `jobs.eu.lever.co`); production desktop Lever adapter is unbound for `jobs.eu.lever.co` |

Live direct targets probed but **not frozen** in this revision (data review later;
not adapter redesign):

| Source ID | Classification | Why omitted from first freeze |
| --- | --- | --- |
| `greenhouse:gitlab` | `direct_target` | Large software-dense board; software coverage already present via NYT/NPR/Osmind |
| `greenhouse:verkada` | `direct_target` | Large sales-heavy board; first freeze keeps four mixed-family boards |
| `greenhouse:tenableinc` | `direct_target` | Same; sales/marketing-heavy |
| `greenhouse:public` | `direct_target` | Only two published Product Manager roles |
| `lever:seattleartmuseum` | `direct_target` | Museum family already represented by `lucasmuseum` |
| `lever:nimblerx` | `direct_target` | Healthtech software already represented by `Osmind`; pharmacy ops by `ro` |

Provider distribution of the frozen set: Greenhouse 4 / Lever 4. Job-family
distribution of approved samples (title/description, not provider category
alone): education and district operations; journalism/newsroom and legal;
nonprofit translation and fundraising; pharmacy and fulfillment; museum visitor
services; behavioral-health and case management; healthcare operations and
software engineering.

---

## 2. Research method

### Candidate selection

Tokens and site names were taken from **public hosted careers URLs**, not guessed
from company names. The path segment after the provider host is the identifier.

| Employer | Public hosted careers URL | Identifier | How obtained |
| --- | --- | --- | --- |
| Khan Academy | https://job-boards.greenhouse.io/khanacademy | `khanacademy` | Hosted board URL path |
| The New York Times | https://job-boards.greenhouse.io/thenewyorktimes | `thenewyorktimes` | Hosted board URL path |
| NPR | https://job-boards.greenhouse.io/nationalpublicradioinc | `nationalpublicradioinc` | Hosted job URL path; board root uses the same token |
| Wikimedia Foundation | https://job-boards.greenhouse.io/wikimedia | `wikimedia` | Hosted job URL path; board root uses the same token |
| GitLab | https://job-boards.greenhouse.io/gitlab | `gitlab` | Hosted board URL path |
| Verkada | https://boards.greenhouse.io/verkada | `verkada` | Hosted board URL path (job `absolute_url` values used `job-boards.greenhouse.io`) |
| Tenable | https://boards.greenhouse.io/tenableinc | `tenableinc` | Hosted board URL path |
| Public.com | https://boards.greenhouse.io/public | `public` | Hosted board URL path |
| Stripe | https://boards.greenhouse.io/stripe | `stripe` | Hosted board URL previously recorded in [`v1-source-register.md`](v1-source-register.md) and re-probed |
| Ro | https://jobs.lever.co/ro | `ro` | Hosted job site URL path |
| Lucas Museum of Narrative Art | https://jobs.lever.co/lucasmuseum | `lucasmuseum` | Hosted job URL path |
| Seattle Art Museum | https://jobs.lever.co/seattleartmuseum | `seattleartmuseum` | Hosted job URL path |
| Colorado Coalition for the Homeless | https://jobs.lever.co/coloradocoalition | `coloradocoalition` | Hosted job URL path |
| NimbleRx | https://jobs.lever.co/nimblerx | `nimblerx` | Hosted job URL path |
| Osmind | https://jobs.lever.co/Osmind | `Osmind` | Hosted site URL recorded in [`platform-register.md`](../automation/platform-register.md) and re-probed; **case-sensitive** |
| Lever (Employ Inc.) | https://jobs.lever.co/lever | `lever` | Hosted site URL cited in Lever Postings API docs |
| Prosus | https://jobs.eu.lever.co/prosus | `prosus` | Hosted EU job URL path; region taken from `jobs.eu.lever.co` |

Nine Greenhouse and eight Lever candidates were probed (minimum six each). More
than one job family appears in the candidate table and in the approved freeze.

### Retrieval

- Date/time: 2026-08-21T11:19:19Z
- User-Agent: `JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; CROSS-015 ATS-native source feasibility)`
- Public GET/HEAD only. No accounts, API keys, Harvest credentials, or application POST.
- Concurrency: sequential, ≥0.8s between board probes.
- Retry: one retry on timeout or HTTP 5xx only.
- Samples stored in-repo are job metadata only: IDs, titles, locations/categories,
  hosted URLs, timestamps, and truncated description excerpts. Emails/phones
  redacted. HTML application forms were fetched only to confirm markers; bodies
  were not committed.

### Classification

Each candidate was classified from API record through hosted URL:

| Class | Meaning |
| --- | --- |
| `direct_target` | Final HTTPS URL is a first-party Greenhouse or Lever hosted application surface on an allowlisted host/path |
| `redirect_only` | API URL or redirect lands on an employer careers site or other non-provider host |
| `dead_or_private` | Missing/empty published set, non-2xx JSON, or hosted GET ≥400 |
| `region_mismatch` | Live Lever EU instance; first implementation must not treat it as global `jobs.lever.co` |
| `other` | Concrete mismatch that is none of the above |

Greenhouse allowlisted application hosts (desktop adapter + this register):
`boards.greenhouse.io`, `job-boards.greenhouse.io`, `boards.eu.greenhouse.io`,
path `/{board_token}/jobs/{numeric_id}`.

Lever allowlisted application host for this freeze: `jobs.lever.co`, path
`/{site}/{posting_id}/apply`. `jobs.eu.lever.co` is first-party and **unbound**.

### Software vs non-software

Classification used **title first**, then a short description excerpt when the
title was ambiguous. Provider department/team labels were recorded and **must
not** override a clearly non-software title (editor, counsel, pharmacist,
visitor-services, case manager, translator, district coordinator). An
`Engineer` title is not assumed to be software work without title/description
support (for example IT network vs software engineering).

---

## 3. Provider contract summary

Citations retrieved 2026-08-21. The live Greenhouse Job Board HTML docs URL
named in the Specification now redirects to a Greenhouse Recruiting sign-in
page; the contract below is taken from Greenhouse's published documentation
source and public support overview, then confirmed against live JSON.

### 3.1 Greenhouse Job Board API

| Topic | Record |
| --- | --- |
| Docs (specified URL) | https://developer.greenhouse.io/job-board.html and https://developers.greenhouse.io/job-board.html — **HTTP 200 sign-in HTML**, not the API contract, on 2026-08-21 |
| Docs (contract source) | [grnhse/greenhouse-api-docs `source/includes/job-board/_jobs.md`](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) (raw retrieved 2026-08-21, sha256 `ce0e1e0d35a1a2f1338979573f765bf0113d1fdca02c515f2a0d5066b60af13c`) |
| Support overview | [Greenhouse API overview](https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview) — Job Board API exports public posts; `POST` Submit application requires a Job Board API key |
| Applications POST | [same repo `_applications.md`](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_applications.md) — authenticated multipart POST; **Job Engine must not call it** |
| Legal | [Greenhouse Legal](https://www.greenhouse.com/legal), [Privacy policy](https://www.greenhouse.com/privacy-policy) — customer/processor terms and candidate privacy; they do not grant unattended application automation (`LEGAL-GATE-ATS-001` remains open) |
| Access | Unauthenticated GET of one employer's published board. Harvest API is authenticated and out of scope |
| Base URL | `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` |
| Content | `?content=true` includes HTML `content`, `departments`, and `offices` |
| Pagination | List contract returns the published job-post set. This probe observed `meta.total` and the full `jobs` array in one body; no `Link` pagination header. BACK-016 must still tolerate a future `Link: rel="next"` if a large board starts paging |
| Stable IDs | Numeric job-post `id` (use for application targeting per docs). `internal_job_id` identifies the job, not the post |
| Hosted URL field | `absolute_url` — **must be allowlisted** after redirects; do not assume Greenhouse hosting |
| Location / category | `location.name`; with `content=true`, `departments[].name` and `offices[]` |
| Rate / robots | `https://boards-api.greenhouse.io/robots.txt`: `User-agent: *` / `Disallow: /embed/` only. No published Job Board GET rate limit; poll at most daily |

### 3.2 Lever Postings API

| Topic | Record |
| --- | --- |
| Docs | [lever/postings-api README](https://github.com/lever/postings-api) (raw retrieved 2026-08-21, sha256 `504ed95b1dc39c5a4c0865d05805a6cdff57a973bdb6d7c3fe376ff177b15764`) |
| Legal | [Lever Terms of Service](https://www.lever.co/legal/terms-of-service); privacy now redirects to [Employ Inc. privacy](https://www.employinc.com/privacy/) — customer terms, not candidate-automation permission |
| Access | Unauthenticated GET of published postings for one site. Internal postings are hidden. POST apply requires a customer API key and is rate-limited; **Job Engine must not call it** |
| Bases | Global `https://api.lever.co/v0/postings/{site}`; EU `https://api.eu.lever.co/v0/postings/{site}` |
| Hosted sites | Global `https://jobs.lever.co/{site}`; EU `https://jobs.eu.lever.co/{site}` |
| JSON mode | `Accept: application/json` or `?mode=json` (query param wins) |
| Pagination | Documented `skip` and `limit`. Confirmed 2026-08-21: `limit=1` and `skip=1&limit=1` returned distinct `ro` postings |
| Stable IDs | UUID `id` |
| Hosted URL fields | `hostedUrl` (posting) and `applyUrl` (`…/apply`). Desktop execution requires the `/apply` URL on `jobs.lever.co` |
| Location / category | `categories.{location,commitment,team,department,allLocations}`, `country`, `workplaceType` |
| Content | `description` / `descriptionPlain`, `opening` / `openingPlain`, `lists`, `additional` |
| Rate / robots | `https://api.lever.co/robots.txt` and `https://api.eu.lever.co/robots.txt`: `Allow: /` + `Crawl-delay: 1`. `https://jobs.lever.co/robots.txt`: `Allow: /`, `Crawl-delay: 1`, Cloudflare Content-Signal `search=yes,ai-train=no,use=reference`. Honor crawl-delay; do not use listings for AI training |

Docs explicitly note that published postings “may be scraped by third parties.”
That is a description of public visibility, not a license to ignore robots,
ToS, or the application-POST prohibition.

---

## 4. Approved rows

All approved probes: HTTP 200 JSON, ≥1 open job, direct hosted form GET HTTP 200
with form markers, no application POST.

### 4.1 `greenhouse:khanacademy` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | Khan Academy |
| Board token | `khanacademy` |
| API | `GET https://boards-api.greenhouse.io/v1/boards/khanacademy/jobs?content=true` |
| Hosted board | https://job-boards.greenhouse.io/khanacademy |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | `meta.total` **27** |
| Fields | `id`, `title`, `location.name`, `departments`, `offices`, `content`, `absolute_url`, `updated_at` present on sampled jobs |
| Pagination / rate | Single-list response; no `Link` header |
| Terms / robots | Job Board GET; `/embed/` disallowed; no POST |
| Application evidence | `https://job-boards.greenhouse.io/khanacademy/jobs/7957057` HTTP 200, Greenhouse form action + “Apply for this job” |
| Non-software check | **District Coordinator** (India field operations); **English Chemistry Video Content Creator** (education content). Not software |

### 4.2 `greenhouse:thenewyorktimes` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | The New York Times |
| Board token | `thenewyorktimes` |
| API | `GET https://boards-api.greenhouse.io/v1/boards/thenewyorktimes/jobs?content=true` |
| Hosted board | https://job-boards.greenhouse.io/thenewyorktimes |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | `meta.total` **174** |
| Application evidence | `https://job-boards.greenhouse.io/thenewyorktimes/jobs/4720540005` HTTP 200, Greenhouse form markers |
| Non-software check | **Assistant Editor, Fine Arts**; **Assistant Fashion Editor**. Software also present: **Associate Android Engineer** |

### 4.3 `greenhouse:nationalpublicradioinc` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | NPR |
| Board token | `nationalpublicradioinc` |
| API | `GET https://boards-api.greenhouse.io/v1/boards/nationalpublicradioinc/jobs?content=true` |
| Hosted board | https://job-boards.greenhouse.io/nationalpublicradioinc |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | `meta.total` **14** |
| Application evidence | `https://job-boards.greenhouse.io/nationalpublicradioinc/jobs/4692729005` HTTP 200 |
| Non-software check | **Assistant General Counsel, Nonprofit Tax & Governance Practice**; **Deputy Managing Editor, Evenings**. Software also present: **DevOps Engineer** |

### 4.4 `greenhouse:wikimedia` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | Wikimedia Foundation |
| Board token | `wikimedia` |
| API | `GET https://boards-api.greenhouse.io/v1/boards/wikimedia/jobs?content=true` |
| Hosted board | https://job-boards.greenhouse.io/wikimedia |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | `meta.total` **18** |
| Application evidence | `https://job-boards.greenhouse.io/wikimedia/jobs/8105376` HTTP 200 |
| Non-software check | **Italian Translator / Linguist (Contract)**; **Fundraising Support Specialist (Contract)**; **Head of Marketing**. Department labels must not reclassify these as software |

### 4.5 `lever:ro` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | Ro |
| Site | `ro` |
| Region / API base | `global` / `https://api.lever.co/v0/postings/ro` |
| Hosted site | https://jobs.lever.co/ro |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | ≥12 published postings in `limit=20` window (pharmacy, fulfillment, engineering also listed on the hosted site) |
| Fields | `id`, `text`, `categories`, `country`, `workplaceType`, `descriptionPlain`, `hostedUrl`, `applyUrl` |
| Pagination / rate | `skip`/`limit` confirmed; honor `Crawl-delay: 1` |
| Application evidence | `https://jobs.lever.co/ro/f25a6c49-5ed4-4aa0-a5bb-b30e9790f90c/apply` HTTP 200, `#application-form` / submit copy |
| Non-software check | **Compounding Pharmacy Technician**; **Fulfillment Associate**. Team `Pharmacy` / `Operations` matches titles |

### 4.6 `lever:lucasmuseum` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | Lucas Museum of Narrative Art |
| Site | `lucasmuseum` |
| Region / API base | `global` / `https://api.lever.co/v0/postings/lucasmuseum` |
| Hosted site | https://jobs.lever.co/lucasmuseum |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | 7 postings in the JSON list |
| Application evidence | `https://jobs.lever.co/lucasmuseum/764b899e-9c86-4651-af65-9493bc118a9b/apply` HTTP 200 |
| Non-software check | **Visitor Services Associate**; **E-Commerce Merchandiser**. No software titles in the sampled 7 |

### 4.7 `lever:coloradocoalition` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | Colorado Coalition for the Homeless |
| Site | `coloradocoalition` |
| Region / API base | `global` / `https://api.lever.co/v0/postings/coloradocoalition` |
| Hosted site | https://jobs.lever.co/coloradocoalition |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | ≥12 published postings in `limit=20` window |
| Application evidence | `https://jobs.lever.co/coloradocoalition/d16e5617-e87e-49ce-8093-3a8997c0a936/apply` HTTP 200 |
| Non-software check | **Behavioral Health Clinician I**; **Case Manager - Riverfront Lofts**. Clinical/social-services work, not software |

### 4.8 `lever:Osmind` — `APPROVED`

| Field | Value |
| --- | --- |
| Employer | Osmind |
| Site | `Osmind` (preserve capital `O`) |
| Region / API base | `global` / `https://api.lever.co/v0/postings/Osmind` |
| Hosted site | https://jobs.lever.co/Osmind |
| Sample retrieval | 2026-08-21T11:19:19Z |
| Inventory | 6 postings in the JSON list |
| Application evidence | `https://jobs.lever.co/Osmind/c2db6fec-bf06-48c0-acc9-77a08fce5745/apply` HTTP 200 |
| Mix | **Credentialing Coordinator** (healthcare operations) and **Senior Software Engineer, Mexico** / **US**. Same board, two families |

---

## 5. Rejected and not-selected rows

### 5.1 `greenhouse:stripe` — `REJECTED` (`redirect_only`)

Job Board API HTTP 200, `meta.total` **570**. Sample `absolute_url` values are
`https://stripe.com/jobs/search?gh_jid=…`. Following GET landed on
`https://stripe.com/careers/listing/…` with **no** Greenhouse form markers.
A live Stripe board exists; it is not a Greenhouse hosted application target.

### 5.2 `lever:lever` — `REJECTED` (`dead_or_private`)

`GET https://api.lever.co/v0/postings/lever?mode=json` HTTP 200 JSON `[]`. Hosted
site states no job postings are currently open. Identifier is documented, not
invented.

### 5.3 `lever:prosus` — `REJECTED` (`region_mismatch`)

`GET https://api.eu.lever.co/v0/postings/prosus?mode=json` HTTP 200 with open
jobs. `applyUrl` hosts are `jobs.eu.lever.co`. Form GET HTTP 200 with Lever
application markers. Region is explicit EU. The production desktop adapter
binds only `jobs.lever.co`. Do not ingest this site as a global Lever source
and do not guess a global token.

### 5.4 Not selected (live `direct_target`, omitted from freeze)

All of the following returned HTTP 200 JSON, open jobs, and Greenhouse/Lever
hosted forms. They are recorded so BACK-016 cannot treat omission as “unknown”
or “failed probe.” Adding any of them later is a register revision.

| ID | Inventory (this probe) | Sample hosted form |
| --- | --- | --- |
| `greenhouse:gitlab` | 206 | https://job-boards.greenhouse.io/gitlab/jobs/8503792002 |
| `greenhouse:verkada` | 279 | https://job-boards.greenhouse.io/verkada/jobs/4087134007 |
| `greenhouse:tenableinc` | 42 | https://job-boards.greenhouse.io/tenableinc/jobs/5386209008 |
| `greenhouse:public` | 2 | https://job-boards.greenhouse.io/public/jobs/7802674003 |
| `lever:seattleartmuseum` | 3 | https://jobs.lever.co/seattleartmuseum/6213dc23-5894-437a-868c-e21da806c40e/apply |
| `lever:nimblerx` | 9 | https://jobs.lever.co/nimblerx/18c716ce-f513-4a5a-b89a-5eef5badd8cd/apply |

---

## 6. Refresh policy

For BACK-016 adapters using this revision:

- **Credentials:** none for discovery GET.
- **Cadence:** at most **once per calendar day** per board/site. Faster polling
  is not justified by these contracts.
- **Greenhouse:** `GET /v1/boards/{board_token}/jobs?content=true`. Treat the
  returned `jobs` array as the published set for that board. Follow a `Link`
  `rel="next"` header if present. Missing `id` or non-allowlisted `absolute_url`
  (after redirects) → reject that posting, do not invent a Greenhouse URL.
- **Lever:** `GET {region_base}/v0/postings/{site}?mode=json` with bounded
  `skip`/`limit` (recommend `limit=50`, stop when a page is short). Honor
  `Crawl-delay: 1`. Record `global` vs `eu` from the configured base, never
  infer from job location text. Use `applyUrl` as the application target; the
  posting URL without `/apply` is not an executable Lever surface.
- **User-Agent:** identifying client string equivalent to the research UA,
  including the GitHub repo URL.
- **Forbidden:** Job Board / Postings application POST; Harvest; guessing
  tokens; following `absolute_url` onto employer sites and still labeling the
  target `greenhouse`/`lever`.
- **Closure:** absence from a later successful board/site fetch is last-seen
  only unless a native deadline field is present (`application_deadline` on
  some Greenhouse job-detail payloads). Do not close from a failed run.

---

## 7. Fixture provenance

Sanitized metadata fixtures for the eight approved sources live under
[`fixtures/cross-015/`](fixtures/cross-015/). Each file is JSON with register
revision, retrieval timestamp, provider identifiers, and two job objects
(IDs, titles, location/category, hosted URLs, truncated excerpts). No applicant
data, no form HTML dumps, no credentials.

**Revision:** `CROSS-015-REG-2026-08-21.1`

Checksums (`sha256sum` of the committed file bytes, including trailing newline):

```text
40992e2110c54abc5fd0c465a22b61655038d45da9f9ec71b12039d95a7141ea  greenhouse-khanacademy.json
8f6a397ad1deda0146a034e3ad3003e73b08fa1fb5b9984051c27d05bcc3ef2a  greenhouse-thenewyorktimes.json
a37f4b6d44a6ec288050cc40ae76613f4f401989055f6c0dd3765ac5f2d65452  greenhouse-nationalpublicradioinc.json
54b9eda01acb8a8dd29a82019d9f0f81c9edfb6cb44ddd3004c90f6859b2cbc1  greenhouse-wikimedia.json
b49746e4ada8f0c38a7fa38740d7947afe72d8e3d66e674a8b9a42de9172b70e  lever-ro.json
3bb153033aba4afb9aaa1eb9db0b5a536219279c74bff8504d5377a6621638b3  lever-lucasmuseum.json
c814424c25cb255a511152fb18ac126bf29ad340377ea22220ea449f01206885  lever-coloradocoalition.json
9a40ef5c1553848feeba191f66c87259f93ab8aa269b62c8329b6749a4ae0882  lever-Osmind.json
```

Canonical copy: [`fixtures/cross-015/SHA256SUMS`](fixtures/cross-015/SHA256SUMS).

---

## 8. BACK-016 configuration payload

BACK-016 must fail startup/config validation if an entry is missing `provider`,
token/site, region (Lever), API base, or host allowlist, or if a token/site is
not in this revision's `approved` list.

```json
{
  "register_revision": "CROSS-015-REG-2026-08-21.1",
  "owner_approved": true,
  "discovery": {
    "user_agent": "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; personal catalog; ats-native)",
    "max_polls_per_source_per_day": 1,
    "application_post_allowed": false
  },
  "greenhouse": {
    "api_base": "https://boards-api.greenhouse.io",
    "list_path": "/v1/boards/{board_token}/jobs",
    "query": { "content": "true" },
    "auth": "none",
    "allowed_application_hosts": [
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "boards.eu.greenhouse.io"
    ],
    "job_path_pattern": "/{board_token}/jobs/{numeric_id}",
    "approved_boards": [
      {
        "id": "greenhouse:khanacademy",
        "employer": "Khan Academy",
        "board_token": "khanacademy",
        "hosted_board_url": "https://job-boards.greenhouse.io/khanacademy"
      },
      {
        "id": "greenhouse:thenewyorktimes",
        "employer": "The New York Times",
        "board_token": "thenewyorktimes",
        "hosted_board_url": "https://job-boards.greenhouse.io/thenewyorktimes"
      },
      {
        "id": "greenhouse:nationalpublicradioinc",
        "employer": "NPR",
        "board_token": "nationalpublicradioinc",
        "hosted_board_url": "https://job-boards.greenhouse.io/nationalpublicradioinc"
      },
      {
        "id": "greenhouse:wikimedia",
        "employer": "Wikimedia Foundation",
        "board_token": "wikimedia",
        "hosted_board_url": "https://job-boards.greenhouse.io/wikimedia"
      }
    ]
  },
  "lever": {
    "auth": "none",
    "list_path": "/v0/postings/{site}",
    "query": { "mode": "json" },
    "pagination": { "skip": true, "limit": 50 },
    "crawl_delay_seconds": 1,
    "regions": {
      "global": {
        "api_base": "https://api.lever.co",
        "hosted_host": "jobs.lever.co",
        "apply_path": "/{site}/{posting_id}/apply",
        "desktop_adapter_bound": true
      },
      "eu": {
        "api_base": "https://api.eu.lever.co",
        "hosted_host": "jobs.eu.lever.co",
        "apply_path": "/{site}/{posting_id}/apply",
        "desktop_adapter_bound": false,
        "approved_sites": []
      }
    },
    "approved_sites": [
      {
        "id": "lever:ro",
        "employer": "Ro",
        "site": "ro",
        "region": "global",
        "hosted_site_url": "https://jobs.lever.co/ro"
      },
      {
        "id": "lever:lucasmuseum",
        "employer": "Lucas Museum of Narrative Art",
        "site": "lucasmuseum",
        "region": "global",
        "hosted_site_url": "https://jobs.lever.co/lucasmuseum"
      },
      {
        "id": "lever:coloradocoalition",
        "employer": "Colorado Coalition for the Homeless",
        "site": "coloradocoalition",
        "region": "global",
        "hosted_site_url": "https://jobs.lever.co/coloradocoalition"
      },
      {
        "id": "lever:Osmind",
        "employer": "Osmind",
        "site": "Osmind",
        "region": "global",
        "hosted_site_url": "https://jobs.lever.co/Osmind"
      }
    ]
  },
  "rejected_ids": [
    "greenhouse:stripe",
    "lever:lever",
    "lever:prosus"
  ]
}
```

`owner_approved` records the repository owner's approval of this exact revision
in [`docs/development/STATUS.md`](../development/STATUS.md).

---

## 9. Legal and access caveats

- Discovery uses documented public GET contracts only. Application POST
  endpoints require employer-owned keys and are out of scope.
- Greenhouse HTML developer docs were behind a sign-in wall on the retrieval
  date; the GitHub documentation source and support overview were used and
  cited. Re-check the HTML docs URL if Greenhouse restores anonymous access.
- Provider Terms of Service reviewed here are primarily customer/subscription
  and privacy documents. They do not expressly authorize unattended form
  submission. Keep `LEGAL-GATE-ATS-001` open. This pair did not submit any
  application.
- `jobs.lever.co` Content-Signal forbids `ai-train`. Catalog ingestion for
  personal search is `search`/`use=reference`, not model training.
- CORS on the Lever Postings API is limited to the employer's domains; Job
  Engine must call the API from the local backend, not from a browser on an
  unrelated origin.
- Boards and sites change. A frozen token can later go empty or start
  redirecting `absolute_url` off-platform. Adapters must re-verify hosts.

---

## 10. Reproduction (no credentials)

User-Agent for all commands:

```bash
UA='JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; CROSS-015 ATS-native source feasibility)'
```

Approved Greenhouse lists:

```bash
curl -sS -A "$UA" -o /tmp/gh-khanacademy.json \
  'https://boards-api.greenhouse.io/v1/boards/khanacademy/jobs?content=true'
curl -sS -A "$UA" -o /tmp/gh-thenewyorktimes.json \
  'https://boards-api.greenhouse.io/v1/boards/thenewyorktimes/jobs?content=true'
curl -sS -A "$UA" -o /tmp/gh-npr.json \
  'https://boards-api.greenhouse.io/v1/boards/nationalpublicradioinc/jobs?content=true'
curl -sS -A "$UA" -o /tmp/gh-wikimedia.json \
  'https://boards-api.greenhouse.io/v1/boards/wikimedia/jobs?content=true'
```

Approved Lever lists (global instance; do not omit region):

```bash
curl -sS -A "$UA" -o /tmp/lever-ro.json \
  'https://api.lever.co/v0/postings/ro?mode=json&limit=20'
curl -sS -A "$UA" -o /tmp/lever-lucasmuseum.json \
  'https://api.lever.co/v0/postings/lucasmuseum?mode=json&limit=20'
curl -sS -A "$UA" -o /tmp/lever-coloradocoalition.json \
  'https://api.lever.co/v0/postings/coloradocoalition?mode=json&limit=20'
curl -sS -A "$UA" -o /tmp/lever-Osmind.json \
  'https://api.lever.co/v0/postings/Osmind?mode=json&limit=20'
```

Hosted form checks are GET/HEAD of the `absolute_url` / `applyUrl` values from
those JSON files. Do not POST. Expect 2xx HTML on allowlisted hosts.

Rejected controls:

```bash
curl -sS -A "$UA" 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs' | python3 -c \
  'import json,sys; j=json.load(sys.stdin); print(j["jobs"][0]["absolute_url"])'
curl -sS -A "$UA" 'https://api.lever.co/v0/postings/lever?mode=json'
curl -sS -A "$UA" 'https://api.eu.lever.co/v0/postings/prosus?mode=json&limit=1'
```

Fixture integrity:

```bash
cd docs/sources/fixtures/cross-015 && sha256sum -c SHA256SUMS
```

---

## 11. Owner approval record

CROSS-015 is implemented as documentation and fixtures. The repository owner
approved revision **`CROSS-015-REG-2026-08-21.1`** and marked the pair `DONE` in
the live status authority.

```text
Status: APPROVED
Revision: CROSS-015-REG-2026-08-21.1
Approved: 4 Greenhouse + 4 Lever (global)
Rejected: stripe (redirect_only), lever (empty), prosus (EU unbound)
```
