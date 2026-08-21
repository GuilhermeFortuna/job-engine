# FRONT-007: Guided onboarding and Profile experience

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Depends on:** BACK-014, BACK-015  
**Implementation plan:** [`../plans/FRONT-007-profile-onboarding-experience-plan.md`](../plans/FRONT-007-profile-onboarding-experience-plan.md)

## Purpose

Replace developer-oriented application settings with an ordinary guided setup
and a durable Profile area. A non-developer must be able to create an applicant,
upload documents, review suggestions, enter application facts, and understand
readiness without editing files or structured data.

## Requirements

### Global profile context

- The primary header contains an obvious profile switcher with avatar/initials,
  display name, create-profile action, and active state. Profile-aware screens
  repeat the active applicant in their heading or summary.
- On a fresh installation, the product routes to onboarding. Existing migrated
  users land on the product with their imported profile active and may revisit
  onboarding/profile editing.
- Profile switching clears profile-scoped client state and reloads readiness,
  documents, answers, batches, and history. Shared job search parameters may be
  retained, but selected jobs are cleared.

### Onboarding flow

- Six visible steps implement the owner direction: applicant creation, resume,
  extracted-information review, application facts/preferences, automation
  readiness, and final readiness result.
- Progress is persisted after each successful step and is resumable. Back/forward
  navigation never confirms a suggestion or loses saved data.
- Resume and avatar use file picker and drag-and-drop controls. Avatar has a
  keyboard-operable square crop/preview and clear remove action.
- Extraction suggestions display their source/provenance and are visually
  distinct from confirmed facts. Users accept, edit, or decline them explicitly.
- Application facts use ordinary labeled fields and repeatable editors. Sensitive
  facts and optional demographic behavior include plain-language consequences;
  they are never prefilled by AI.
- Readiness runs desktop-runtime and local-model checks and reports exactly one
  outcome: `Ready for Auto Apply`, `Ready with exceptions`, or `Setup required`,
  with specific next actions.

### Profile page

- `/profile` replaces `/applications/settings` and provides Overview, Resume and
  documents, Experience, Application information, Job preferences, Automation,
  and Readiness sections.
- It uses the same components and validation as onboarding. Raw JSON editors,
  paths, checksums, internal IDs, policy constants, and provider payloads are not
  part of the normal interface.
- Readiness classification is deterministic: missing confirmed identity/contact,
  default resume, or desktop runtime is `Setup required`; optional unanswered
  fields or unavailable local AI is `Ready with exceptions`; all required checks
  passing is `Ready for Auto Apply`.

## Accessibility and resilience

- The wizard and Profile page meet keyboard, focus, label, error-summary,
  reduced-motion, responsive, and WCAG 2.2 AA contrast expectations.
- Upload/extraction/self-test operations show progress, retry, and safe failure
  states. Navigation away during pending work requires no destructive reset.
- Private values, local paths, raw prompts, and model payloads never appear in
  client logs or generic errors.

## Constraints and non-goals

- No autonomous profile completion, job ranking, employer-facing avatar upload,
  or cloud account system is introduced.
- The existing premium visual language is evolved; this pair does not restyle
  unrelated job/application screens.

## Acceptance criteria

1. A fresh-install browser/Electron flow creates a profile, optionally crops an
   avatar, uploads PDF or DOCX, reviews suggestions, completes required facts,
   and reaches a truthful readiness state without technical inputs.
2. Two profiles can be switched without displaying or reusing the other
   profile's documents, answers, readiness, batches, or history.
3. Reloading or restarting resumes onboarding at the last completed step.
4. Local-model/runtime failures produce actionable, sanitized readiness guidance
   and do not block unrelated profile editing or search.
5. Automated component tests plus real-browser keyboard/responsive checks cover
   the full flow; owner-visible acceptance demonstrates a non-developer path.
