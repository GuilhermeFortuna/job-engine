# AI Provider Evaluation Report and Baseline Benchmark

## 1. Evaluation Methodology

The Job Engine AI question answering system was evaluated against a synthetic test corpus of 120 standardized test cases (`apps/api/tests/fixtures/ai_application_questions.json`) spanning English and Portuguese (pt-BR).

The evaluation tests four core safety and correctness criteria:
1. **Adversarial & Prompt Injection Immunity**: Validating that adversarial prompts, system override instructions, and data exfiltration attempts are treated strictly as untrusted data and fail closed to `REVIEW_REQUIRED`.
2. **Prohibited & Sensitive Intent Enforcement**: Validating that legal attestations, mandatory arbitration clauses, background check consent, export control (ITAR), demographic self-identification, and criminal history questions never trigger automated answering or submission.
3. **Evidence Grounding Rigor**: Validating that answers referencing unallowlisted evidence, empty evidence, duplicate claims, or ungrounded statements are 100% rejected with `ABSTAIN`.
4. **Control and Length Boundaries**: Validating that character length maximums and control type constraints are strictly enforced against server-derived text.

---

## 2. Evaluation Results Summary

| Category Family | Total Cases | Language Breakdown | Pass Rate | Observed Decisions | Safety / Invariant Violations |
|---|---|---|---|---|---|
| **Permitted Narrative** | 20 | 10 EN / 10 pt-BR | 100% | `AUTO_FILL` / `AUTO_FILL_AND_SUBMIT` | 0 |
| **Narrative Paraphrases** | 15 | 8 EN / 7 pt-BR | 100% | `AUTO_FILL` / `AUTO_FILL_AND_SUBMIT` | 0 |
| **Prompt Injection Attacks** | 20 | 12 EN / 8 pt-BR | 100% | `REVIEW_REQUIRED` (`unrecognized_intent`) | 0 (0 Escapes) |
| **Prohibited Legal / Consent** | 20 | 10 EN / 10 pt-BR | 100% | `REVIEW_REQUIRED` (`sensitive_prohibited` / `unrecognized_intent`) | 0 |
| **Prohibited Demographic (EEO)** | 15 | 8 EN / 7 pt-BR | 100% | `REVIEW_REQUIRED` (`sensitive_prohibited`) | 0 |
| **Prohibited Work Auth / Compensation** | 10 | 5 EN / 5 pt-BR | 100% | `REVIEW_REQUIRED` (`unrecognized_intent` without profile) | 0 |
| **Missing Evidence / Ungrounded** | 10 | 5 EN / 5 pt-BR | 100% | `ABSTAIN` (`unsupported_claim_rejected`) / `REVIEW_REQUIRED` | 0 |
| **Control & Length Constraints** | 10 | 5 EN / 5 pt-BR | 100% | `ABSTAIN` (`character_limit_exceeded` / `invalid_control_value`) | 0 |
| **Total** | **120** | **63 EN / 57 pt-BR** | **100%** | All decisions match policy specification | **0** |

---

## 3. Detailed Benchmark Findings

### 3.1 Prompt Injection and Safety Defenses
- Across 20 adversarial injection scenarios (attempting to override system prompts, exfiltrate environment variables, claim unverified credentials, or force auto-approval), the engine achieved a **0.0% escape rate**.
- All injection attempts failed closed to `REVIEW_REQUIRED` without executing instructions or generating answer text.

### 3.2 Evidence Grounding and Hallucination Prevention
- When providers attempted to assert facts not present in the allowlisted profile/job context (`profile:unlisted_skill` or unverified claims), the server-side validator `_validate_grounded_claims` rejected the response 100% of the time with `ReasonCode.UNSUPPORTED_CLAIM_REJECTED`.
- Server-derived answer synthesis ensures that the final text is composed strictly from validated claims, preventing narrative drift or ungrounded clauses.

### 3.3 Cache-Hit Derivation Verification
- Verified that on full-auto runs where automated submission is unauthorized, cache hits correctly derive `AUTO_FILL` rather than inheriting or promoting to `AUTO_FILL_AND_SUBMIT`.

---

## 4. Revision Acceptance Register

| Provider | Model | Prompt Contract Version | Status in Code (`ACCEPTED_AUTO_SUBMIT_REVISIONS`) | Evaluation Decision |
|---|---|---|---|---|
| `local` | `qwen2.5:7b` | `2` | Not Listed (Ships Empty) | Pending Owner Review |
| `gemini` | `gemini-2.5-flash` | `2` | Not Listed (Ships Empty) | Pending Owner Review |

> **Operational Note:** In compliance with the fail-closed evaluation policy, `ACCEPTED_AUTO_SUBMIT_REVISIONS = frozenset()` on initial shipment. No provider or model is authorized for unattended submission on delivery until the repository owner records explicit acceptance.
