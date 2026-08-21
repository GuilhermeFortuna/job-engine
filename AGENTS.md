# Agent operating model

This repository uses **Specification-Driven Development (SDD)** for non-trivial
changes.

The operating model is:

```text
Human intent
  ↓
Specification
  ↓
Implementation Plan
  ↓
Executor Agent
  ↓
Deterministic Validation
  ↓
Reviewer Agent
  ↓
Human approval
```

The purpose of this model is to separate product and architectural decision-making
from implementation execution, reduce agent drift, and make changes reviewable
against explicit source-of-truth artifacts.

## Authority hierarchy

When instructions or repository context conflict, use this precedence order:

1. Explicit instructions from the repository owner in the current task.
2. The approved Specification for the change.
3. The approved Implementation Plan for the change.
4. This `AGENTS.md` file and any more specific nested `AGENTS.md` files.
5. Repository architecture, engineering, and product documentation.
6. Existing code patterns and conventions.
7. Agent judgment.

A lower-authority source must never silently override a higher-authority source.

If a plan conflicts with its Specification, the **Specification wins**. Do not
reinterpret the Specification to preserve the plan; report the conflict and
request replanning of the affected work.

## Specification and plan artifacts

### Migration from Work Orders

This repository has moved away from the previous **Work Order** model.

Work Orders are no longer the primary planning, approval, or delegation artifact
for non-trivial development work. They are replaced by two linked artifacts:

1. A **Specification**, which defines **what must exist and why**, including
   requirements, scope, constraints, architectural decisions, contracts, and
   acceptance criteria.
2. An **Implementation Plan**, which defines **how the approved Specification will
   be implemented in the current repository**.

The canonical repository organization is:

```text
docs/
└── development/
    ├── specs/
    │   └── <ID>-<slug>-spec.md
    └── plans/
        └── <ID>-<slug>-plan.md
```

Specifications and Implementation Plans together replace the former Work Order
workflow.

Legacy Work Orders may remain in the repository as historical context during the
transition, but they are not authoritative for new work unless the repository
owner explicitly says otherwise. Do not create new Work Orders for work governed
by this SDD process, and do not treat stale Work Order status, approval, scope, or
dependency language as overriding an approved Specification or Implementation
Plan.

Specifications live under:

```text
docs/development/specs/
```

Implementation Plans live under:

```text
docs/development/plans/
```

A Specification and its plan share the same stable identifier and descriptive
slug.

Example:

```text
docs/development/specs/FRONT-012-application-automation-control-center-spec.md
docs/development/plans/FRONT-012-application-automation-control-center-plan.md
```

The shared identifier is the canonical link between the two artifacts.

### Specification responsibility

The Specification is the source of truth for **what must exist and why**.

It should own decisions such as:

- product behavior and user-visible outcomes
- functional and non-functional requirements
- scope and non-goals
- architectural constraints and invariants
- external and internal contracts that must hold
- data and persistence requirements
- security, compliance, performance, or reliability requirements
- acceptance criteria

A worker must not change, reinterpret, weaken, or expand these decisions during
implementation.

### Implementation Plan responsibility

The Implementation Plan is the source of truth for **how the approved
Specification will be implemented in the current repository**.

It should translate the Specification into concrete repository changes, including
as applicable:

- relevant existing-system context
- architecture and technical decisions already made for this implementation
- affected modules, files, interfaces, schemas, and contracts
- ordered implementation steps
- dependencies between steps
- migration or rollout mechanics
- testing and validation requirements
- implementation-specific constraints
- expected evidence of completion

The plan must link to its Specification and must not redefine or contradict it.

## Agent roles

Agents must operate according to the role they have been given for the current
task.

### Planner

The Planner performs the high-level reasoning required before execution.

The Planner may:

- investigate the repository
- clarify requirements from available evidence
- make or propose product, architecture, and technical decisions
- create or revise Specifications
- create or revise Implementation Plans
- decompose work and identify dependencies
- define acceptance and validation criteria

The Planner should remove meaningful ambiguity before handing work to an
Executor.

### Executor

The Executor implements an approved plan.

The Executor owns **local implementation mechanics**, not product or architecture
direction.

The Executor may decide:

- local naming
- exact syntax and control flow
- small private helper structure
- equivalent low-level implementation details
- trivial refactors required to implement the plan safely

The Executor must not independently decide to:

- change product behavior or requirements
- change architecture selected by the Specification or plan
- expand or reduce scope
- alter public contracts
- choose a materially different persistence strategy
- introduce a new framework, service, or dependency without authorization
- replace a planned approach with a preferred alternative
- perform unrelated cleanup, refactors, or feature work
- weaken acceptance criteria or validation requirements

When a meaningful decision is missing, the Executor must not silently invent it.

### Reviewer

The Reviewer evaluates the completed implementation against the authoritative
artifacts.

The Reviewer should check:

- Specification compliance
- Implementation Plan compliance
- acceptance criteria
- architectural drift
- unintended scope expansion
- contract compatibility
- test and validation evidence
- regressions or unsafe assumptions

A technically functioning implementation is not sufficient if it violates the
Specification or approved plan.

## Execution protocol

Before editing code for planned work:

1. Read the relevant Specification in full.
2. Read the corresponding Implementation Plan in full.
3. Read this `AGENTS.md` and any more specific `AGENTS.md` files that apply.
4. Inspect the current repository state and the files relevant to the next plan
   step.
5. Verify that the plan's material assumptions still match repository reality.

Then execute the plan in its intended order unless the plan explicitly permits
parallel or reordered execution.

During execution:

- keep changes within the defined scope
- preserve decisions already made by the Specification and plan
- verify completed steps as early as practical
- re-read files immediately before editing when concurrent workers may have
  changed them
- prefer existing repository patterns when the plan leaves a local detail open
- do not convert local implementation discretion into new architecture or product
  decisions

## Deviation and escalation protocol

Repository reality may invalidate an assumption in a plan. That is not permission
to redesign the solution.

A deviation is material when continuing would require changing or inventing any
of the following:

- product behavior
- architecture
- scope
- public or cross-module contracts
- persistence model
- dependency or infrastructure strategy
- security or compliance behavior
- acceptance criteria

When a material conflict is found:

1. Stop the affected implementation step.
2. Preserve completed valid work.
3. Identify the exact conflicting assumption or instruction.
4. Capture concrete repository evidence: files, symbols, interfaces, behavior, or
   failing validation.
5. Report the conflict and the decision that would be required to proceed.
6. Do not choose a new direction unless explicitly authorized or the plan is
   revised.

Non-blocking local discrepancies may be resolved by the Executor when they do not
change any material decision above. Record noteworthy deviations in the handoff.

## Scope discipline

Implement the smallest complete change that satisfies the Specification and plan.

Do not:

- add adjacent features
- fix unrelated defects
- perform broad cleanup
- modernize unrelated code
- restyle unrelated UI
- rename unrelated concepts
- introduce speculative abstractions
- rewrite working code merely because another approach appears preferable

If unrelated problems are discovered, report them separately instead of expanding
the current task.

## Validation

Validation is part of implementation, not optional cleanup.

Run the validation required by the plan and any applicable repository
instructions. Depending on the affected area, this may include:

- targeted tests
- broader unit or integration tests
- linting
- formatting checks
- static analysis
- type checking
- builds
- migration validation
- end-to-end tests
- CI-equivalent commands

Do not claim success when required validation was not run or did not pass.

If a required check cannot be run, state:

- which check was not run
- why it could not be run
- what remains unverified

Do not weaken, delete, skip, or rewrite tests merely to make validation pass unless
the Specification or plan explicitly requires the test behavior to change.

## Plan and Specification integrity

Executors must not silently edit authoritative decisions in a Specification or
Implementation Plan to make the implementation match their code.

When implementation reveals that an artifact must change:

- report the required change
- have the appropriate Planner or repository owner revise the artifact
- resume execution from the revised source of truth

Mechanical documentation updates that do not change decisions may be performed
when they are clearly in scope.

## Shared working branch

Work on the `development` branch. Do not create a separate branch, worktree, or
feature branch for a task unless the repository owner explicitly asks you to.

Multiple AI workers may implement different tasks on the same `development`
branch at the same time. Treat that as expected.

- Stay on `development`. Do not switch away, branch off, or open a dedicated
  worktree unless explicitly requested.
- Re-read files from disk immediately before editing. Another worker may have
  changed them since your last read.
- Do not revert, overwrite, restyle, or "fix" another worker's in-progress
  changes unless those changes are within your authorized scope.
- Do not treat unrelated working-tree changes as mistakes to clean up.
- If you collide with another worker through overlapping edits, unexpected diffs,
  merge conflicts, or incompatible assumptions, stop the affected work.
- Preserve both sides of a collision and report it. Do not force your version
  through.
- Do not reset, rebase, force-push, or otherwise rewrite shared `development`
  history.

## Handoff requirements

An Executor handoff should be concise and evidence-based.

Include:

- Specification and plan identifier
- implementation steps completed
- material files or modules changed
- acceptance criteria satisfied
- validation commands run and their results
- any deviations from the plan
- unresolved blockers or unverified behavior
- relevant discoveries intentionally left out of scope

Do not present planned work as completed. Do not hide failed validation,
assumptions, collisions, or deviations.

A Reviewer should be able to determine from the handoff what changed, why it
matches the authoritative artifacts, and how it was verified.
