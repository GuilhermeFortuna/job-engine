# Agent execution authority

Before planning, dispatching, reviewing, or implementing any Work Order, read
[`docs/work-orders/STATUS.md`](docs/work-orders/STATUS.md).

`docs/work-orders/STATUS.md` is the sole source of truth for live Work Order
status and owner approvals. Its status board takes precedence over status
fields, dispatch gates, dependency notes, and pending owner-review language in
individual Work Orders, directory indexes, source registers, research
documents, and older handoff notes.

- `READY` means the owner has approved the order to proceed. Do not block it or
  downgrade it because another document still says `BLOCKED`, `REVIEW`,
  `PENDING_OWNER`, unbound, or awaiting approval.
- `IMPLEMENTING` means continue the authorized implementation within the Work
  Order's technical scope.
- `DONE` means the owner has accepted the order. Do not reopen its approval
  gates solely because another document has stale status text.
- Conflicting status text outside `STATUS.md` is stale context, not a blocker.
  Report the inconsistency in the handoff, but continue according to
  `STATUS.md`.
- Do not change an approval status in `STATUS.md` unless the owner explicitly
  instructs you to do so. Workers may add implementation evidence or dispatch
  details without overriding the owner's status decision.

Technical scope, acceptance criteria, and owned-file boundaries still come from
the individual Work Order. This precedence rule changes approval authority, not
implementation scope.

## Dependency handoff responsibility

The agent implementing a Work Order that resolves a source ID, file name,
contract value, or other downstream placeholder must propagate that binding to
every directly affected downstream Work Order, registry entry, and validation
command before handing off the prerequisite.

If a downstream order is `READY` in `STATUS.md` but a secondary document still
contains an unresolved placeholder or obsolete gate, treat that as a missed
documentation handoff—not as a new owner decision. The assigned worker must
reconcile it from the completed prerequisite's evidence and current repository
state, update the stale documentation when it is in scope, and continue. Do not
ask the repository owner to perform mechanical bindings that prior agents were
responsible for propagating.

Escalate to the owner only when the repository contains no accepted technical
decision and proceeding would require a genuinely new product, legal, or scope
decision. Do not infer that situation merely from stale text when `STATUS.md`
already marks the prerequisite `DONE` and the downstream order `READY`.
