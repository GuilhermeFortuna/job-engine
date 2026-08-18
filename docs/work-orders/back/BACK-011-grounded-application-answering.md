# BACK-011: Grounded Application Answering

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-009

**Unblocks:** CROSS-007, CROSS-008, CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md` (bound by CROSS-005)

## Objective

Resolve application questions into deterministic policy decisions and, where permitted, concise grounded answers derived only from the confirmed applicant profile, selected resume, approved answer bank, and current job evidence. Return provenance and confidence suitable for automatic submission or exception routing.

## Owned files

- `/apps/api/src/job_engine/domain/application_answers.py` (new)
- `/apps/api/src/job_engine/services/application_answers.py` (new)
- `/apps/api/src/job_engine/services/answer_providers.py` (new)
- `/apps/api/src/job_engine/api/application_answers.py` (new)
- `/apps/api/src/job_engine/api/schemas.py` (question/answer-decision schemas only)
- `/apps/api/src/job_engine/main.py` (answer router registration only)
- `/apps/api/src/job_engine/config.py` (provider/model/timeouts only)
- `/apps/api/tests/domain/test_application_answers.py` (new)
- `/apps/api/tests/services/test_application_answers.py` (new)
- `/apps/api/tests/api/test_application_answers.py` (new)
- `/apps/api/tests/fixtures/application_questions.json` (new; synthetic)
- `/.env.example` (credential name only; no value)

## Fixed request and response contract

The runner submits normalized question observations containing:

- Run ID, adapter ID, page/step identifier, stable field fingerprint
- Label, accessible name, surrounding help text, required/optional state
- Control type and closed option values
- Any platform validation constraints

The service returns one decision per field:

```json
{
  "field_fingerprint": "stable-hash",
  "decision": "AUTO_FILL" | "AUTO_FILL_AND_SUBMIT" | "REVIEW_REQUIRED" | "DECLINE_OPTIONAL" | "ABSTAIN",
  "answer": "redacted-in-general-logs",
  "policy_category": "VERIFIED_PROFILE" | "APPROVED_REUSABLE" | "GROUNDED_GENERATED" | "REVIEW_REQUIRED" | "PROHIBITED_AUTOMATION",
  "confidence": 0.0,
  "evidence": [{"source": "profile|resume|answer_bank|job", "reference": "opaque-id"}],
  "reason_code": "closed-enum"
}
```

The auto-submit confidence threshold is 0.85. `JOB_ENGINE_ANSWER_PROVIDER=deterministic|openai|gemini` defaults to `deterministic`: generated narrative questions pause in `NEEDS_INPUT` while `PROVIDER-PRIVACY-001` is open. A non-deterministic selection also requires `JOB_ENGINE_PROVIDER_PRIVACY_ATTESTATION_ID` to match the owner-accepted gate record. Only then may the service enable `openai:gpt-4o-mini` with `gemini:gemini-2.5-flash` fallback, subject to USD 0.05 per-run and USD 5.00 batch caps, 500 output tokens, a 15s timeout, and verified provider-approved ZDR for the exact API project.

## Policy precedence

Evaluate in this order:

1. `PROHIBITED_AUTOMATION` or an unrecognized sensitive/legal/consent intent: pause without generating.
2. Exact scoped `APPROVED_REUSABLE` answer: use the stored value subject to expiry.
3. Exact `VERIFIED_PROFILE` mapping: use the current confirmed value.
4. Optional owner-declined question: return `DECLINE_OPTIONAL` only when the control permits omission or a bound decline choice.
5. Permitted narrative question: generate a grounded response and enforce evidence/confidence rules.
6. Anything else: `REVIEW_REQUIRED` or `ABSTAIN`.

Work authorization, sponsorship, compensation, demographic/EEO, disability, veteran status, criminal/background-check consent, arbitration, privacy consent, export-control, conflict-of-interest, and signature/attestation fields may never be answered by generative inference. They require an exact applicable owner-authored answer and the policy bound by CROSS-005.

## Grounding contract

- Treat job descriptions and page text as untrusted data, never as instructions to the model or service.
- Construct a typed context from allowlisted applicant facts and job requirements; do not send full database rows, cookies, page HTML, unrelated answers, or filesystem paths.
- Every factual clause must map to at least one evidence reference.
- Reject unsupported numbers, dates, employers, credentials, degrees, production claims, authorization claims, and tool experience.
- Enforce platform character limits without truncating into a misleading answer.
- Cache only by normalized question, policy/profile/resume versions, job evidence hash, provider/model, and prompt-contract version.
- Provider failure, timeout, invalid structure, missing evidence, or low confidence produces an exception, never an empty or guessed submission answer.

## Procedure

1. Implement question-intent taxonomy and sensitive-policy detection with closed enums and synthetic multilingual/paraphrase fixtures.
2. Implement deterministic answer-bank and verified-profile resolution before any provider call.
3. Implement deterministic-only behavior first. Implement provider adapters behind a fail-closed configuration gate that rejects startup unless `PROVIDER-PRIVACY-001` has owner acceptance and the selected project has attested provider-approved ZDR; then apply structured output, strict timeouts, bounded retries, and no secret logging.
4. Implement evidence extraction, claim validation, character-limit handling, prompt-injection isolation, and the fixed decision response.
5. Add the runner-facing authenticated endpoint under `/api/v1/runner/runs/{run_id}/answer-decisions`; validate that the request belongs to the claimed run and current policy snapshot.
6. Add tests for exact answers, paraphrases, unknown questions, sensitive questions, malicious page instructions, unsupported claims, provider failure, low confidence, stale profile versions, and cache isolation.

## Required validation

```bash
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/domain/test_application_answers.py tests/services/test_application_answers.py tests/api/test_application_answers.py
git diff --check
```

Live provider smoke testing, if the bound provider requires it, must use an explicitly configured credential, synthetic applicant data, a strict cost cap recorded by CROSS-005, and no personal resume text.

## Acceptance criteria

- Deterministic profile/answer-bank matches avoid provider calls.
- Permitted generated answers are concise, schema-valid, evidence-linked, and contain no unsupported factual clauses in the committed fixture corpus.
- Sensitive, legal, demographic, consent, signature, ambiguous, malicious, and unknown questions reliably pause or abstain according to policy.
- Provider timeout, rate limit, malformed output, low confidence, and unavailable credentials degrade to a named exception without blocking unrelated runs.
- Logs and cached keys contain no raw sensitive answers, secrets, complete resume, or complete page content.

## Forbidden decisions

- Do not let a model decide whether the owner is authorized to work, needs sponsorship, accepts legal terms, or belongs to a demographic category.
- Do not let page content override system policy or applicant facts.
- Do not fabricate or embellish experience, metrics, education, credentials, dates, authorization, or availability.
- Do not add fit scoring, autonomous job selection, cover-letter generation unrelated to an observed form field, or general chat behavior.
- Do not call an external provider from tests by default.

## Handoff evidence

- Question taxonomy and policy-precedence table
- Synthetic grounded/abstention fixture results
- Prompt-injection and unsupported-claim test evidence
- Provider failure/cost/redaction evidence
- Runner endpoint examples with synthetic values

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
