# BACK-009: Applicant Data Vault and Resume Assets

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005

**Unblocks:** BACK-010, BACK-011, CROSS-006, FRONT-005

**Product spec:** `docs/v2-assisted-apply-spec.md` (bound by CROSS-005)

## Objective

Create the validated, local-only applicant profile, reusable answer bank, and resume-asset catalog used by automated application runs. Import useful structure from the local Markdown resume while keeping the PDF as the upload artifact and preventing personal files from entering Git, public static assets, logs, fixtures, or API responses that do not explicitly require them.

## Owned files

- `/apps/api/src/job_engine/domain/applicant.py` (new)
- `/apps/api/src/job_engine/services/applicant.py` (new)
- `/apps/api/src/job_engine/api/applicant.py` (new)
- `/apps/api/src/job_engine/api/schemas.py` (applicant/profile/resume schemas only)
- `/apps/api/src/job_engine/db/models.py` (applicant/resume/answer entities only)
- `/apps/api/src/job_engine/db/repositories.py` (applicant/resume/answer persistence only)
- `/apps/api/src/job_engine/main.py` (applicant router registration only)
- `/apps/api/src/job_engine/config.py` (local resume-root configuration only)
- `/apps/api/alembic/versions/<revision>_add_applicant_vault.py` (new; replace with the actual revision filename before handoff)
- `/apps/api/tests/domain/test_applicant.py` (new)
- `/apps/api/tests/services/test_applicant.py` (new)
- `/apps/api/tests/api/test_applicant.py` (new)
- `/apps/api/tests/db/test_applicant_repositories.py` (new)
- `/.env.example` (non-secret resume-root setting only)

The personal files under `/docs/resume/` are read-only inputs and are not owned by this order.

## Fixed data contract

### Applicant profile

Represent one local applicant with validated fields for:

- Legal/preferred name, email, phone, city, region, country, timezone
- Portfolio, LinkedIn, GitHub, and other explicitly entered URLs
- Employment history, education, skills, languages, and certifications imported from or reconciled against the Markdown resume
- Notice period, compensation expectation, work location preferences, and travel/relocation preferences
- Work-authorization and sponsorship answers as explicit owner-authored values with jurisdiction, wording, provenance, and last-confirmed timestamp
- Optional demographic/EEO values stored only when the owner explicitly chooses to provide them

Every field carries `source`, `last_confirmed_at`, and an automation policy bound by CROSS-005. Missing values remain unknown; parsing must not fabricate them.

### Resume catalog

Store metadata, not file bytes, for each local resume:

```json
{
  "resume_id": "stable-local-id",
  "label": "General full-stack resume",
  "source_markdown_path": "relative/path.md",
  "upload_pdf_path": "relative/path.pdf",
  "preview_html_path": "relative/path.html",
  "sha256": "lowercase-hex",
  "language": "en",
  "is_default": true
}
```

All paths must resolve beneath the configured local resume root after symlink-aware canonicalization. Reject traversal, missing files, non-regular files, mismatched extensions, PDFs without a readable text layer, and checksum drift until the owner refreshes the manifest.

### Reusable answers

Answer-bank entries contain normalized question intent, exact owner-approved answer, applicable jurisdiction/platform scope, policy category, provenance, last-confirmed timestamp, and optional expiry. Sensitive answers are never inferred from resume text.

## Fixed API contract

- `GET /api/v1/applicant-profile`
- `PUT /api/v1/applicant-profile` with full optimistic version replacement
- `POST /api/v1/applicant-profile/import-resume` to preview Markdown-derived changes without silently overwriting confirmed values
- `GET /api/v1/resumes`
- `POST /api/v1/resumes` to register a file already inside the configured resume root
- `PATCH /api/v1/resumes/{resume_id}` for label/default/checksum refresh
- `DELETE /api/v1/resumes/{resume_id}` to remove metadata only, never the local file
- `GET /api/v1/answer-bank`
- `POST /api/v1/answer-bank`
- `PUT /api/v1/answer-bank/{answer_id}`
- `DELETE /api/v1/answer-bank/{answer_id}`

Profile and answer write responses must not echo secrets, raw file bytes, filesystem absolute paths, or unrelated sensitive fields.

## Procedure

1. Add closed Pydantic/domain models and enums matching the CROSS-005 field-policy matrix.
2. Add normalized PostgreSQL entities for the singleton applicant profile, resume metadata, and reusable answers with optimistic versions and UTC timestamps.
3. Implement a Markdown importer for the current local resume structure. Return a diff/proposal; require explicit API confirmation before overwriting any confirmed field.
4. Implement resume-root confinement, MIME/signature checks, PDF text-layer validation, SHA-256 calculation, and deterministic default selection.
5. Implement the fixed APIs and repository behavior, including unknown/declined distinctions and safe serialization.
6. Add migration, domain, service, API, path-traversal, symlink-escape, checksum-drift, and redaction tests using synthetic fixtures only.
7. Document the non-secret local resume-root environment setting in `.env.example` without adding the user's path or files.

## Required validation

```bash
test -z "$(git ls-files docs/resume | rg -v 'README.md|\.template\.|\.example\.')"
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/domain/test_applicant.py tests/services/test_applicant.py tests/api/test_applicant.py tests/db/test_applicant_repositories.py
git diff --check
```

## Acceptance criteria

- The local Markdown resume can produce a reviewable structured import without invented or silently overwritten values.
- The supplied PDF is registered by metadata and checksum and can later be streamed only through the run-scoped mechanism owned by BACK-010.
- Personal resume files remain ignored, unmodified, untracked, and absent from fixtures/logs/test snapshots.
- Profile, resume, and answer-bank APIs enforce validation, optimistic concurrency, redaction, and explicit unknown/declined states.
- Traversal, symlink escape, checksum drift, missing file, malformed Markdown, unreadable PDF, and duplicate-default cases are covered.
- Migration upgrade and downgrade are verified against a disposable database.

## Forbidden decisions

- Do not commit, copy, rename, edit, or serve any personal artifact under `/docs/resume/` as static content.
- Do not store resume bytes or absolute personal filesystem paths in PostgreSQL.
- Do not infer legal, demographic, compensation, sponsorship, signature, or consent answers from the resume.
- Do not expose a general filesystem-read endpoint.
- Do not implement browser automation, application runs, generated answers, or frontend forms.

## Handoff evidence

- Schema and migration summary
- Synthetic import diff and redaction examples
- Resume-root escape/checksum test evidence
- API contract examples containing no personal values
- Full focused validation transcript

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
