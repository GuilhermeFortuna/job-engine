# FRONT-001: Next.js Web Foundation

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-001

**Unblocks:** FRONT-002

**Product spec:** Sections 6, 13, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Create the minimal accessible Next.js application, frontend test foundation, and backend-origin configuration required by later UI orders. Render only a truthful foundation screen; do not build search controls or job cards.

## Owned files

- `/apps/web/package.json`
- `/apps/web/next.config.ts`
- `/apps/web/tsconfig.json`
- `/apps/web/eslint.config.mjs`
- `/apps/web/vitest.config.ts`
- `/apps/web/vitest.setup.ts`
- `/apps/web/src/app/layout.tsx`
- `/apps/web/src/app/page.tsx`
- `/apps/web/src/app/globals.css`
- `/apps/web/src/app/page.test.tsx`
- `/apps/web/src/lib/env.ts`
- `/apps/web/src/test/render.tsx`
- `/pnpm-lock.yaml`
- `/.env.example` (`NEXT_PUBLIC_API_BASE_URL` only)
- `/docs/development.md` (frontend commands only)

## Fixed contract

- Framework: Next.js 16 App Router with React and strict TypeScript, pinned to exact compatible versions in the lockfile.
- Application path: `apps/web`; private workspace package name: `@job-engine/web`; no separate shared UI package in Batch 01.
- Public configuration: `NEXT_PUBLIC_API_BASE_URL`, validated and defaulting to `http://127.0.0.1:8000` only in local development.
- Test foundation: Vitest, jsdom, React Testing Library, and `@testing-library/jest-dom`.
- Package scripts: `dev`, `check`, `test`, and `build`; `check` runs typechecking, lint, and formatting check if a formatter is installed.
- Server Components are the default. Client Components require an interaction/browser-API reason.

## Procedure

1. Verify CROSS-001 is `DONE` and preserve its pinned Node/pnpm decisions.
2. Create `apps/web` without a second lockfile and pin exact dependency versions.
3. Configure strict TypeScript, Next.js linting, unit tests, path aliases, and deterministic test cleanup.
4. Validate the backend base URL in one module; do not scatter environment reads across components.
5. Implement semantic root metadata/layout and a minimal foundation page stating that Job Engine V1 search is being built. Do not present sample jobs as real data.
6. Add restrained global tokens for color, typography, spacing, focus, and responsive page bounds; do not create a component library or visual-effects system.
7. Test page semantics, heading, and foundation message.
8. Document install, dev, check, test, and production-build commands.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run build
corepack pnpm run check
git diff --check
```

## Acceptance criteria

- A clean install produces one root lockfile and a successful production build.
- Strict typecheck, lint, and unit tests pass.
- The page has one descriptive `h1`, semantic landmarks, visible keyboard focus, and usable mobile/desktop bounds.
- Backend URL configuration is validated centrally and contains no secret.
- No search UI, job data model, API request, design-system package, analytics, authentication, or speculative dashboard is added.

## Forbidden decisions

- No Pages Router, Redux/global state library, CSS-in-JS runtime, animation library, icon bundle, shadcn registry, or component framework.
- No proxy that hides the backend contract, no hard-coded production API URL, and no credential in public environment variables.
- No copied job data presented as live.

## Handoff evidence

- Changed-file and dependency list
- Required-validation transcript
- Foundation page at desktop and mobile widths
- Accessibility-semantic test result

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
