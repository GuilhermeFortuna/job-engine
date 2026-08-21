# BACK-014: Multi-profile applicant data and managed local assets

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Implementation plan:** [`../plans/BACK-014-multi-profile-local-data-plan.md`](../plans/BACK-014-multi-profile-local-data-plan.md)

## Purpose

Replace the single global applicant vault with isolated applicant profiles and
managed local assets. A local installation may contain multiple people, and no
profile's identity, documents, answers, preferences, or application history may
be read or used through another profile.

## Requirements

### Profile identity and isolation

- Each profile has a stable UUID, display name, optional avatar, version,
  timestamps, onboarding state, readiness inputs, and the existing confirmed
  applicant fields.
- Resumes, supporting documents, reusable answers, answer history, automation
  preferences, application runs, exceptions, evidence, and receipts belong to
  exactly one profile. Cross-profile identifiers return `404`, not another
  profile's data.
- The installation persists one active profile. Switching it is explicit and
  does not copy or merge data. Search may remain shared, but every profile-aware
  screen and mutation names the active profile.
- Profile deletion is not part of this batch. Profiles may be archived only when
  they have no active application batch or non-terminal run.

### Managed assets

- Normal users upload resume files as PDF or DOCX and avatars as PNG, JPEG, or
  WebP. They never enter repository paths, internal UUIDs, checksums, Markdown,
  or JSON.
- Accepted files are copied beneath a configurable local data root, partitioned
  by profile and asset ID. API responses expose safe metadata and content URLs,
  never host filesystem paths.
- Resume upload preserves the original application-ready bytes, records media
  type, size, SHA-256, version, label, and default status, and extracts text for
  later proposal generation. PDF and DOCX are the only resume formats in scope.
- Avatar upload records the original image and a normalized crop rectangle. It
  is a local UI asset only and cannot be selected as an application attachment.
- Maximum sizes are 20 MiB per resume and 10 MiB per avatar. Type validation uses
  both declared media type and file signatures; rejected files leave no durable
  database row or partial managed file.

### Migration and compatibility

- Existing single-profile data is migrated without loss. The existing profile
  row keeps its UUID. If vault assets exist without a profile, migration creates
  one `Imported applicant` profile and attaches all legacy assets and runs.
- Existing resume IDs, checksums, run IDs, audit events, evidence, and receipts
  remain stable. The migration adds ownership; it does not recreate history.
- The singular `/api/v1/applicant-profile`, `/api/v1/resumes`, and
  `/api/v1/answer-bank` contracts are replaced by profile-scoped contracts in
  this batch. All repository consumers must migrate atomically; no ambiguous
  implicit-profile write endpoint remains.

## Public contracts

- `GET/POST /api/v1/profiles` lists and creates profile summaries.
- `GET/PATCH /api/v1/profiles/{profile_id}` reads or updates one profile with
  optimistic version checking; `POST /profiles/{id}/archive` archives it.
- `GET/PUT /api/v1/profiles/active` reads or explicitly changes the active
  profile.
- `/api/v1/profiles/{profile_id}/resumes`, `/documents`, `/avatar`, and
  `/answer-bank` provide profile-scoped asset and answer operations.
- Upload endpoints use multipart form data. Asset bytes are served only from
  profile-scoped API routes with `Content-Disposition` appropriate to preview or
  download; raw local paths are never serialized.
- All application-run read models include `applicant_profile_id` in addition to
  the frozen profile version.

## Constraints and non-goals

- PostgreSQL remains metadata and workflow state authority. File bytes remain in
  managed local storage; database BLOB storage and cloud object storage are out
  of scope.
- No authentication or hosted multi-tenancy is introduced. Isolation is a local
  domain invariant enforced by schema, repositories, services, and routes.
- This Spec does not implement AI extraction, onboarding UI, job ranking,
  application batches, or profile deletion.

## Acceptance criteria

1. Two profiles can coexist with independent default resumes, answers,
   preferences, and history; cross-profile API probes cannot access either
   profile's resources.
2. A PDF or DOCX resume and an optional avatar can be uploaded without supplying
   a path; the source is copied to managed storage and is usable after restart.
3. Unsafe type, oversize, traversal, symlink, and partial-write cases fail closed
   without exposing paths or leaving orphaned files/rows.
4. Migrating a legacy database preserves all existing vault and application-run
   identifiers and associates them with exactly one profile.
5. Active-profile switching is durable and visible through the API, and archive
   guards protect profiles with active work.
