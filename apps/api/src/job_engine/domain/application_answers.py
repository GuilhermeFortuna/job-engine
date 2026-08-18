from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal, Self
from uuid import UUID

from pydantic import field_validator, model_validator

from job_engine.domain.applicant import (
    DEMOGRAPHIC_INTENTS,
    LEGAL_CONSENT_INTENTS,
    FrozenModel,
    PolicyCategory,
    QuestionIntent,
)
from job_engine.domain.enums import (
    EmploymentType,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)

PROMPT_CONTRACT_VERSION = "1"

# Intents that may never be resolved by generative inference, regardless of
# policy category. A provider call is structurally unreachable for these.
NEVER_GENERATIVE_INTENTS: frozenset[QuestionIntent] = frozenset(
    LEGAL_CONSENT_INTENTS
    | DEMOGRAPHIC_INTENTS
    | {
        QuestionIntent.WORK_AUTHORIZATION,
        QuestionIntent.SPONSORSHIP_REQUIRED,
        QuestionIntent.COMPENSATION_EXPECTATION,
    }
)


class ControlType(StrEnum):
    TEXT = "text"
    TEXTAREA = "textarea"
    SINGLE_SELECT = "single_select"
    MULTI_SELECT = "multi_select"
    RADIO = "radio"
    CHECKBOX = "checkbox"
    FILE = "file"


class AnswerDecisionType(StrEnum):
    AUTO_FILL = "AUTO_FILL"
    AUTO_FILL_AND_SUBMIT = "AUTO_FILL_AND_SUBMIT"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    DECLINE_OPTIONAL = "DECLINE_OPTIONAL"
    ABSTAIN = "ABSTAIN"


class ReasonCode(StrEnum):
    EXACT_APPROVED_REUSABLE = "exact_approved_reusable"
    EXACT_VERIFIED_PROFILE = "exact_verified_profile"
    OPTIONAL_DECLINED = "optional_declined"
    GROUNDED_GENERATED = "grounded_generated"
    SENSITIVE_PROHIBITED = "sensitive_prohibited"
    UNRECOGNIZED_INTENT = "unrecognized_intent"
    NO_APPLICABLE_ANSWER = "no_applicable_answer"
    STALE_RUN_CONTEXT = "stale_run_context"
    OPTION_MISMATCH = "option_mismatch"
    INVALID_CONTROL_VALUE = "invalid_control_value"
    REQUIRED_VALUE_MISSING = "required_value_missing"
    PROVIDER_TIMEOUT = "provider_timeout"
    PROVIDER_LOW_CONFIDENCE = "provider_low_confidence"
    PROVIDER_INVALID_STRUCTURE = "provider_invalid_structure"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_BUDGET_EXHAUSTED = "provider_budget_exhausted"
    UNSUPPORTED_CLAIM_REJECTED = "unsupported_claim_rejected"
    CHARACTER_LIMIT_EXCEEDED = "character_limit_exceeded"
    PRIVACY_GATE_CLOSED = "privacy_gate_closed"


# Control types that permit omission when a question is optional and the
# owner has declined to answer it.
OMISSION_PERMITTING_CONTROLS: frozenset[ControlType] = frozenset(
    {ControlType.CHECKBOX, ControlType.SINGLE_SELECT, ControlType.RADIO}
)


class ObservationValidationConstraints(FrozenModel):
    """Allowlisted platform constraints only -- never raw arbitrary passthrough."""

    min_length: int | None = None
    max_length: int | None = None
    pattern: str | None = None

    @model_validator(mode="after")
    def validate_bounds(self) -> Self:
        if (
            self.min_length is not None
            and self.max_length is not None
            and self.min_length > self.max_length
        ):
            raise ValueError("min_length must not exceed max_length")
        return self


class QuestionObservation(FrozenModel):
    run_id: UUID
    adapter_id: str
    page_id: str
    field_fingerprint: str
    label: str
    accessible_name: str | None = None
    help_text: str | None = None
    required: bool
    control_type: ControlType
    options: tuple[str, ...] = ()
    validation_constraints: ObservationValidationConstraints | None = None

    @field_validator("field_fingerprint", "adapter_id", "page_id", "label")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("field must be non-empty")
        return stripped


class EvidenceReference(FrozenModel):
    source: Literal["profile", "resume", "answer_bank", "job"]
    reference: str

    @field_validator("reference")
    @classmethod
    def validate_reference(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("reference must be non-empty")
        return stripped


class AnswerDecision(FrozenModel):
    field_fingerprint: str
    decision: AnswerDecisionType
    answer: str | None = None
    policy_category: PolicyCategory
    confidence: float
    evidence: tuple[EvidenceReference, ...] = ()
    reason_code: ReasonCode

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, value: float) -> float:
        if not (0.0 <= value <= 1.0):
            raise ValueError("confidence must be between 0.0 and 1.0")
        return value

    @model_validator(mode="after")
    def validate_decision_invariants(self) -> Self:
        if self.decision in {
            AnswerDecisionType.AUTO_FILL,
            AnswerDecisionType.AUTO_FILL_AND_SUBMIT,
        }:
            if self.answer is None:
                raise ValueError(f"{self.decision.value} requires a non-None answer")
            if not self.evidence:
                raise ValueError(
                    f"{self.decision.value} requires at least one evidence reference"
                )
        if (
            self.decision == AnswerDecisionType.AUTO_FILL_AND_SUBMIT
            and self.confidence < 0.85
        ):
            raise ValueError("AUTO_FILL_AND_SUBMIT requires confidence >= 0.85")
        if self.decision in {
            AnswerDecisionType.REVIEW_REQUIRED,
            AnswerDecisionType.ABSTAIN,
        }:
            if self.answer is not None:
                raise ValueError(f"{self.decision.value} must not carry an answer")
        if (
            self.decision == AnswerDecisionType.DECLINE_OPTIONAL
            and self.answer is not None
        ):
            raise ValueError("DECLINE_OPTIONAL must not carry an answer")
        return self


class IntentClassification(FrozenModel):
    """Internal classification result. `intent=None` is the explicit unknown
    state and must never be coerced into NARRATIVE."""

    intent: QuestionIntent | None
    matched_rule: str | None = None
    sensitive_hint: bool = False


class EmploymentEvidenceEntry(FrozenModel):
    company: str
    title: str
    is_current: bool = False


class JobEvidence(FrozenModel):
    """Typed, allowlisted subset of job-catalog facts. Never the raw
    description or arbitrary page text."""

    job_id: UUID
    title: str
    seniority: Seniority
    employment_type: EmploymentType
    remote_status: RemoteStatus
    technologies: tuple[str, ...] = ()
    eligible_regions: tuple[LocationEligibilityRegion, ...] = ()
    location_eligibility_unknown: bool = True
    evidence_hash: str = ""

    @model_validator(mode="after")
    def compute_evidence_hash(self) -> Self:
        if self.evidence_hash:
            return self
        canonical = json.dumps(
            {
                "job_id": str(self.job_id),
                "title": self.title,
                "seniority": self.seniority.value,
                "employment_type": self.employment_type.value,
                "remote_status": self.remote_status.value,
                "technologies": sorted(self.technologies),
                "eligible_regions": sorted(r.value for r in self.eligible_regions),
                "location_eligibility_unknown": self.location_eligibility_unknown,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        object.__setattr__(
            self, "evidence_hash", hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        )
        return self


class GroundedContext(FrozenModel):
    """Typed context assembled from allowlisted applicant facts and job
    evidence before any provider call. Job text and page text are treated as
    untrusted data here, never as instructions."""

    question_label: str
    question_help_text: str | None = None
    control_type: ControlType
    options: tuple[str, ...] = ()
    max_length: int | None = None
    headline: str | None = None
    summary: str | None = None
    skills: tuple[str, ...] = ()
    employment_history: tuple[EmploymentEvidenceEntry, ...] = ()
    job_evidence: JobEvidence


class ProviderResultClaim(FrozenModel):
    text: str
    evidence: tuple[EvidenceReference, ...]


class ProviderResult(FrozenModel):
    answer: str
    confidence: float
    claims: tuple[ProviderResultClaim, ...] = ()
    provider: str
    model: str

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, value: float) -> float:
        if not (0.0 <= value <= 1.0):
            raise ValueError("confidence must be between 0.0 and 1.0")
        return value

    @field_validator("answer")
    @classmethod
    def validate_answer_non_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("answer must be non-empty")
        return value


class ProviderTimeoutError(Exception):
    """Provider call exceeded its strict timeout."""


class ProviderUnavailableError(Exception):
    """Provider call failed (rate limit, credentials, transport, etc.)."""


class ProviderInvalidStructureError(Exception):
    """Provider response failed structured-output validation."""


class ProviderBudgetExhaustedError(Exception):
    """A durable per-run or per-batch cost/attempt cap denied this call."""


class PrivacyGateClosedError(Exception):
    """PROVIDER-PRIVACY-001 is not accepted for the configured provider."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


# --- Intent classification -------------------------------------------------

# Ordered (intent, patterns) pairs. English and Portuguese (pt-BR) paraphrase
# coverage. Order matters: more specific intents are checked before generic
# ones so e.g. "sponsorship" is not misread as generic "authorization".
_INTENT_PATTERNS: tuple[tuple[QuestionIntent, tuple[str, ...]], ...] = (
    (
        QuestionIntent.SPONSORSHIP_REQUIRED,
        (
            r"sponsor(ship)?",
            r"visa sponsorship",
            r"patroc[ií]nio de visto",
            r"precisa(r)? de patroc[ií]nio",
        ),
    ),
    (
        QuestionIntent.WORK_AUTHORIZATION,
        (
            r"authoriz(ed|ation) to work",
            r"legally (authorized|eligible) to work",
            r"eligib(le|ility) to work",
            r"autoriza[cç][aã]o para trabalhar",
            r"permiss[aã]o de trabalho",
        ),
    ),
    (
        QuestionIntent.NOTICE_PERIOD,
        (r"notice period", r"per[ií]odo de aviso pr[eé]vio", r"aviso pr[eé]vio"),
    ),
    (
        QuestionIntent.NARRATIVE,
        (
            r"why (are you interested|do you want|this role|this company)",
            r"what makes you (a |an )?(good|great|strong) fit",
            r"describe your .{0,80}(experience|background|qualifications)",
            r"por que (voc[eê] quer|tem interesse)",
        ),
    ),
    (
        QuestionIntent.AVAILABILITY_DATE,
        (
            r"available (to )?start",
            r"start date",
            r"data de in[ií]cio",
            r"disponibilidade para come[cç]ar",
        ),
    ),
    (
        QuestionIntent.COMPENSATION_EXPECTATION,
        (
            r"salary expectation",
            r"compensation expectation",
            r"desired salary",
            r"pretens[aã]o salarial",
            r"expectativa salarial",
        ),
    ),
    (
        QuestionIntent.RELOCATION,
        (
            r"willing to relocate",
            r"relocation",
            r"disposto a se mudar",
            r"mudan[cç]a de cidade",
        ),
    ),
    (
        QuestionIntent.TRAVEL,
        (r"willing to travel", r"travel percentage", r"disposto a viajar"),
    ),
    (
        QuestionIntent.LOCATION_PREFERENCE,
        (
            r"current location",
            r"where are you (currently )?located",
            r"localiza[cç][aã]o atual",
        ),
    ),
    (
        QuestionIntent.GENDER,
        (r"\bgender\b", r"\bg[eê]nero\b"),
    ),
    (
        QuestionIntent.RACE_ETHNICITY,
        (r"race", r"ethnicity", r"ra[cç]a", r"etnia"),
    ),
    (
        QuestionIntent.VETERAN_STATUS,
        (r"veteran status", r"status de veterano"),
    ),
    (
        QuestionIntent.DISABILITY_STATUS,
        (r"disability status", r"disabilit(y|ies)", r"defici[eê]ncia"),
    ),
    (
        QuestionIntent.BACKGROUND_CHECK_CONSENT,
        (r"background check", r"verifica[cç][aã]o de antecedentes"),
    ),
    (
        QuestionIntent.ARBITRATION_CONSENT,
        (r"arbitration agreement", r"acordo de arbitragem"),
    ),
    (
        QuestionIntent.PRIVACY_CONSENT,
        (
            r"privacy policy",
            r"consent to (the )?processing",
            r"pol[ií]tica de privacidade",
        ),
    ),
    (
        QuestionIntent.EXPORT_CONTROL,
        (r"export control", r"itar", r"controle de exporta[cç][aã]o"),
    ),
    (
        QuestionIntent.CONFLICT_OF_INTEREST,
        (r"conflict of interest", r"conflito de interesses"),
    ),
    (
        QuestionIntent.LEGAL_ATTESTATION,
        (
            r"certify that",
            r"under penalty of perjury",
            r"terms and conditions",
            r"declaro que",
        ),
    ),
    (
        QuestionIntent.SIGNATURE,
        (r"electronic signature", r"sign(ature)?\b", r"assinatura"),
    ),
)

_SENSITIVE_UNMATCHED_HINTS: tuple[str, ...] = (
    r"legal",
    r"consent",
    r"attest",
    r"criminal",
    r"convicted",
    r"demograph",
)


def classify_question(observation: QuestionObservation) -> IntentClassification:
    """Conservative closed-enum intent classification. Returns
    intent=None on any non-exact/ambiguous match rather than guessing;
    an unresolved classification can never reach the narrative provider
    branch of the policy engine."""
    haystack = " ".join(
        part
        for part in (
            observation.label,
            observation.accessible_name,
            observation.help_text,
        )
        if part
    ).lower()

    for intent, patterns in _INTENT_PATTERNS:
        for pattern in patterns:
            if re.search(pattern, haystack, flags=re.IGNORECASE):
                return IntentClassification(
                    intent=intent,
                    matched_rule=pattern,
                    sensitive_hint=intent in NEVER_GENERATIVE_INTENTS,
                )

    sensitive_hint = any(
        re.search(pattern, haystack, flags=re.IGNORECASE)
        for pattern in _SENSITIVE_UNMATCHED_HINTS
    )
    if sensitive_hint:
        return IntentClassification(intent=None, matched_rule=None, sensitive_hint=True)

    # Unknown is an explicit fail-closed state. Narrative generation is only
    # permitted when a question positively matches the closed taxonomy above.
    return IntentClassification(intent=None, matched_rule=None, sensitive_hint=False)


# --- Policy precedence ------------------------------------------------------


def evaluate_policy(
    classification: IntentClassification,
    observation: QuestionObservation,
    *,
    has_approved_reusable: bool,
    has_verified_profile: bool,
    owner_declined: bool,
) -> PolicyCategory:
    """Ordered policy-precedence evaluation. Steps 1-6 of the BACK-011
    contract. Returns the PolicyCategory only -- the service layer resolves
    the actual answer/decision using this category."""

    intent = classification.intent

    # Exact owner-authored answers are permitted for non-generative sensitive
    # categories (including demographic/EEO), but those categories may never
    # fall through to provider generation.
    if intent in NEVER_GENERATIVE_INTENTS and has_approved_reusable:
        return PolicyCategory.APPROVED_REUSABLE

    # Step 1: prohibited / unrecognized sensitive-legal-consent intent.
    if intent is None or intent in NEVER_GENERATIVE_INTENTS:
        if intent in LEGAL_CONSENT_INTENTS or intent in DEMOGRAPHIC_INTENTS:
            if intent in DEMOGRAPHIC_INTENTS and owner_declined:
                return PolicyCategory.DECLINE_OPTIONAL
            return PolicyCategory.PROHIBITED_AUTOMATION
        if intent in {
            QuestionIntent.WORK_AUTHORIZATION,
            QuestionIntent.SPONSORSHIP_REQUIRED,
            QuestionIntent.COMPENSATION_EXPECTATION,
        }:
            if has_verified_profile:
                return PolicyCategory.VERIFIED_PROFILE
            if has_approved_reusable:
                return PolicyCategory.APPROVED_REUSABLE
            return PolicyCategory.REVIEW_REQUIRED
        # intent is None: unrecognized/ambiguous, with or without a
        # sensitive hint -- never auto-generate.
        return PolicyCategory.REVIEW_REQUIRED

    # Step 2: exact scoped approved-reusable answer.
    if has_approved_reusable:
        return PolicyCategory.APPROVED_REUSABLE

    # Step 3: exact verified-profile mapping.
    if has_verified_profile:
        return PolicyCategory.VERIFIED_PROFILE

    # Step 4: optional owner-declined question.
    if (
        not observation.required
        and owner_declined
        and observation.control_type in OMISSION_PERMITTING_CONTROLS
    ):
        return PolicyCategory.DECLINE_OPTIONAL

    # Step 5: permitted narrative question.
    if intent == QuestionIntent.NARRATIVE:
        return PolicyCategory.GROUNDED_GENERATED

    # Step 6: anything else.
    return PolicyCategory.REVIEW_REQUIRED


# --- Control compatibility --------------------------------------------------


def validate_control_compatibility(
    observation: QuestionObservation, answer: str | None
) -> ReasonCode | None:
    """Returns None if the answer is compatible with the observed control,
    otherwise the ReasonCode explaining the rejection. A required control may
    never resolve to omission or an empty answer."""
    if observation.control_type == ControlType.FILE:
        return ReasonCode.INVALID_CONTROL_VALUE

    if answer is None or not answer.strip():
        if observation.required:
            return ReasonCode.REQUIRED_VALUE_MISSING
        return None

    normalized_options = {opt.strip().lower() for opt in observation.options}

    if observation.control_type in (ControlType.SINGLE_SELECT, ControlType.RADIO):
        if normalized_options and answer.strip().lower() not in normalized_options:
            return ReasonCode.OPTION_MISMATCH
        return None

    if observation.control_type == ControlType.MULTI_SELECT:
        selected = {part.strip().lower() for part in answer.split(",") if part.strip()}
        if normalized_options and not selected.issubset(normalized_options):
            return ReasonCode.OPTION_MISMATCH
        return None

    if observation.control_type == ControlType.CHECKBOX:
        if answer.strip().lower() not in {"true", "false", "yes", "no"}:
            return ReasonCode.INVALID_CONTROL_VALUE
        return None

    if observation.control_type in (ControlType.TEXT, ControlType.TEXTAREA):
        constraints = observation.validation_constraints
        if constraints is not None:
            if (
                constraints.min_length is not None
                and len(answer) < constraints.min_length
            ):
                return ReasonCode.INVALID_CONTROL_VALUE
            if (
                constraints.max_length is not None
                and len(answer) > constraints.max_length
            ):
                return ReasonCode.CHARACTER_LIMIT_EXCEEDED
            if constraints.pattern is not None and not re.fullmatch(
                constraints.pattern, answer
            ):
                return ReasonCode.INVALID_CONTROL_VALUE
        return None

    return None
