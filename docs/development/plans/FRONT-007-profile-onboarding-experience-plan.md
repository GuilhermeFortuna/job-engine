# FRONT-007 implementation plan: Profile onboarding experience

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Specification:** [`../specs/FRONT-007-profile-onboarding-experience-spec.md`](../specs/FRONT-007-profile-onboarding-experience-spec.md)  
**Depends on:** BACK-014, BACK-015

## Current-system context

The header has Jobs and Applications only. `/applications/settings` renders one
large `ApplicationSettings` component with JSON textareas and local path inputs.
Readiness currently means only a profile, a resume, and desktop capability. There
is no profile switcher, onboarding route, upload/drop flow, avatar, or local-AI
self-test UI.

## Implementation decisions

- Add a client `ProfileProvider` beneath the theme provider. It loads the backend
  active profile, provides profile summaries/switching, and invalidates all
  profile-scoped hooks through a monotonically changing context key.
- Add `/onboarding` and `/profile`. Redirect a no-profile installation from Jobs,
  Applications, and root to onboarding; keep shared layout and safe error states.
- Build one typed form/component set used by both surfaces. Use normal controls
  and repeatable editors; remove the old settings page after adding a redirect to
  `/profile`.
- Persist server onboarding step only after the step's required writes complete.
  Local component state is not progress authority.

## Ordered implementation

1. Replace application API/types for singular profile/path registration with
   BACK-014 profile summaries, active-profile, multipart assets, proposals, and
   BACK-015 readiness/self-test contracts. Add profile-keyed data hooks.
2. Add `features/profiles/` with `ProfileProvider`, switcher, avatar, safe image
   loader, route guard, field editors, resume/document manager, extraction review,
   preferences, automation settings, and readiness components.
3. Update `layout.tsx` navigation and metadata to describe a local personal job
   tool for multiple roles. Add the profile switcher before the theme control and
   ensure the menu is keyboard/focus complete.
4. Implement the six-step onboarding route with an explicit stepper, saved-step
   resume, back/continue behavior, error summary, upload progress, and final
   readiness result. File drop and picker share one validator; no local path is
   accepted.
5. Implement avatar preview/crop using a square normalized crop rectangle and
   pointer plus keyboard controls; persist crop through the backend and support
   remove/replace.
6. Implement extraction review with source evidence and per-field accept, edit,
   decline, and accept-selected actions. Sensitive fields are rendered only in
   the explicit owner-entry step.
7. Implement `/profile` sections from the Spec using the same editors. Replace
   `/applications/settings` with a permanent internal redirect and remove normal
   JSON/path/checksum/internal-ID display.
8. Compose deterministic readiness from backend profile/assets/AI state and
   desktop capability into the three exact labels and specific next actions.
   Refresh after upload, self-test, profile edit, and desktop reconnect.
9. Clear selections and profile-scoped caches on switch, then navigate away from
   inaccessible profile resources without flashing prior-profile values.

## Validation

- Component tests cover fresh/migrated entry, switcher, each wizard step,
  persisted resume, PDF/DOCX/avatar upload, crop keyboard control, proposal
  decisions, sensitive-field blank defaults, readiness matrix, and sanitized
  failures.
- Cross-profile tests deliberately delay old-profile responses and prove they
  cannot render after a switch.
- Playwright covers fresh-install onboarding at desktop/mobile widths, keyboard
  traversal/focus restoration, reload resume, Profile editing, two-profile
  switching, runtime/model failures, and settings redirect.

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run test:e2e
corepack pnpm --filter @job-engine/web run build
```

## Completion evidence

Provide route/component test results, real-browser screenshots for every step and
Profile sections, keyboard/mobile checks, two-profile redaction proof, and the
three readiness states. Do not claim batch selection or concurrent queue UX.
