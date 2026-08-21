# BACK-014 implementation plan: Multi-profile local data

**Status:** Draft  
**Specification:** [`../specs/BACK-014-multi-profile-local-data-spec.md`](../specs/BACK-014-multi-profile-local-data-spec.md)

## Current-system context

`ApplicantProfile`, `ResumeAsset`, and `ReusableAnswer` are global tables;
`ApplicationRun` freezes only a profile version. Applicant routes are singular,
resume registration accepts local Markdown/PDF paths, and the React settings
screen exposes technical JSON/path inputs. The existing vault and run history
must be migrated in place.

## Implementation decisions

- Add migration `0007_multi_profile_managed_assets.py`. Extend
  `applicant_profiles` with `display_name`, `avatar_asset_id`, `onboarding_step`,
  `onboarding_completed_at`, `archived_at`, and automation-preference JSON.
- Add non-null `applicant_profile_id` foreign keys to resume assets, reusable
  answers, and application runs after deterministic backfill. Change default
  resume and answer identity uniqueness to be per profile; include profile in
  active/submitted run duplicate indexes.
- Add `installation_state` as a one-row table containing `active_profile_id`, and
  `managed_assets` for profile-owned resume/document/avatar metadata. ResumeAsset
  references a managed asset rather than serializing source/upload/preview paths.
- Managed bytes live at
  `<data_root>/profiles/<profile_uuid>/assets/<asset_uuid>/<safe_filename>`.
  Writes stream to a sibling temporary file, verify size/signature/hash, fsync,
  atomically rename, then commit metadata. Roll back and unlink the bounded temp
  file on failure.
- Replace singular routes with profile-scoped routes from the Spec. Do not keep
  implicit-profile mutation aliases. The web/desktop callers are updated in the
  same implementation before validation.

## Ordered implementation

1. Extend `Settings` with `data_root` defaulting to `~/.job-engine/data`, add a
   side-effect-free path resolver plus startup directory creation, and retain
   `resume_root` only for one-time legacy import.
2. Extend applicant domain models with profile summary, onboarding/preferences,
   managed-asset metadata, avatar crop, and ownership IDs. Keep confirmed-field
   validation and sensitive policy categories intact.
3. Implement migration `0007`: create the new tables/columns nullable, choose the
   existing profile or create `Imported applicant`, backfill every legacy asset,
   answer, and run, rebuild scoped indexes, validate no null ownership, then set
   foreign keys non-null. Preserve IDs and hashes.
4. Refactor `ApplicantVaultRepository`, application repositories, and services so
   every operation requires `profile_id`; enforce archive guards and
   cross-profile not-found behavior. Add active-profile repository/service APIs.
5. Add `services/managed_assets.py` for safe upload, sniffing, hashing, atomic
   storage, PDF text extraction with existing `pypdf`, DOCX extraction with
   `python-docx`, bounded asset reads, and reference-aware retention. Add
   `python-docx` to `pyproject.toml` and lock it.
6. Replace applicant schemas/routes with `/profiles` resources, multipart
   resume/document/avatar endpoints, crop metadata, safe content responses, and
   profile-scoped answer-bank routes. Make run schemas serialize
   `applicant_profile_id`.
7. Update backend application creation/answer context and desktop/web API clients
   to pass explicit profile IDs. Remove normal UI/runtime reliance on legacy
   filesystem fields without implementing the later onboarding screens.
8. Add migration notes and a bounded legacy asset importer that copies existing
   referenced files into managed storage on first startup; missing legacy files
   remain recorded as unavailable with a safe diagnostic rather than dropping
   the row.

## Validation

- Add migration upgrade tests from both empty and populated `0006` databases,
  asserting stable profile/resume/run/event/evidence IDs and scoped indexes.
- Add repository/service/API tests for two-profile isolation, per-profile default
  resumes, active switching, archive guards, optimistic versions, cross-profile
  404s, and duplicate semantics.
- Add upload tests for PDF/DOCX/avatar success; magic/type mismatch, oversize,
  traversal filename, symlink, interrupted stream, hash mismatch, cleanup, range
  read, and response path redaction.
- Update all directly affected frontend and desktop contract tests, then run:

```bash
corepack pnpm --filter @job-engine/api run check
corepack pnpm --filter @job-engine/api run test
corepack pnpm --filter @job-engine/api run build
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
```

## Completion evidence

Handoff must include migration row counts before/after, two-profile isolation
test names, managed-root sample tree with private names redacted, validation
results, and any unavailable legacy asset diagnostics. Do not claim onboarding,
AI extraction, batch authorization, or concurrent runtime completion.

