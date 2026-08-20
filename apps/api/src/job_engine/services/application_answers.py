from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from job_engine.config import Settings
from job_engine.domain.applicant import (
    ApplicantProfile,
    PolicyCategory,
    QuestionIntent,
    ResumeAsset,
    ReusableAnswer,
    ValueState,
)
from job_engine.domain.application_answers import (
    NEVER_GENERATIVE_INTENTS,
    PROMPT_CONTRACT_VERSION,
    AnswerDecision,
    AnswerDecisionType,
    EmploymentEvidenceEntry,
    EvidenceReference,
    GroundedContext,
    JobEvidence,
    PrivacyGateClosedError,
    ProviderBudgetExhaustedError,
    ProviderInvalidStructureError,
    ProviderResult,
    ProviderTimeoutError,
    ProviderUnavailableError,
    QuestionObservation,
    ReasonCode,
    classify_question,
    evaluate_policy,
    is_evaluation_accepted,
    validate_control_compatibility,
)
from job_engine.domain.applications import (
    ApplicationRun,
    ApplicationRunStatus,
    AutomationMode,
    ExceptionStatus,
    calculate_answer_bank_hash,
    calculate_token_hash,
)
from job_engine.domain.jobs import JobGroup
from job_engine.services.answer_providers import (
    AnswerProvider,
    build_provider,
)

_logger = logging.getLogger("job_engine.application_answers")

_ANSWER_MAX_LENGTH_DEFAULT = 2000


class RunAuthorizationError(Exception):
    """Base class for run/lease/snapshot authorization failures."""


class ApplicationRunNotFoundError(RunAuthorizationError):
    pass


class LeaseInvalidOrExpiredError(RunAuthorizationError):
    pass


class StaleRunContextError(RunAuthorizationError):
    """A persisted snapshot (profile/resume/answer-bank/job) no longer
    matches the run's bound versions. Fails the whole request closed."""


@dataclass(frozen=True)
class AuthorizedRunAnswerContext:
    """Assembled server-side after runner authorization. The runner request
    supplies observations only -- it can never override profile facts,
    resume identity, answer-bank contents, job evidence, adapter ID,
    automation mode, versions, hashes, or policy snapshots."""

    run: ApplicationRun
    profile: ApplicantProfile
    resume: ResumeAsset
    answer_bank: tuple[ReusableAnswer, ...]
    job_evidence: JobEvidence


@dataclass(frozen=True)
class OwnerResolvedAnswer:
    exception_id: UUID
    field_fingerprint: str
    label: str
    control_type: str
    answer_text: str
    question_intent: QuestionIntent | None


def authorize_run_for_answers(
    run: ApplicationRun | None,
    raw_lease_token: str,
    *,
    profile: ApplicantProfile | None,
    resume: ResumeAsset | None,
    answer_bank: tuple[ReusableAnswer, ...],
    job_evidence: JobEvidence,
) -> AuthorizedRunAnswerContext:
    """Read-only authorization + snapshot validation. Mirrors the lease
    validity predicate BACK-010 enforces inline in ApplicationRepository's
    mutating methods (status in {claimed, running}, hash match, non-expired
    lease) without extending the lease or appending any event."""
    if run is None:
        raise ApplicationRunNotFoundError("Application run not found")

    lease_token_hash = calculate_token_hash(raw_lease_token)
    now = datetime.now(UTC)
    if (
        run.status not in (ApplicationRunStatus.CLAIMED, ApplicationRunStatus.RUNNING)
        or run.lease_token_hash != lease_token_hash
        or run.lease_expires_at is None
        or run.lease_expires_at < now
    ):
        raise LeaseInvalidOrExpiredError(f"Valid lease not held for run {run.id}")

    if profile is None or profile.version != run.applicant_profile_version:
        raise StaleRunContextError(
            f"Applicant profile version mismatch for run {run.id}"
        )

    if resume is None or resume.sha256 != run.resume_sha256:
        raise StaleRunContextError(f"Resume asset checksum mismatch for run {run.id}")

    answers_by_id = {answer.answer_id: answer for answer in answer_bank}
    snapshot_answers: list[ReusableAnswer] = []
    for answer_id, expected_version in run.answer_bank_snapshot.items():
        answer = answers_by_id.get(answer_id)
        if answer is None or answer.version != expected_version:
            raise StaleRunContextError(
                f"Answer bank snapshot mismatch for run {run.id}"
            )
        snapshot_answers.append(answer)
    if calculate_answer_bank_hash(run.answer_bank_snapshot) != run.answer_bank_hash:
        raise StaleRunContextError(f"Answer bank hash mismatch for run {run.id}")

    return AuthorizedRunAnswerContext(
        run=run,
        profile=profile,
        resume=resume,
        answer_bank=tuple(snapshot_answers),
        job_evidence=job_evidence,
    )


def _owner_resolved_answer(
    run: ApplicationRun, observation: QuestionObservation
) -> OwnerResolvedAnswer | None:
    """Return the latest exact per-run owner answer for this observed field.

    Matching includes the fingerprint and stable visible identity. A resolution
    from another run, another field, or a materially changed observation is not
    eligible for reuse.
    """
    for exception in reversed(run.exceptions):
        if (
            exception.status != ExceptionStatus.RESOLVED
            or exception.resolution_payload is None
        ):
            continue
        raw_answers = exception.resolution_payload.get("owner_answers")
        if not isinstance(raw_answers, list):
            continue
        for raw in raw_answers:
            if not isinstance(raw, dict):
                continue
            if raw.get("field_fingerprint") != observation.field_fingerprint:
                continue
            if raw.get("label") != observation.label:
                continue
            if raw.get("control_type") != observation.control_type.value:
                continue
            answer_text = raw.get("answer_text")
            if not isinstance(answer_text, str) or not answer_text.strip():
                continue
            intent_raw = raw.get("question_intent")
            intent = None
            try:
                if isinstance(intent_raw, str):
                    intent = QuestionIntent(intent_raw)
            except ValueError:
                intent = None
            return OwnerResolvedAnswer(
                exception_id=exception.id,
                field_fingerprint=observation.field_fingerprint,
                label=observation.label,
                control_type=observation.control_type.value,
                answer_text=answer_text,
                question_intent=intent,
            )
    return None


def build_job_evidence(job_group: JobGroup) -> JobEvidence:
    """Constructs the allowlisted JobEvidence from a catalog JobGroup."""
    return JobEvidence(
        job_id=job_group.id,
        title=job_group.title,
        seniority=job_group.seniority,
        employment_type=job_group.employment_type,
        remote_status=job_group.remote_status,
        technologies=tuple(t.term for t in job_group.technologies),
        eligible_regions=tuple(loc.region for loc in job_group.eligible_locations),
        location_eligibility_unknown=job_group.location_eligibility_unknown,
    )


# --- Answer bank / verified profile resolution ------------------------------

_VERIFIED_PROFILE_FIELD_BY_INTENT: dict[QuestionIntent, str] = {
    QuestionIntent.NOTICE_PERIOD: "notice_period_days",
    QuestionIntent.COMPENSATION_EXPECTATION: "compensation_expectation",
    QuestionIntent.LOCATION_PREFERENCE: "location_preferences",
    QuestionIntent.RELOCATION: "location_preferences",
    QuestionIntent.TRAVEL: "location_preferences",
    QuestionIntent.GENDER: "demographics",
    QuestionIntent.RACE_ETHNICITY: "demographics",
    QuestionIntent.VETERAN_STATUS: "demographics",
    QuestionIntent.DISABILITY_STATUS: "demographics",
}


def _format_field_value(intent: QuestionIntent, value: object) -> str:
    if intent == QuestionIntent.RELOCATION:
        return "Yes" if getattr(value, "will_relocate", False) else "No"
    if intent == QuestionIntent.TRAVEL:
        return str(getattr(value, "travel_percentage", 0))
    if intent == QuestionIntent.GENDER:
        return str(getattr(value, "gender", "") or "")
    if intent == QuestionIntent.RACE_ETHNICITY:
        return str(getattr(value, "race_ethnicity", "") or "")
    if intent == QuestionIntent.VETERAN_STATUS:
        return str(getattr(value, "veteran_status", "") or "")
    if intent == QuestionIntent.DISABILITY_STATUS:
        return str(getattr(value, "disability_status", "") or "")
    return str(value)


def _resolve_verified_profile(
    intent: QuestionIntent, profile: ApplicantProfile
) -> tuple[str, str] | None:
    field_path = _VERIFIED_PROFILE_FIELD_BY_INTENT.get(intent)
    if field_path is None:
        return None
    confirmed = getattr(profile, field_path)
    if confirmed.state != ValueState.PROVIDED:
        return None
    if confirmed.policy_category != PolicyCategory.VERIFIED_PROFILE:
        return None
    return _format_field_value(intent, confirmed.value), field_path


def _profile_owner_declined(intent: QuestionIntent, profile: ApplicantProfile) -> bool:
    field_path = _VERIFIED_PROFILE_FIELD_BY_INTENT.get(intent)
    if field_path is None:
        return False
    confirmed = getattr(profile, field_path)
    if confirmed.state == ValueState.DECLINED:
        return True
    if intent in {
        QuestionIntent.GENDER,
        QuestionIntent.RACE_ETHNICITY,
        QuestionIntent.VETERAN_STATUS,
        QuestionIntent.DISABILITY_STATUS,
    }:
        demographics = profile.demographics
        if demographics.state == ValueState.PROVIDED and demographics.value is not None:
            return bool(demographics.value.decline_all_optional)
    return False


def _resolve_approved_reusable(
    intent: QuestionIntent, adapter_id: str, answer_bank: tuple[ReusableAnswer, ...]
) -> ReusableAnswer | None:
    now = datetime.now(UTC)
    candidates = [
        a
        for a in answer_bank
        if a.question_intent == intent
        and a.policy_category == PolicyCategory.APPROVED_REUSABLE
        and not a.is_expired(now)
        and (a.platform_scope is None or a.platform_scope == adapter_id)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda a: a.platform_scope is None)
    return candidates[0]


# --- Cache -------------------------------------------------------------------


_CacheKey = tuple[str, int, int, str, str, str, str, str]


@dataclass
class _CachedAnswer:
    answer: str
    confidence: float
    evidence: tuple[EvidenceReference, ...]
    provider: str
    model: str
    prompt_contract_version: str


class ApplicationAnswerService:
    def __init__(
        self,
        settings: Settings,
        provider: AnswerProvider | None = None,
        budget_reserver: Callable[[UUID, Decimal], Awaitable[bool]] | None = None,
        accepted_auto_submit_revisions: frozenset[tuple[str, str, str]] | None = None,
    ) -> None:
        self._settings = settings
        self._provider = provider if provider is not None else build_provider(settings)
        self._cache: dict[_CacheKey, _CachedAnswer] = {}
        self._run_call_counts: dict[UUID, int] = {}
        self._budget_reserver = budget_reserver
        self._accepted_revisions = accepted_auto_submit_revisions

    async def _reserve_provider_call(self, run_id: UUID) -> bool:
        estimated_cost = self._settings.answer_provider_estimated_cost_per_call_usd
        if self._budget_reserver is not None:
            return await self._budget_reserver(run_id, estimated_cost)

        # Unit-test/direct-service fallback. Production API construction always
        # injects the durable PostgreSQL reservation boundary.
        used = self._run_call_counts.get(run_id, 0)
        if (
            used >= self._settings.answer_provider_max_calls_per_run
            or Decimal(used + 1) * estimated_cost
            > self._settings.answer_run_cost_cap_usd
        ):
            return False
        self._run_call_counts[run_id] = used + 1
        return True

    def _cache_key(
        self,
        observation: QuestionObservation,
        context: AuthorizedRunAnswerContext,
    ) -> _CacheKey:
        return (
            hashlib.sha256(
                json.dumps(
                    {
                        "label": observation.label.strip().lower(),
                        "accessible_name": observation.accessible_name,
                        "help_text": observation.help_text,
                        "control_type": observation.control_type.value,
                        "options": observation.options,
                        "validation_constraints": (
                            observation.validation_constraints.model_dump(mode="json")
                            if observation.validation_constraints
                            else None
                        ),
                    },
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest(),
            context.profile.version,
            context.resume.version,
            context.run.answer_bank_hash,
            context.job_evidence.evidence_hash,
            self._provider.provider_name,
            self._provider.model_name,
            PROMPT_CONTRACT_VERSION,
        )

    def _log_decision(self, decision: AnswerDecision) -> None:
        _logger.info(
            "answer_decision field_fingerprint=%s decision=%s policy_category=%s "
            "reason_code=%s confidence=%.2f",
            decision.field_fingerprint,
            decision.decision.value,
            decision.policy_category.value,
            decision.reason_code.value,
            decision.confidence,
        )

    async def decide(
        self,
        context: AuthorizedRunAnswerContext,
        observations: tuple[QuestionObservation, ...],
    ) -> tuple[AnswerDecision, ...]:
        decisions: list[AnswerDecision] = []
        for observation in observations:
            decision = await self._decide_one(context, observation)
            if (
                decision.question_intent is None
                and observation.run_id == context.run.id
                and observation.adapter_id == context.run.platform_adapter_id
            ):
                decision = decision.model_copy(
                    update={"question_intent": classify_question(observation).intent}
                )
            self._log_decision(decision)
            decisions.append(decision)
        return tuple(decisions)

    async def _decide_one(
        self,
        context: AuthorizedRunAnswerContext,
        observation: QuestionObservation,
    ) -> AnswerDecision:
        if (
            observation.run_id != context.run.id
            or observation.adapter_id != context.run.platform_adapter_id
        ):
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.ABSTAIN,
                policy_category=PolicyCategory.REVIEW_REQUIRED,
                confidence=0.0,
                reason_code=ReasonCode.STALE_RUN_CONTEXT,
            )

        owner_answer = _owner_resolved_answer(context.run, observation)
        if owner_answer is not None:
            mismatch = validate_control_compatibility(
                observation, owner_answer.answer_text
            )
            if mismatch is not None:
                return self._abstain(observation, mismatch)
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.AUTO_FILL,
                answer=owner_answer.answer_text,
                policy_category=PolicyCategory.REVIEW_REQUIRED,
                confidence=1.0,
                evidence=(
                    EvidenceReference(
                        source="owner_resolution",
                        reference=str(owner_answer.exception_id),
                    ),
                ),
                reason_code=ReasonCode.OWNER_CONFIRMED,
                question_intent=owner_answer.question_intent,
            )

        classification = classify_question(observation)

        approved = (
            _resolve_approved_reusable(
                classification.intent, observation.adapter_id, context.answer_bank
            )
            if classification.intent is not None
            else None
        )
        verified = (
            _resolve_verified_profile(classification.intent, context.profile)
            if classification.intent is not None
            else None
        )
        owner_declined = (
            _profile_owner_declined(classification.intent, context.profile)
            if classification.intent is not None
            else False
        )

        category = evaluate_policy(
            classification,
            observation,
            has_approved_reusable=approved is not None,
            has_verified_profile=verified is not None,
            owner_declined=owner_declined,
        )

        if category == PolicyCategory.PROHIBITED_AUTOMATION:
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.REVIEW_REQUIRED,
                policy_category=category,
                confidence=0.0,
                reason_code=ReasonCode.SENSITIVE_PROHIBITED,
            )

        if category == PolicyCategory.APPROVED_REUSABLE and approved is not None:
            return self._finalize_deterministic(
                observation,
                category,
                answer=approved.answer_text,
                evidence=(
                    EvidenceReference(source="answer_bank", reference=str(approved.id)),
                ),
                reason_code=ReasonCode.EXACT_APPROVED_REUSABLE,
                automation_mode=context.run.automation_mode,
            )

        if category == PolicyCategory.VERIFIED_PROFILE and verified is not None:
            answer_text, field_path = verified
            return self._finalize_deterministic(
                observation,
                category,
                answer=answer_text,
                evidence=(EvidenceReference(source="profile", reference=field_path),),
                reason_code=ReasonCode.EXACT_VERIFIED_PROFILE,
                automation_mode=context.run.automation_mode,
            )

        if category == PolicyCategory.DECLINE_OPTIONAL:
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.DECLINE_OPTIONAL,
                policy_category=category,
                confidence=1.0,
                reason_code=ReasonCode.OPTIONAL_DECLINED,
            )

        if category == PolicyCategory.GROUNDED_GENERATED:
            if classification.intent in NEVER_GENERATIVE_INTENTS:
                # Structurally unreachable given evaluate_policy, kept as a
                # defense-in-depth guard.
                return AnswerDecision(
                    field_fingerprint=observation.field_fingerprint,
                    decision=AnswerDecisionType.REVIEW_REQUIRED,
                    policy_category=PolicyCategory.REVIEW_REQUIRED,
                    confidence=0.0,
                    reason_code=ReasonCode.SENSITIVE_PROHIBITED,
                )
            return await self._generate(
                observation, context, automation_mode=context.run.automation_mode
            )

        return AnswerDecision(
            field_fingerprint=observation.field_fingerprint,
            decision=AnswerDecisionType.REVIEW_REQUIRED,
            policy_category=PolicyCategory.REVIEW_REQUIRED,
            confidence=0.0,
            reason_code=ReasonCode.UNRECOGNIZED_INTENT,
        )

    def _finalize_deterministic(
        self,
        observation: QuestionObservation,
        category: PolicyCategory,
        *,
        answer: str,
        evidence: tuple[EvidenceReference, ...],
        reason_code: ReasonCode,
        automation_mode: AutomationMode,
    ) -> AnswerDecision:
        mismatch = validate_control_compatibility(observation, answer)
        if mismatch is not None:
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.REVIEW_REQUIRED,
                policy_category=PolicyCategory.REVIEW_REQUIRED,
                confidence=0.0,
                reason_code=mismatch,
            )
        decision_type = (
            AnswerDecisionType.AUTO_FILL_AND_SUBMIT
            if automation_mode == AutomationMode.FULL_AUTO
            else AnswerDecisionType.AUTO_FILL
        )
        return AnswerDecision(
            field_fingerprint=observation.field_fingerprint,
            decision=decision_type,
            answer=answer,
            policy_category=category,
            confidence=1.0,
            evidence=evidence,
            reason_code=reason_code,
        )

    def _derive_decision_type(
        self,
        context: AuthorizedRunAnswerContext,
        provider: str,
        model: str,
        prompt_version: str,
    ) -> AnswerDecisionType:
        """Derive final decision type on the server for a valid grounded answer.

        Automatic submission (AUTO_FILL_AND_SUBMIT) is strictly derived:
        - Run must be FULL_AUTO and carry automatic_submission_authorized (BACK-012)
        - Provider, model, and prompt revision must be accepted by the evaluation gate
        If unaccepted or unauthorized on FULL_AUTO, returns AUTO_FILL presenting
        candidate for review. On SEMI_AUTO, returns AUTO_FILL for review.
        """
        if context.run.automatic_submission_authorized and is_evaluation_accepted(
            provider, model, prompt_version, self._accepted_revisions
        ):
            return AnswerDecisionType.AUTO_FILL_AND_SUBMIT

        return AnswerDecisionType.AUTO_FILL

    async def _generate(
        self,
        observation: QuestionObservation,
        context: AuthorizedRunAnswerContext,
        *,
        automation_mode: AutomationMode,
    ) -> AnswerDecision:
        cache_key = self._cache_key(observation, context)
        cached = self._cache.get(cache_key)
        if cached is not None:
            mismatch = validate_control_compatibility(observation, cached.answer)
            if mismatch is None:
                if (
                    cached.confidence
                    < self._settings.answer_auto_submit_confidence_threshold
                ):
                    return AnswerDecision(
                        field_fingerprint=observation.field_fingerprint,
                        decision=AnswerDecisionType.REVIEW_REQUIRED,
                        policy_category=PolicyCategory.GROUNDED_GENERATED,
                        confidence=cached.confidence,
                        reason_code=ReasonCode.PROVIDER_LOW_CONFIDENCE,
                    )
                decision_type = self._derive_decision_type(
                    context,
                    cached.provider,
                    cached.model,
                    cached.prompt_contract_version,
                )
                return AnswerDecision(
                    field_fingerprint=observation.field_fingerprint,
                    decision=decision_type,
                    answer=cached.answer,
                    policy_category=PolicyCategory.GROUNDED_GENERATED,
                    confidence=cached.confidence,
                    evidence=cached.evidence,
                    reason_code=ReasonCode.GROUNDED_GENERATED,
                )

        if not await self._reserve_provider_call(context.run.id):
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.ABSTAIN,
                policy_category=PolicyCategory.REVIEW_REQUIRED,
                confidence=0.0,
                reason_code=ReasonCode.PROVIDER_BUDGET_EXHAUSTED,
            )

        grounded_context = GroundedContext(
            question_label=observation.label,
            question_help_text=observation.help_text,
            control_type=observation.control_type,
            options=observation.options,
            max_length=(
                observation.validation_constraints.max_length
                if observation.validation_constraints
                else None
            ),
            headline=context.profile.headline.value,
            summary=context.profile.summary.value,
            skills=context.profile.skills.value or (),
            employment_history=tuple(
                EmploymentEvidenceEntry(
                    company=e.company, title=e.title, is_current=e.is_current
                )
                for e in (context.profile.employment_history.value or ())
            ),
            job_evidence=context.job_evidence,
        )

        try:
            result = await self._provider.generate(
                grounded_context,
                max_output_tokens=self._settings.answer_provider_max_output_tokens,
                timeout_seconds=self._settings.answer_provider_timeout_seconds,
            )
        except ProviderTimeoutError:
            return self._abstain(observation, ReasonCode.PROVIDER_TIMEOUT)
        except (ProviderUnavailableError, PrivacyGateClosedError):
            return self._abstain(observation, ReasonCode.PROVIDER_UNAVAILABLE)
        except ProviderInvalidStructureError:
            return self._abstain(observation, ReasonCode.PROVIDER_INVALID_STRUCTURE)
        except ProviderBudgetExhaustedError:
            return self._abstain(observation, ReasonCode.PROVIDER_BUDGET_EXHAUSTED)

        evidence = self._validate_grounded_claims(result, context)
        if evidence is None:
            return self._abstain(observation, ReasonCode.UNSUPPORTED_CLAIM_REJECTED)

        derived_answer = " ".join(claim.text.strip() for claim in result.claims)

        max_length = grounded_context.max_length or _ANSWER_MAX_LENGTH_DEFAULT
        if len(derived_answer) > max_length:
            return self._abstain(observation, ReasonCode.CHARACTER_LIMIT_EXCEEDED)

        mismatch = validate_control_compatibility(observation, derived_answer)
        if mismatch is not None:
            return self._abstain(observation, mismatch)

        threshold = self._settings.answer_auto_submit_confidence_threshold
        if result.confidence < threshold:
            return AnswerDecision(
                field_fingerprint=observation.field_fingerprint,
                decision=AnswerDecisionType.REVIEW_REQUIRED,
                policy_category=PolicyCategory.GROUNDED_GENERATED,
                confidence=result.confidence,
                reason_code=ReasonCode.PROVIDER_LOW_CONFIDENCE,
            )

        decision_type = self._derive_decision_type(
            context,
            result.provider,
            result.model,
            result.prompt_contract_version,
        )
        self._cache[cache_key] = _CachedAnswer(
            answer=derived_answer,
            confidence=result.confidence,
            evidence=evidence,
            provider=result.provider,
            model=result.model,
            prompt_contract_version=result.prompt_contract_version,
        )

        return AnswerDecision(
            field_fingerprint=observation.field_fingerprint,
            decision=decision_type,
            answer=derived_answer,
            policy_category=PolicyCategory.GROUNDED_GENERATED,
            confidence=result.confidence,
            evidence=evidence,
            reason_code=ReasonCode.GROUNDED_GENERATED,
        )

    def _validate_grounded_claims(
        self, result: ProviderResult, context: AuthorizedRunAnswerContext
    ) -> tuple[EvidenceReference, ...] | None:
        if not result.claims:
            return None

        allowed = {
            EvidenceReference(source="job", reference=str(context.job_evidence.job_id))
        }
        if context.profile.headline.value:
            allowed.add(EvidenceReference(source="profile", reference="headline"))
        if context.profile.summary.value:
            allowed.add(EvidenceReference(source="profile", reference="summary"))
        if context.profile.skills.value:
            allowed.add(EvidenceReference(source="profile", reference="skills"))
        if context.profile.employment_history.value:
            allowed.add(
                EvidenceReference(source="profile", reference="employment_history")
            )

        evidence: set[EvidenceReference] = set()
        seen_texts: set[str] = set()

        for claim in result.claims:
            text_norm = " ".join(claim.text.casefold().split())
            if not text_norm:
                return None
            if text_norm in seen_texts:
                return None
            seen_texts.add(text_norm)

            if not claim.evidence or any(ref not in allowed for ref in claim.evidence):
                return None
            evidence.update(claim.evidence)

        return tuple(sorted(evidence, key=lambda ref: (ref.source, ref.reference)))

    def _abstain(
        self, observation: QuestionObservation, reason_code: ReasonCode
    ) -> AnswerDecision:
        return AnswerDecision(
            field_fingerprint=observation.field_fingerprint,
            decision=AnswerDecisionType.ABSTAIN,
            policy_category=PolicyCategory.REVIEW_REQUIRED,
            confidence=0.0,
            reason_code=reason_code,
        )
