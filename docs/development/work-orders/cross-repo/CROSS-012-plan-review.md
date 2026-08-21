# CROSS-012 Implementation-Plan Review

**Reviewed:** 2026-08-20

**Subject:** The "CROSS-012 Production Runtime" implementation plan (RuntimeCoordinator, lease/checkpoint extension, production smoke harness)

**Work Order:** [CROSS-012](CROSS-012-production-runtime-integration.md)

**Contract:** [V2.1 Auto-Apply Owner Outcome Contract](../../v2.1-auto-apply-outcome-contract.md), sections 3–5

**Repository revision reviewed:** `9a9378d`

**Status of this document:** Review artifact. It carries no owner approval and
changes no Work Order binding. Where it disagrees with
[CROSS-012](CROSS-012-production-runtime-integration.md), the Work Order wins;
where it disagrees with [STATUS.md](../STATUS.md), STATUS.md wins.

---

## Verdict

The plan's structure is sound and its reading of the production gap is accurate.
Three findings must be fixed before implementation, because each would let the
order be declared complete on evidence that is not production evidence — the
precise failure that created Batch 04. Six further findings are design holes that
will surface during implementation if not resolved first.

Line references are against `9a9378d`; reconfirm them against your
implementation commit.

---

## Blocking

### B-1. The production smoke never builds the production entrypoint

The proposed script is:

```json
"test:production": "tsc -p tsconfig.test.json && node scripts/run-production-smoke.mjs"
```

`tsconfig.test.json` sets `rootDir: "./"`, so it emits **`dist/src/main/index.js`**.
The production entrypoint, built by plain `tsc` (`rootDir: "./src"`), is
**`dist/main/index.js`**. Both configs write to the same `outDir: ./dist`, and
the working tree already contains both trees (`dist/main/` and `dist/src/main/`).

Consequence: the smoke launches a **stale** `dist/main/index.js` left by an
earlier `pnpm build`. It can pass green against a binary that predates the
change under test, and the Work Order's central guarantee — `test:production`
fails if runtime construction is removed from the production import graph —
silently stops holding.

Required:

- Build both graphs: `tsc && tsc -p tsconfig.test.json && node scripts/run-production-smoke.mjs`.
- Have `run-production-smoke.mjs` assert the launched artifact is newer than
  `src/main/**` rather than trusting whatever sits in `dist/`, or clean `dist/`
  first. A smoke test that can run against a stale binary is not a guard.
- Consider giving the two tsconfigs distinct `outDir`s. The shared output
  directory is pre-existing, but this order is the first to depend on which tree
  it launches.

### B-2. The run must be created through the public contract; the seed script cannot do it

Plan §5 step 1 reads: seed "via public `POST /api/v1/application-runs` contract
(**or existing seed script**)". Delete the alternative.

`seedBackend` (`apps/desktop/tests/fixtures/backend-harness.ts:36-51`) shells out
to a Python seed script that writes directly to the database. Both the Work Order
procedure (step 6) and the CROSS-011 binding require the smoke to create the run
**through the public contract**.

This is not a formality. A full-auto run becomes authorized only when the API
validates the exact `owner_confirmation` string and stamps
`automatic_submission_authorized_at` (BACK-012, contract §4). **The seed script
cannot produce an authorized full-auto run**, so the seeded path can never
exercise the authorization this entire order turns on. Seeding it would prove the
coordinator runs, while proving nothing about the thing that makes full-auto
legitimate.

Required: the smoke creates its run with `POST /api/v1/application-runs`,
including the full-auto case with its `owner_confirmation` text.

### B-3. Greenhouse and Lever are demoted to optional without authority

Plan §7 states that Greenhouse/Lever smoke "can reuse fixture servers with
adapter-specific seeded runs if time permits; generic is minimum bar."

The Work Order does not offer that latitude:

- Acceptance criteria: "Greenhouse, Lever, and generic selection use the
  production coordinator rather than fixture-specific drivers."
- Handoff evidence: "Generic, Greenhouse, and Lever real-Electron
  production-smoke results."

Batch 04 exists because Batch 03 shipped fixture-only proof of a narrower
behavior than the owner asked for. A scope reduction placed in an evidence
bullet is the same failure in miniature. Restore all three as required, or stop
and raise it with the owner — it is not the implementing agent's call.

---

## Design holes

### D-1. A paused semi-auto run deadlocks the single-view queue

The plan has semi-auto "forget lease, poll `getRun()` until
`isReleasedForSubmit`, reclaim, submit once" — with no interval, no timeout, no
bound, and no release of the embedded view. The owner may never release. The Work
Order simultaneously requires queued runs to be processed "when the view becomes
available," so one unreleased run parks the only view indefinitely.

Resolve explicitly. The recommended shape: a semi-auto run reaching
`submit_armed` raises its exception, surrenders the view, and leaves the queue
free. Its state is durable backend-side (`isReleasedForSubmit` is computed from
backend fields alone, `checkpoints.ts:70-78`), so it reclaims cleanly when the
owner releases. A bounded poll is acceptable only if it also surrenders the view.

### D-2. `openApplication` tears down the active view unconditionally

`application-view.ts:118` calls `closeApplication()` on entry. Routing IPC
through `coordinator.openRun()` (plan §4) is correct but insufficient: the
coordinator must own admission and be able to **refuse**.

Hard rule to implement and test: a run at or past the `submitting` checkpoint
must never have its view destroyed before receipt reconciliation. Losing the view
mid-submit is exactly how a run becomes permanently `submission_unknown`.

### D-3. Crash notification must precede teardown

`application-view.ts:219-222` handles `render-process-gone` by calling
`closeApplication(false)` immediately. If the coordinator's `crashed` listener
fires after that, it has lost the view context it needs to flush the evidence log
and release the lease with a truthful reason. Specify the ordering: notify
listeners, let the coordinator settle, then tear down.

### D-4. Exception mapping conflates exception type with run status

The plan's table maps `NEEDS_ANSWERS`/`UNSUPPORTED` to "`unresolved_question` or
`step_error`". The CROSS-011 binding maps missing answers, validation failures,
and unsupported required controls to the durable status **`needs_input`**.

Exception type and resulting durable status are different axes, and an "or"
between two exception types with no status column is how a run ends up in a state
that misdescribes what happened. Replace the row with a table of
`StepOutcome → exception type → durable status`, with exactly one destination per
outcome. `StepOutcome` values are enumerated at `src/main/forms/types.ts:189-203`.

### D-5. `RunProgress` gains a required field and breaks its construction sites

Adding authorization to the `RunProgress` interface (`checkpoints.ts:44-49`)
breaks every object literal that builds one, including those in the fixture
suites, which must keep compiling under `pnpm check` and must not be weakened.
Small work, but budget it rather than discovering it at validation time.

### D-6. `vitest.config.mts` needs a `production` project and is not in the owned files

`tests/production/**/*.test.ts` will not run otherwise: `test` covers only
`unit`, `runtime`, and `forms`, and `test:fixtures` covers `fixtures`
(`vitest.config.mts:6-40`). `vitest.config.mts` is absent from the CROSS-012
owned-files list.

[STATUS.md](../STATUS.md) ("Authority and precedence") authorizes the assigned
worker to reconcile exactly this kind of omission from a completed prerequisite
and continue. Do so, and record it in the handoff as a reconciled omission — do
not edit it silently, and do not treat it as a blocker.

### D-7. Drop the static guard shim

Plan §5 step 5 proposes "a static import/reachability assertion" as the guard
that construction was not removed. That is the weak form of the requirement, and
the `rg -n "new (StepRunner|LeaseManager|RunnerClient|EvidenceRecorder)"` check
already in the validation block covers the static angle.

If the smoke genuinely drives a run through the compiled main entrypoint,
removing coordinator construction fails it **behaviorally**, which is the
guarantee the Work Order asks for. A separate static assertion can pass while the
runtime does nothing — the false signal to avoid. Delete it and let the
end-to-end assertion carry the weight.

---

## Smaller points

- **Step-loop exhaustion is unspecified.** `MAX_STEPS = 12` is already exported
  (`runner.ts:19`). State what happens when the loop exhausts it: a truthful
  terminal failure, never a fall-through into submit.
- **Unauthorized full-auto needs an owner-visible reason.** Refusing the claim is
  correct — authorization is frozen at creation and cannot appear later — but
  V2.1 outcome 2 forbids a capability failure from silently removing the feature.
  Surface a named reason code through the runtime-state IPC.
- **Per-run construction satisfies the `rg` check.** `StepRunner` and
  `EvidenceRecorder` are per-run/per-attempt objects
  (`new EvidenceRecorder(client, runId, attempt)`), so they belong in
  `coordinator.ts`, not the `index.ts` snippet. That still satisfies the
  validation grep, which scans all of `apps/desktop/src/main`. The plan's §3 and
  §4 snippets disagree with each other on this; make them consistent.

---

## Confirmed correct

Recorded so the implementer does not re-litigate these:

- **Authority.** STATUS.md marks CROSS-012 `READY`; the Work Order's `BLOCKED`
  header is stale and the board overrides it.
- **`runSchema` extension is available as assumed.** `RunnerClaimResponse.run`
  embeds `ApplicationRunRead` (`apps/api/src/job_engine/api/schemas.py:838-841`),
  which carries both `automatic_submission_authorized_at` and the derived
  `automatic_submission_authorized` (lines 759-760). `getRun` reads the same
  owner-facing shape, so both paths stay consistent.
- **Lease diagnosis.** `SUPPORTED_AUTOMATION_MODE` at `lease.ts:35` and the
  refuse/release path at lines 96-104 are exactly as described, and the
  `refused` set already gives the "refuse once per owner action" behavior.
- **Adapter surface.** `submitAfterRelease` and `captureReceipt` are real members
  of `FormAdapter` (`adapters/contract.ts:97-108`), correctly attributed to the
  adapter rather than to `RunnerClient`.
- **HTTPS fixture is genuine** (`generic-form-server.ts:193-196`), which matters
  because `AdapterRegistry.resolve` rejects any non-HTTPS URL
  (`adapters/registry.ts:44-46`).
- **The composition target is right.** `index.ts` today constructs only config,
  session, `ApplicationViewManager`, IPC, and the window; `config.runnerSecret`
  already exists and is used by `ipc.ts`, so `RunnerClient` credentials need no
  new plumbing.
