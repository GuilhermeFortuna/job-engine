# BACK-015 implementation plan: Local-AI runtime

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Specification:** [`../specs/BACK-015-local-ai-runtime-spec.md`](../specs/BACK-015-local-ai-runtime-spec.md)  
**Depends on:** BACK-014

## Current-system context

The backend already has deterministic, loopback OpenAI-compatible, and Gemini
answer providers plus grounded claim validation. `Settings.local_model` has no
default; there is no shared broker, readiness endpoint, persisted self-test, or
PDF/DOCX-to-profile proposal pipeline. Resume import currently expects Markdown.

## Implementation decisions

- Retain `services/answer_providers.py` as the transport/schema foundation and
  place all local calls behind a new `LocalInferenceBroker` singleton owned by
  `create_app()`. Default model becomes [`qwen3:4b`](https://ollama.com/library/qwen3),
  whose official Ollama package is 2.5 GB and is appropriate for the specified
  6 GB VRAM target; the setting is still overrideable.
- Broker defaults: one active inference, queue length 16, 15-second acquire
  timeout, task timeout 45 seconds for extraction and 15 seconds for answers,
  8,192 input tokens, and existing 500 output-token default. Values are settings
  with positive bounded validation.
- Add migration `0008_local_ai_profile_proposals.py` containing a singleton
  sanitized self-test record and profile-owned resume extraction proposals with
  schema/prompt/model revision, source asset/version, status, structured proposal,
  evidence references, and timestamps. Raw prompts/responses are never stored.
- A proposal is immutable. Acceptance maps selected proposal fields through the
  existing optimistic profile replace service and records owner confirmation;
  prohibited sensitive field paths are rejected server-side.

## Ordered implementation

1. Add local-AI domain types and stable failure codes (`not_configured`,
   `runtime_unreachable`, `model_missing`, `queue_full`, `timeout`,
   `invalid_structure`, `ungrounded`, `internal_error`).
2. Refactor local provider construction so the app creates one `httpx` client and
   `LocalInferenceBroker`; answer services receive the broker through explicit
   dependency wiring. Preserve deterministic-first and cloud privacy gates.
3. Define versioned Pydantic/wire schemas for self-test, resume-profile proposal,
   and grounded answer tasks. Disable Qwen thinking output for JSON tasks and
   accept only the JSON schema payload; never parse prose around it.
4. Add migration/repository support for sanitized health and proposals. Implement
   `/api/v1/local-ai/status`, `/self-test`, and profile-scoped resume proposal
   create/read/accept endpoints.
5. Build deterministic extraction input from BACK-014 managed PDF/DOCX text,
   normalize source spans, call local AI only when configured, discard prohibited
   fields, and return per-field suggestion/provenance. Deterministic extraction
   failure remains visible even if the model is healthy.
6. Route existing local application-answer generation through the broker and
   retain claim/evidence/control validation. Remove any local-dollar budgeting;
   keep Gemini cost/privacy settings unchanged.
7. Expose a combined readiness projection used later by FRONT-007, with no raw
   applicant/model/provider content.

## Validation

- Unit-test FIFO semaphore behavior, limit/queue/timeout cancellation, one shared
  client, schema revision, health sanitization, and graceful shutdown.
- Use a fake loopback OpenAI-compatible server for valid JSON, thinking/prose
  pollution, malformed JSON, missing model, timeout, overload, ungrounded claims,
  and prompt-injection resume text.
- Test proposal persistence, evidence references, explicit accept/edit/decline,
  optimistic conflict, cross-profile denial, and absolute prohibition of
  inferred authorization/consent/demographic/compensation fields.
- Re-run the complete existing answer-provider and application-answer corpus.

```bash
corepack pnpm --filter @job-engine/api run check
corepack pnpm --filter @job-engine/api run test
corepack pnpm --filter @job-engine/api run build
```

- On the target machine, run one manual `qwen3:4b` self-test and record sanitized
  latency, model identifier, schema revision, and pass/fail. Model installation is
  an explicit owner action, not a test side effect.

## Completion evidence

Report automated results, broker concurrency trace, sanitized self-test, proposal
review example, and deterministic-answer regression evidence. Do not claim UI,
job ranking, browser control, or unattended submission from model output.
