# BACK-013: Hybrid Local and Gemini Grounded Answer Provider

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-011, BACK-011

**Unblocks:** CROSS-014, CROSS-013

**Product contract:** `docs/v2.1-auto-apply-outcome-contract.md` after CROSS-011 acceptance

## Objective

Add a provider-neutral, deterministic-first AI answer layer for permitted narrative application questions. Development may use a loopback local model; an explicitly configured Gemini project may be used for synthetic smoke tests and, only after the existing privacy gate is accepted, real applicant data. AI proposes grounded answers through a strict schema; it never selects jobs, controls the browser, decides policy, supplies sensitive/legal facts, or authorizes submission from self-reported confidence.

## Owned files

- `/apps/api/src/job_engine/config.py` (answer-provider settings only)
- `/apps/api/src/job_engine/domain/application_answers.py` (provider result and derived-eligibility contract only)
- `/apps/api/src/job_engine/services/answer_providers.py`
- `/apps/api/src/job_engine/services/application_answers.py` (provider generation/validation path only)
- `/apps/api/tests/domain/test_application_answers.py` (provider-result contract only)
- `/apps/api/tests/services/test_answer_providers.py` (new)
- `/apps/api/tests/services/test_application_answers.py` (provider-policy cases only)
- `/apps/api/tests/fixtures/ai_application_questions.json` (new; synthetic)
- `/apps/api/tests/fixtures/ai_provider_responses/**` (new; synthetic and redacted)
- `/.env.example` (provider variable names with empty secrets only)
- `/docs/development.md` (local/Gemini setup and opt-in smoke commands only)
- `/docs/automation/ai-provider-policy.md` (new)
- `/docs/evidence/ai-provider-evaluation.md` (new; no personal data)

Do not edit Electron, React, browser/form adapters, application-run authorization, job selection, source ingestion, personal résumé/profile files, or approval statuses.

## Fixed provider contract

### Common boundary

- Preserve the existing `AnswerProvider.generate(GroundedContext, max_output_tokens, timeout_seconds) -> ProviderResult` seam; provider-specific SDK/HTTP shapes do not escape the adapter.
- Deterministic answer-bank and verified-profile resolution always run before an AI call. AI is reachable only for the existing permitted narrative category after sensitive/prohibited/unrecognized policy checks.
- The request contains only the current observed question plus allowlisted, frozen profile/job evidence. Never send page HTML, cookies, credentials, filesystem paths, unrelated answers, complete database rows, or a complete résumé.
- Use one strict JSON schema generated from the domain/Pydantic result model. Every answer clause must carry allowlisted evidence identifiers; the server derives the final answer from validated structured clauses or rejects it.
- Provider/model name, prompt-contract version, normalized question, frozen profile/answer/resume versions, and job-evidence hash remain part of the cache key.
- Timeout, transport failure, rate limit, malformed structure, missing evidence, character/control mismatch, policy mismatch, or unavailable credentials returns a named abstention/review exception. It never produces an empty, guessed, or partially trusted answer.

### Local provider

- Add `local` to `JOB_ENGINE_ANSWER_PROVIDER` while preserving `deterministic`, `openai`, and `gemini` compatibility.
- Add `JOB_ENGINE_LOCAL_PROVIDER_BASE_URL`, defaulting to `http://127.0.0.1:11434/v1`, and `JOB_ENGINE_LOCAL_MODEL`, with no default model identifier.
- Reject startup unless the configured local base URL is HTTP(S) loopback (`127.0.0.1`, `localhost`, or `::1`). Redirects and DNS names are not accepted as local.
- Call the OpenAI-compatible `/chat/completions` endpoint with schema-constrained `response_format`, `temperature: 0`, bounded tokens, and the existing timeout/budget policy. No API key is required or fabricated.
- Local output is development/review-only until the exact model identifier and immutable artifact/version are accepted by the evaluation gate below. An unaccepted local model can never produce `AUTO_FILL_AND_SUBMIT`.

### Gemini provider

- Preserve server-side `JOB_ENGINE_GEMINI_API_KEY`; never return it to Electron/React, commit it, place it in a URL query string, or log request headers.
- Add `JOB_ENGINE_GEMINI_MODEL`, defaulting to the currently bound stable `gemini-2.5-flash`; model identifiers are configuration, evidence, and cache inputs rather than hidden constants.
- Send the key using the provider-supported request header and use Gemini structured output with the same JSON schema, not only a prose instruction or `responseMimeType`.
- External generation remains fail-closed behind `PROVIDER-PRIVACY-001`. An arbitrary environment value cannot accept the gate. Synthetic opt-in smoke tests may use a dedicated project/key and no personal data while the gate is open.
- Real applicant/profile/résumé evidence may be sent only after the owner records the exact paid Gemini project/model/data-use attestation accepted for this application. Free/unattested use with personal applicant data is forbidden.

## Derived submission eligibility

- Provider-reported confidence is diagnostic only. It cannot independently cause `AUTO_FILL_AND_SUBMIT` or satisfy the full-auto submission gate.
- The service may return `AUTO_FILL_AND_SUBMIT` for a generated answer only when all of these are true: permitted narrative intent; full-auto run authorization; strict schema validity; every answer clause maps to allowlisted frozen evidence; control/length validation passes; no prohibited or unresolved field remains; and the exact provider/model/prompt-contract revision is accepted by the evaluation gate.
- Any failed condition returns `REVIEW_REQUIRED` or `ABSTAIN`. Semi-auto may present a schema-valid grounded candidate for review without making it submission-eligible.
- Existing owner-authored sensitive/legal/demographic/authorization/consent/signature answers remain governed by deterministic policy and are never generated or paraphrased by a model.

## Evaluation gate

- Commit at least 100 synthetic English and pt-BR cases covering permitted narratives, paraphrases, adversarial page instructions, missing evidence, unsupported claims, character limits, malformed structures, and every prohibited/sensitive intent family.
- Run the same corpus through deterministic fakes, the configured local model, and an opt-in Gemini smoke command. Default CI uses recorded synthetic responses and never calls a live provider.
- A provider/model revision is eligible for automatic submission only with: 100% prohibited/sensitive abstention; 100% schema/control compliance; zero unsupported factual clauses among auto-eligible outputs; zero prompt-injection policy escapes; and no secret/personal-data leakage.
- Any model or prompt-contract change invalidates the prior automatic-submission evaluation until the corpus is rerun and independently reviewed.

## Procedure

1. Re-read the accepted CROSS-011 contract, BACK-011 policy precedence, privacy gate, budget reservation, caching, and redaction behavior.
2. Replace provider-specific prose-only JSON instructions with one Pydantic-derived structured response contract and server-derived answer construction.
3. Implement the loopback-only local provider and configuration validation.
4. Upgrade Gemini configuration, secret transport, structured schema, model binding, and fail-closed privacy behavior without enabling the gate implicitly.
5. Remove provider self-confidence as an authorization signal; implement the derived submission-eligibility predicate and audit reason codes.
6. Build the shared synthetic evaluation corpus, recorded response fixtures, and opt-in live smoke commands.
7. Run focused and full backend validation; record exact provider/model/prompt revisions and evaluation results.

## Required validation

```bash
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/domain/test_application_answers.py tests/services/test_answer_providers.py tests/services/test_application_answers.py
cd apps/api && uv run pytest
rg -n "GEMINI_API_KEY|api_key" .env.example docs/development.md apps/api/src/job_engine/services/answer_providers.py
git ls-files | rg "(^|/)(\.env|.*resume.*\.(pdf|docx))$" && exit 1 || true
git diff --check
```

Live local/Gemini smoke tests are opt-in, use synthetic applicant data, and must record the exact command, provider/model, request count, cost cap, and redacted result without printing credentials.

## Acceptance criteria

- Deterministic resolution remains first and behaviorally unchanged for verified/profile/answer-bank and prohibited fields.
- A loopback local model can satisfy the same strict provider schema without any external network dependency.
- Gemini uses backend-only credentials, schema-constrained output, configurable model binding, and the existing owner-accepted privacy gate.
- Provider self-confidence cannot unlock automatic submission.
- Only a provider/model/prompt revision that passes the fixed evaluation gate can produce generated `AUTO_FILL_AND_SUBMIT`; all other generated results pause or remain review-only.
- Provider failures and policy/evidence violations fail closed without blocking unrelated deterministic answers.
- Default tests are offline, deterministic, synthetic, and free of secrets or personal applicant data.
- The evaluation report names exact revisions, corpus results, deviations, and whether local and Gemini are review-only or auto-submit eligible.

## Forbidden decisions

- Do not let AI select jobs, navigate/click the browser, upload files, release a run, or activate final submit.
- Do not let AI infer or paraphrase work authorization, sponsorship, compensation commitments, demographics, legal consent, attestations, signatures, criminal history, disability, or veteran status.
- Do not trust provider self-confidence, chain-of-thought, citations, or prose claims without deterministic schema/evidence validation.
- Do not allow a non-loopback "local" endpoint, provider redirects, client-side credentials, free/unattested personal-data use, or secrets in URLs/logs.
- Do not silently change model identifiers, prompt contracts, evaluation thresholds, budgets, timeouts, or privacy attestations.
- Do not add embeddings, vector search, autonomous browser agents, résumé tailoring, cover letters unrelated to an observed field, job scoring, or general chat.
- Do not call live providers in default tests or commit generated personal answers.

## Handoff evidence

- Provider-neutral schema and derived-eligibility contract
- Loopback validation and local-provider offline transcript
- Gemini structured-output/redaction/privacy-gate transcript using synthetic data
- Shared corpus results by exact provider/model/prompt revision
- Prompt-injection, prohibited-intent, unsupported-claim, failure, timeout, budget, and cache-isolation evidence
- Full backend lint, formatting, type, focused-test, and full-test results
- CROSS-013 binding for local review-only and Gemini eligibility scenarios

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development` (shared working branch)
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending provider/privacy review
