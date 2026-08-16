# FRONT-001: Next.js Web Foundation

**Status:** `REVIEW`

**Owner:** Cursor agent

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

- Worker: Cursor agent
- Branch/worktree: `feat/front-001-web-foundation`
- Dispatched at: 2026-08-16T20:15:00-03:00

## Completion record

- Commit: `0896c0dc35acbf97d5e1c04ffb6eee5d08f302ad`
- Evidence: See below
- Independent reviewer: Pending

### Changed-file and dependency list

Owned and justified files:

- `apps/web/package.json`
- `apps/web/next.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/eslint.config.mjs`
- `apps/web/vitest.config.ts`
- `apps/web/vitest.setup.ts`
- `apps/web/next-env.d.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/page.test.tsx`
- `apps/web/src/lib/env.ts`
- `apps/web/src/lib/env.test.ts`
- `apps/web/src/test/render.tsx`
- `pnpm-lock.yaml` (root only; no `apps/web` lockfile)
- `.env.example` (`NEXT_PUBLIC_API_BASE_URL` only)
- `docs/development.md` (frontend commands)
- `README.md` (startup guidance)
- `.gitignore` (`*.tsbuildinfo`)
- `docs/work-orders/front/FRONT-001-web-foundation.md`
- `docs/work-orders/front/README.md`
- `docs/work-orders/STATUS.md`

Pinned `@job-engine/web` dependencies (exact):

- Runtime: `next@16.3.1`, `react@19.2.8`, `react-dom@19.2.8`
- Tooling: `typescript@5.9.3`, `eslint@9.39.5`, `eslint-config-next@16.3.1`, `@types/node@24.10.0`, `@types/react@19.2.18`, `@types/react-dom@19.2.4`
- Tests: `vitest@4.1.10`, `@vitejs/plugin-react@6.0.5`, `jsdom@30.0.1`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `@testing-library/jest-dom@7.0.1`, `vite-tsconfig-paths@6.1.1`

No secret, search UI, job model, API client, proxy, CSS-in-JS, design-system package, or Client Component was added.

### Required-validation transcript

```text
$ corepack pnpm install --frozen-lockfile
Scope: all 2 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 467ms using pnpm v10.34.5

$ corepack pnpm --filter @job-engine/web run check
> next typegen && tsc --noEmit && eslint .
Generating route types...
✓ Types generated successfully

$ corepack pnpm --filter @job-engine/web run test
 RUN  v4.1.10 /home/gui/projects/job-engine/apps/web
 Test Files  2 passed (2)
      Tests  8 passed (8)

$ corepack pnpm --filter @job-engine/web run build
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully
Route (app)
┌ ○ /
└ ○ /_not-found

$ corepack pnpm run check
> @job-engine/web@ check
Generating route types...
✓ Types generated successfully

$ git diff --check
(no whitespace errors)
```

### Foundation page at desktop and mobile widths

- Desktop (`http://127.0.0.1:3000`, wide viewport): one `h1` ("Job Engine V1 search is being built"), banner label "Job Engine", foundation copy that this is not a live catalog. No sample jobs.
- Mobile (`375x812`): heading wraps onto two lines; copy remains readable with page padding; no overflow or clipped text.

### Accessibility-semantic test result

`apps/web/src/app/page.test.tsx` asserts one descriptive `h1`, `banner` and `main` landmarks, and the truthful foundation message. Combined with `src/lib/env.test.ts`:

```text
Test Files  2 passed (2)
     Tests  8 passed (8)
```

Keyboard focus uses a visible `:focus-visible` outline in `globals.css`. Independent reviewer: Pending.

