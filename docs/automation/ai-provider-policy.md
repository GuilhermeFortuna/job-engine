# AI Answer Provider Policy and Operational Specification

## 1. Executive Summary

This document defines the operational policy, security architecture, and evaluation gates governing automated question answering within the Job Engine application engine.

The engine implements a hybrid, fail-closed architecture that strictly separates:
1. **Deterministic Resolution**: Exact owner-authored reusable answers and verified profile attributes (zero network calls).
2. **Grounded Narrative Generation**: Bounded narrative synthesis for permitted open-ended questions using structured evidence claims.
3. **Owner Evaluation Gate**: Explicit owner acceptance of evaluated `(provider, model, prompt_contract_version)` revisions before any generated answer becomes eligible for automated submission (`AUTO_FILL_AND_SUBMIT`).

---

## 2. Supported Answer Providers

| Provider | Transport / Protocol | Authentication | Privacy Gate Gatekeeper | Intended Environment |
|---|---|---|---|---|
| `deterministic` | Offline / Zero network | None | None (Always Allowed) | Production & CI baseline |
| `local` | Loopback HTTP (`/chat/completions`) | None (Loopback only) | Bypasses `PROVIDER-PRIVACY-001` | Local Development & Evaluation |
| `gemini` | HTTPS (`generateContent`) | Header (`x-goog-api-key`) | Gated by `PROVIDER-PRIVACY-001` | Cloud Production & Staging |

> **Owner Decision (2026-08-20):** `openai` is retired. Supported providers are strictly `deterministic`, `local`, and `gemini`. Gemini is the sole cloud provider.

### 2.1 Deterministic Provider (`deterministic`)
- Returns `ProviderUnavailableError` if called to generate narrative text, triggering deterministic abstention (`ABSTAIN` / `REVIEW_REQUIRED`).
- Never performs network I/O or token consumption.

### 2.2 Local Provider (`local`)
- Designed for local testing and developer benchmarking using local model runners (e.g. Ollama, vLLM, llama.cpp).
- **Loopback Enforcement**: Base URL must resolve strictly to a loopback interface (`localhost`, `127.0.0.0/8`, or `::1`). Non-loopback IPs and arbitrary domain names are rejected at configuration time and instantiation.
- **Credential Protection**: Base URLs with embedded username/passwords (`http://user:pass@127.0.0.1`) are strictly rejected.
- **Redirect Refusal**: The HTTP client enforces `follow_redirects=False`. Any 3xx redirect status raises `ProviderUnavailableError` without following the redirect.
- **Privacy Gate Bypass**: Because data remains strictly on the local machine loopback, `local` bypasses the `PROVIDER-PRIVACY-001` attestation check.
- **Structured Wire Protocol**: Sends OpenAI-compatible structured schema parameters via `response_format` with `json_schema`.

### 2.3 Gemini Provider (`gemini`)
- Communicates with Google Generative AI REST API (`https://generativelanguage.googleapis.com/v1beta`).
- **Header Authentication**: API key is transmitted exclusively via the `x-goog-api-key` HTTP request header. The API key is **never** passed as a URL query parameter (`?key=...`), preventing leakage in proxy logs, access logs, and HTTP tracebacks.
- **Structured Wire Protocol**: Uses `generationConfig.responseMimeType = "application/json"` and `generationConfig.responseSchema`.
- **Privacy Gate Gatekeeper**: Because data is transmitted over the internet to a third-party cloud service, instantiation fails closed with `PrivacyGateClosedError` unless:
  1. `JOB_ENGINE_PROVIDER_PRIVACY_ATTESTATION_ID` matches an ID recorded in `ACCEPTED_PROVIDER_PRIVACY_ATTESTATIONS`.
  2. `JOB_ENGINE_GEMINI_API_KEY` is present and non-empty.

---

## 3. Grounded Answer Synthesis & Validation

```mermaid
flowchart TD
    Obs[Question Observation] --> Classify[Classify Intent & Evaluate Policy]
    Classify --> Policy{Policy Category}
    Policy -- PROHIBITED_AUTOMATION --> ReviewReq[REVIEW_REQUIRED: sensitive_prohibited]
    Policy -- VERIFIED_PROFILE / APPROVED_REUSABLE --> DetFinalize[Deterministic Exact Answer]
    Policy -- GROUNDED_GENERATED --> CacheCheck{In Cache?}
    CacheCheck -- Hit --> CacheVal[Validate Control & Confidence]
    CacheCheck -- Miss --> Reserve[Reserve Provider Budget]
    Reserve --> ProvCall[Provider.generate]
    ProvCall --> ClaimVal[Server _validate_grounded_claims]
    ClaimVal -- Invalid Claims --> AbstainClaim[ABSTAIN: unsupported_claim_rejected]
    ClaimVal -- Valid --> DeriveText[Derive answer_text from claims]
    DeriveText --> CtrlVal[Validate Control & Max Length]
    CtrlVal -- Invalid Control / Length --> AbstainCtrl[ABSTAIN: mismatch / character_limit]
    CtrlVal -- Valid --> ConfCheck{Confidence >= Threshold?}
    ConfCheck -- No (< 0.85) --> LowConf[REVIEW_REQUIRED: provider_low_confidence]
    ConfCheck -- Yes (>= 0.85) --> DerivElig[Server _derive_decision_type]
    CacheVal --> DerivElig
    DerivElig --> EvalCheck{Full Auto Auth AND Accepted Revision?}
    EvalCheck -- Yes --> AutoSubmit[AUTO_FILL_AND_SUBMIT]
    EvalCheck -- No --> AutoFill[AUTO_FILL for Review]
```

### 3.1 Server-Derived Answer Construction
- Providers are constrained to return structured claims:
  ```json
  {
    "claims": [
      {
        "text": "I bring extensive experience in backend Python engineering.",
        "evidence_sources": ["profile:skills"]
      }
    ],
    "confidence": 0.95
  }
  ```
- The server constructs the final answer by joining claim texts:
  $$\text{derived\_answer} = \text{" ".join}(c.\text{text.strip()} \text{ for } c \in \text{result.claims})$$
- The raw prose is never taken directly from an untrusted narrative string.

### 3.2 Grounded Claim Invariants (`_validate_grounded_claims`)
1. `claims` must be a non-empty list.
2. Every claim `text` must be non-empty and non-whitespace.
3. Duplicate claims (case-insensitive normalized) are rejected.
4. Every claim must have at least one valid `EvidenceReference` (`source:reference`).
5. All evidence references must belong to the frozen context allowlist:
   - `job:<job_id>`
   - `profile:headline` (if headline is present)
   - `profile:summary` (if summary is present)
   - `profile:skills` (if skills are present)
   - `profile:employment_history` (if employment history is present)
6. If any claim references unallowlisted evidence, the answer is rejected with `ABSTAIN` and `ReasonCode.UNSUPPORTED_CLAIM_REJECTED`.

### 3.3 Control Compatibility & Length Validation
- Control validation (`validate_control_compatibility`) and character length bounds (`max_length`) are evaluated against the server-derived text.
- If character limit is exceeded, returns `ABSTAIN` with `ReasonCode.CHARACTER_LIMIT_EXCEEDED`.
- If control type is mismatched, returns `ABSTAIN` with matching control mismatch reason code.

---

## 4. Single Server-Side Eligibility Derivation (`_derive_decision_type`)

Automated submission eligibility (`AUTO_FILL_AND_SUBMIT`) is derived strictly on the server through a unified helper called identically across fresh generations and cache hits:

```python
def _derive_decision_type(
    self,
    context: AuthorizedRunAnswerContext,
    provider: str,
    model: str,
    prompt_version: str,
) -> AnswerDecisionType:
    if (
        context.run.automatic_submission_authorized
        and is_evaluation_accepted(
            provider, model, prompt_version, self._accepted_revisions
        )
    ):
        return AnswerDecisionType.AUTO_FILL_AND_SUBMIT

    return AnswerDecisionType.AUTO_FILL
```

### 4.1 Evaluation Acceptance Gate (`ACCEPTED_AUTO_SUBMIT_REVISIONS`)
- The tuple `(provider, model, prompt_contract_version)` must be explicitly recorded in `ACCEPTED_AUTO_SUBMIT_REVISIONS`.
- **Initial Shipment State**: `ACCEPTED_AUTO_SUBMIT_REVISIONS = frozenset()`.
- No provider or model is eligible for automated submission on initial release until the owner conducts formal evaluation and records acceptance.
- On unaccepted revisions in `FULL_AUTO` mode or when automatic submission is not authorized, the engine returns `AUTO_FILL` presenting the candidate answer for review, avoiding silent automated submission.

### 4.2 Low-Confidence Review Pause
- If `result.confidence < settings.answer_auto_submit_confidence_threshold` (default `0.85`):
  - Returns `REVIEW_REQUIRED` with `ReasonCode.PROVIDER_LOW_CONFIDENCE`.
  - No answer text or evidence is attached to the decision.
- `confidence` is diagnostic and gates review pauses; it never directly authorizes submission.

---

## 5. Security & Privacy Constraints

1. **Secret Masking**: `JOB_ENGINE_GEMINI_API_KEY` is wrapped in Pydantic `SecretStr`. It is never printed in logs or serialized in error messages.
2. **Log Redaction**: Grounded answer text and candidate strings are excluded from structured log statements (`job_engine.application_answers`). Logs record only fingerprints, decision types, policy categories, reason codes, and confidence scores.
3. **No Cross-Provider Fallback**: A provider timeout or network unavailability abstains immediately (`ABSTAIN` with `ReasonCode.PROVIDER_TIMEOUT` or `ReasonCode.PROVIDER_UNAVAILABLE`) with zero cross-provider network calls.
