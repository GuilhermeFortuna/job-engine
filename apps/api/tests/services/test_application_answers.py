from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest

from job_engine.config import Settings
from job_engine.domain.applicant import (
    ApplicantProfile,
    ConfirmedField,
    FieldSource,
    PolicyCategory,
    QuestionIntent,
    ResumeAsset,
    ReusableAnswer,
    ValueState,
)
from job_engine.domain.application_answers import (
    AnswerDecisionType,
    ControlType,
    EvidenceReference,
    GroundedContext,
    JobEvidence,
    PrivacyGateClosedError,
    ProviderInvalidStructureError,
    ProviderResult,
    ProviderResultClaim,
    ProviderTimeoutError,
    ProviderUnavailableError,
    QuestionObservation,
    ReasonCode,
)
from job_engine.domain.applications import (
    ApplicationException,
    ApplicationRun,
    ApplicationRunStatus,
    AutomationMode,
    ExceptionStatus,
    ExceptionType,
    calculate_answer_bank_hash,
    calculate_token_hash,
)
from job_engine.domain.enums import (
    EmploymentType,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.services.answer_providers import build_provider
from job_engine.services.application_answers import (
    ApplicationAnswerService,
    ApplicationRunNotFoundError,
    AuthorizedRunAnswerContext,
    LeaseInvalidOrExpiredError,
    StaleRunContextError,
    authorize_run_for_answers,
)

_NOW = datetime.now(UTC)
_RAW_LEASE_TOKEN = "test-lease-token"
_LEASE_HASH = calculate_token_hash(_RAW_LEASE_TOKEN)
_RESUME_SHA = "a" * 64


class ExplodingProvider:
    provider_name = "exploding"
    model_name = "none"

    async def generate(
        self,
        context: GroundedContext,
        *,
        max_output_tokens: int,
        timeout_seconds: float,
    ) -> ProviderResult:
        raise AssertionError("provider must not be called for this policy branch")


class ScriptedProvider:
    provider_name = "scripted"
    model_name = "scripted-model"

    def __init__(
        self,
        results: list[ProviderResult] | None = None,
        exceptions: list[Exception] | None = None,
    ) -> None:
        self._results = list(results or [])
        self._exceptions = list(exceptions or [])
        self.calls = 0

    async def generate(
        self,
        context: GroundedContext,
        *,
        max_output_tokens: int,
        timeout_seconds: float,
    ) -> ProviderResult:
        self.calls += 1
        if self._exceptions:
            raise self._exceptions.pop(0)
        return self._results.pop(0)


def _confirmed_field(value: Any, *, policy: PolicyCategory) -> ConfirmedField[Any]:
    return ConfirmedField[Any](
        state=ValueState.PROVIDED,
        value=value,
        source=FieldSource.OWNER,
        last_confirmed_at=_NOW,
        policy_category=policy,
    )


def make_profile(
    *,
    version: int = 1,
    notice_period_days: int | None = None,
    headline: str | None = "Senior Backend Engineer",
    summary: str | None = "Builds reliable backend systems.",
    skills: tuple[str, ...] = ("Python", "PostgreSQL"),
) -> ApplicantProfile:
    profile = ApplicantProfile(
        id=uuid4(), version=version, created_at=_NOW, updated_at=_NOW
    )
    updates: dict[str, Any] = {}
    if notice_period_days is not None:
        updates["notice_period_days"] = _confirmed_field(
            notice_period_days, policy=PolicyCategory.VERIFIED_PROFILE
        )
    if headline is not None:
        updates["headline"] = _confirmed_field(
            headline, policy=PolicyCategory.VERIFIED_PROFILE
        )
    if summary is not None:
        updates["summary"] = _confirmed_field(
            summary, policy=PolicyCategory.VERIFIED_PROFILE
        )
    if skills:
        updates["skills"] = _confirmed_field(
            skills, policy=PolicyCategory.VERIFIED_PROFILE
        )
    if updates:
        profile = profile.model_copy(update=updates)
    return profile


def make_resume(*, version: int = 1, sha256: str = _RESUME_SHA) -> ResumeAsset:
    return ResumeAsset(
        id=uuid4(),
        resume_id="res_primary",
        label="Primary resume",
        source_markdown_path="resume.md",
        upload_pdf_path="resume.pdf",
        sha256=sha256,
        version=version,
        created_at=_NOW,
        updated_at=_NOW,
    )


def make_answer_bank(
    *, entries: tuple[ReusableAnswer, ...] = ()
) -> tuple[ReusableAnswer, ...]:
    return entries


def make_approved_answer(
    *, answer_id: str = "ans_1", intent: QuestionIntent, text: str, version: int = 1
) -> ReusableAnswer:
    return ReusableAnswer(
        id=uuid4(),
        answer_id=answer_id,
        question_intent=intent,
        answer_text=text,
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=_NOW,
        version=version,
        created_at=_NOW,
        updated_at=_NOW,
    )


def make_run(
    *,
    resume_asset_id: UUID,
    resume_sha256: str = _RESUME_SHA,
    applicant_profile_version: int = 1,
    answer_bank_snapshot: dict[str, int] | None = None,
    status: ApplicationRunStatus = ApplicationRunStatus.RUNNING,
    lease_token_hash: str | None = _LEASE_HASH,
    lease_expires_at: datetime | None = None,
    automation_mode: AutomationMode = AutomationMode.FULL_AUTO,
    platform_adapter_id: str = "greenhouse",
    exceptions: tuple[ApplicationException, ...] = (),
) -> ApplicationRun:
    snapshot = answer_bank_snapshot if answer_bank_snapshot is not None else {}
    return ApplicationRun(
        id=uuid4(),
        job_group_id=uuid4(),
        source_posting_id=uuid4(),
        canonical_application_url="https://boards.greenhouse.io/acme/jobs/1",
        application_url="https://boards.greenhouse.io/acme/jobs/1",
        platform_adapter_id=platform_adapter_id,
        resume_asset_id=resume_asset_id,
        resume_sha256=resume_sha256,
        applicant_profile_version=applicant_profile_version,
        answer_bank_snapshot=snapshot,
        answer_bank_hash=calculate_answer_bank_hash(snapshot),
        automation_mode=automation_mode,
        status=status,
        idempotency_key="idem_1",
        lease_token_hash=lease_token_hash,
        lease_expires_at=(
            lease_expires_at
            if lease_expires_at is not None
            else _NOW + timedelta(seconds=60)
        ),
        created_at=_NOW,
        updated_at=_NOW,
        exceptions=exceptions,
    )


def make_job_evidence(*, job_id: UUID | None = None) -> JobEvidence:
    return JobEvidence(
        job_id=job_id or uuid4(),
        title="Senior Backend Engineer",
        seniority=Seniority.SENIOR,
        employment_type=EmploymentType.FULL_TIME,
        remote_status=RemoteStatus.REMOTE,
        technologies=("Python",),
        eligible_regions=(LocationEligibilityRegion.WORLDWIDE,),
        location_eligibility_unknown=False,
    )


def make_context(
    *,
    run: ApplicationRun | None = None,
    profile: ApplicantProfile | None = None,
    resume: ResumeAsset | None = None,
    answer_bank: tuple[ReusableAnswer, ...] = (),
    job_evidence: JobEvidence | None = None,
) -> AuthorizedRunAnswerContext:
    resume = resume or make_resume()
    run = run or make_run(resume_asset_id=resume.id)
    profile = profile or make_profile()
    job_evidence = job_evidence or make_job_evidence(job_id=run.job_group_id)
    return AuthorizedRunAnswerContext(
        run=run,
        profile=profile,
        resume=resume,
        answer_bank=answer_bank,
        job_evidence=job_evidence,
    )


def make_observation(
    *,
    run_id: UUID,
    adapter_id: str = "greenhouse",
    label: str,
    control_type: ControlType = ControlType.TEXT,
    options: tuple[str, ...] = (),
    required: bool = False,
    field_fingerprint: str = "fp_1",
) -> QuestionObservation:
    return QuestionObservation(
        run_id=run_id,
        adapter_id=adapter_id,
        page_id="page_1",
        field_fingerprint=field_fingerprint,
        label=label,
        required=required,
        control_type=control_type,
        options=options,
    )


def make_settings(**overrides: object) -> Settings:
    return Settings(**overrides)  # type: ignore[arg-type]


def test_arbitrary_privacy_attestation_cannot_enable_external_provider() -> None:
    settings = make_settings(
        answer_provider="openai",
        provider_privacy_attestation_id="self-asserted-not-owner-accepted",
        openai_api_key="synthetic-test-key",
    )
    with pytest.raises(PrivacyGateClosedError):
        build_provider(settings)


# --- authorize_run_for_answers -----------------------------------------------


def test_authorize_run_for_answers_success() -> None:
    resume = make_resume()
    profile = make_profile()
    run = make_run(resume_asset_id=resume.id)
    job_evidence = make_job_evidence(job_id=run.job_group_id)

    context = authorize_run_for_answers(
        run,
        _RAW_LEASE_TOKEN,
        profile=profile,
        resume=resume,
        answer_bank=(),
        job_evidence=job_evidence,
    )
    assert context.run.id == run.id


def test_authorize_run_for_answers_missing_run() -> None:
    with pytest.raises(ApplicationRunNotFoundError):
        authorize_run_for_answers(
            None,
            _RAW_LEASE_TOKEN,
            profile=make_profile(),
            resume=make_resume(),
            answer_bank=(),
            job_evidence=make_job_evidence(),
        )


def test_authorize_run_for_answers_wrong_lease_token() -> None:
    resume = make_resume()
    run = make_run(resume_asset_id=resume.id)
    with pytest.raises(LeaseInvalidOrExpiredError):
        authorize_run_for_answers(
            run,
            "wrong-token",
            profile=make_profile(),
            resume=resume,
            answer_bank=(),
            job_evidence=make_job_evidence(job_id=run.job_group_id),
        )


def test_authorize_run_for_answers_expired_lease() -> None:
    resume = make_resume()
    run = make_run(
        resume_asset_id=resume.id,
        lease_expires_at=_NOW - timedelta(seconds=1),
    )
    with pytest.raises(LeaseInvalidOrExpiredError):
        authorize_run_for_answers(
            run,
            _RAW_LEASE_TOKEN,
            profile=make_profile(),
            resume=resume,
            answer_bank=(),
            job_evidence=make_job_evidence(job_id=run.job_group_id),
        )


def test_authorize_run_for_answers_non_executable_status() -> None:
    resume = make_resume()
    run = make_run(resume_asset_id=resume.id, status=ApplicationRunStatus.QUEUED)
    with pytest.raises(LeaseInvalidOrExpiredError):
        authorize_run_for_answers(
            run,
            _RAW_LEASE_TOKEN,
            profile=make_profile(),
            resume=resume,
            answer_bank=(),
            job_evidence=make_job_evidence(job_id=run.job_group_id),
        )


def test_authorize_run_for_answers_stale_profile_version() -> None:
    resume = make_resume()
    run = make_run(resume_asset_id=resume.id, applicant_profile_version=2)
    with pytest.raises(StaleRunContextError):
        authorize_run_for_answers(
            run,
            _RAW_LEASE_TOKEN,
            profile=make_profile(version=1),
            resume=resume,
            answer_bank=(),
            job_evidence=make_job_evidence(job_id=run.job_group_id),
        )


def test_authorize_run_for_answers_stale_resume_checksum() -> None:
    resume = make_resume(sha256="b" * 64)
    run = make_run(resume_asset_id=resume.id, resume_sha256="c" * 64)
    with pytest.raises(StaleRunContextError):
        authorize_run_for_answers(
            run,
            _RAW_LEASE_TOKEN,
            profile=make_profile(),
            resume=resume,
            answer_bank=(),
            job_evidence=make_job_evidence(job_id=run.job_group_id),
        )


def test_authorize_run_for_answers_stale_answer_bank_snapshot() -> None:
    resume = make_resume()
    answer = make_approved_answer(
        intent=QuestionIntent.COMPENSATION_EXPECTATION, text="$150k"
    )
    run = make_run(
        resume_asset_id=resume.id,
        answer_bank_snapshot={answer.answer_id: 999},
    )
    with pytest.raises(StaleRunContextError):
        authorize_run_for_answers(
            run,
            _RAW_LEASE_TOKEN,
            profile=make_profile(),
            resume=resume,
            answer_bank=(answer,),
            job_evidence=make_job_evidence(job_id=run.job_group_id),
        )


def test_authorize_run_ignores_answers_added_after_frozen_snapshot() -> None:
    resume = make_resume()
    later_answer = make_approved_answer(
        answer_id="ans_later",
        intent=QuestionIntent.LOCATION_PREFERENCE,
        text="Remote only",
    )
    run = make_run(resume_asset_id=resume.id, answer_bank_snapshot={})
    context = authorize_run_for_answers(
        run,
        _RAW_LEASE_TOKEN,
        profile=make_profile(),
        resume=resume,
        answer_bank=(later_answer,),
        job_evidence=make_job_evidence(job_id=run.job_group_id),
    )
    assert context.answer_bank == ()


# --- Deterministic resolution never calls a provider -------------------------


@pytest.mark.asyncio
async def test_verified_profile_match_never_calls_provider() -> None:
    settings = make_settings()
    service = ApplicationAnswerService(settings, provider=ExplodingProvider())
    profile = make_profile(notice_period_days=30)
    resume = make_resume()
    run = make_run(resume_asset_id=resume.id, automation_mode=AutomationMode.FULL_AUTO)
    context = make_context(run=run, profile=profile, resume=resume)
    observation = make_observation(
        run_id=run.id,
        label="What is your notice period?",
        control_type=ControlType.TEXT,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.AUTO_FILL_AND_SUBMIT
    assert decision.answer == "30"
    assert decision.reason_code == ReasonCode.EXACT_VERIFIED_PROFILE
    assert decision.confidence == 1.0


@pytest.mark.asyncio
async def test_exact_owner_resolution_is_bound_to_run_field_and_identity() -> None:
    settings = make_settings()
    service = ApplicationAnswerService(settings, provider=ExplodingProvider())
    resume = make_resume()
    run_id = uuid4()
    exception = ApplicationException(
        id=uuid4(),
        run_id=run_id,
        exception_type=ExceptionType.UNRESOLVED_QUESTION,
        status=ExceptionStatus.RESOLVED,
        context_payload={},
        resolution_payload={
            "owner_answers": [
                {
                    "field_fingerprint": "fp_owner",
                    "label": "Preferred work arrangement",
                    "control_type": "text",
                    "question_intent": "location_preference",
                    "answer_text": "Remote only",
                    "saved_to_answer_bank": False,
                }
            ]
        },
        created_at=_NOW,
        resolved_at=_NOW,
    )
    run = make_run(
        resume_asset_id=resume.id,
        automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
        exceptions=(exception,),
    ).model_copy(update={"id": run_id})
    context = make_context(run=run, resume=resume)

    exact = make_observation(
        run_id=run.id,
        field_fingerprint="fp_owner",
        label="Preferred work arrangement",
    )
    (decision,) = await service.decide(context, (exact,))
    assert decision.decision == AnswerDecisionType.AUTO_FILL
    assert decision.answer == "Remote only"
    assert decision.reason_code == ReasonCode.OWNER_CONFIRMED
    assert decision.evidence == (
        EvidenceReference(source="owner_resolution", reference=str(exception.id)),
    )

    wrong_field = make_observation(
        run_id=run.id,
        field_fingerprint="fp_other",
        label="Preferred work arrangement",
    )
    (wrong_field_decision,) = await service.decide(context, (wrong_field,))
    assert wrong_field_decision.reason_code != ReasonCode.OWNER_CONFIRMED

    changed_label = make_observation(
        run_id=run.id,
        field_fingerprint="fp_owner",
        label="Legally attest that all information is true",
    )
    (changed_decision,) = await service.decide(context, (changed_label,))
    assert changed_decision.reason_code != ReasonCode.OWNER_CONFIRMED


@pytest.mark.asyncio
async def test_approved_reusable_match_never_calls_provider() -> None:
    settings = make_settings()
    service = ApplicationAnswerService(settings, provider=ExplodingProvider())
    answer = make_approved_answer(
        intent=QuestionIntent.COMPENSATION_EXPECTATION, text="$150,000 USD"
    )
    resume = make_resume()
    run = make_run(
        resume_asset_id=resume.id,
        answer_bank_snapshot={answer.answer_id: answer.version},
        automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
    )
    context = make_context(run=run, resume=resume, answer_bank=(answer,))
    observation = make_observation(run_id=run.id, label="What is your desired salary?")

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.AUTO_FILL
    assert decision.answer == "$150,000 USD"
    assert decision.reason_code == ReasonCode.EXACT_APPROVED_REUSABLE


@pytest.mark.asyncio
async def test_sensitive_question_never_calls_provider() -> None:
    settings = make_settings()
    service = ApplicationAnswerService(settings, provider=ExplodingProvider())
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Gender",
        control_type=ControlType.SINGLE_SELECT,
        options=("Male", "Female"),
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.REVIEW_REQUIRED
    assert decision.policy_category == PolicyCategory.PROHIBITED_AUTOMATION
    assert decision.reason_code == ReasonCode.SENSITIVE_PROHIBITED
    assert decision.answer is None


# --- Cross-run / cross-adapter observation is fail-closed --------------------


@pytest.mark.asyncio
async def test_cross_run_observation_is_abstained() -> None:
    settings = make_settings()
    service = ApplicationAnswerService(settings, provider=ExplodingProvider())
    context = make_context()
    observation = make_observation(run_id=uuid4(), label="anything")

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.ABSTAIN
    assert decision.reason_code == ReasonCode.STALE_RUN_CONTEXT


# --- Grounded generation ------------------------------------------------------


@pytest.mark.asyncio
async def test_grounded_generation_success() -> None:
    settings = make_settings()
    provider = ScriptedProvider(
        results=[
            ProviderResult(
                answer="I am excited to contribute my backend expertise.",
                confidence=0.9,
                claims=(
                    ProviderResultClaim(
                        text="I am excited to contribute my backend expertise",
                        evidence=(
                            EvidenceReference(source="profile", reference="headline"),
                        ),
                    ),
                ),
                provider="scripted",
                model="scripted-model",
            )
        ]
    )
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.AUTO_FILL_AND_SUBMIT
    assert decision.policy_category == PolicyCategory.GROUNDED_GENERATED
    assert decision.confidence == 0.9
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_grounded_generation_rejects_unallowlisted_evidence() -> None:
    provider = ScriptedProvider(
        results=[
            ProviderResult(
                answer="I led an unsupported production migration.",
                confidence=0.99,
                claims=(
                    ProviderResultClaim(
                        text="I led an unsupported production migration",
                        evidence=(
                            EvidenceReference(
                                source="resume", reference="invented-section"
                            ),
                        ),
                    ),
                ),
                provider="scripted",
                model="scripted-model",
            )
        ]
    )
    service = ApplicationAnswerService(make_settings(), provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.ABSTAIN
    assert decision.reason_code == ReasonCode.UNSUPPORTED_CLAIM_REJECTED


@pytest.mark.asyncio
async def test_grounded_generation_low_confidence_becomes_review_required() -> None:
    settings = make_settings()
    provider = ScriptedProvider(
        results=[
            ProviderResult(
                answer="Maybe relevant.",
                confidence=0.4,
                claims=(
                    ProviderResultClaim(
                        text="Maybe relevant",
                        evidence=(
                            EvidenceReference(source="profile", reference="summary"),
                        ),
                    ),
                ),
                provider="scripted",
                model="scripted-model",
            )
        ]
    )
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.REVIEW_REQUIRED
    assert decision.answer is None
    assert decision.reason_code == ReasonCode.PROVIDER_LOW_CONFIDENCE


@pytest.mark.asyncio
async def test_provider_timeout_without_fallback_abstains() -> None:
    settings = make_settings()
    provider = ScriptedProvider(exceptions=[ProviderTimeoutError("timed out")])
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.ABSTAIN
    assert decision.reason_code == ReasonCode.PROVIDER_TIMEOUT


@pytest.mark.asyncio
async def test_provider_unavailable_falls_back_when_configured() -> None:
    settings = make_settings()
    primary = ScriptedProvider(exceptions=[ProviderUnavailableError("rate limited")])
    fallback_result = ProviderResult(
        answer="Fallback answer text.",
        confidence=0.95,
        claims=(
            ProviderResultClaim(
                text="Fallback answer text",
                evidence=(EvidenceReference(source="profile", reference="summary"),),
            ),
        ),
        provider="fallback",
        model="fallback-model",
    )
    fallback = ScriptedProvider(results=[fallback_result])
    service = ApplicationAnswerService(
        settings, provider=primary, fallback_provider=fallback
    )
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.answer == "Fallback answer text."
    assert fallback.calls == 1


@pytest.mark.asyncio
async def test_provider_malformed_output_abstains() -> None:
    settings = make_settings()
    provider = ScriptedProvider(exceptions=[ProviderInvalidStructureError("bad json")])
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    (decision,) = await service.decide(context, (observation,))
    assert decision.decision == AnswerDecisionType.ABSTAIN
    assert decision.reason_code == ReasonCode.PROVIDER_INVALID_STRUCTURE


@pytest.mark.asyncio
async def test_provider_call_budget_exhausted_abstains_without_network_call() -> None:
    settings = make_settings(answer_provider_max_calls_per_run=1)
    results = [
        ProviderResult(
            answer=f"Answer {i}",
            confidence=0.95,
            claims=(
                ProviderResultClaim(
                    text=f"Answer {i}",
                    evidence=(
                        EvidenceReference(source="profile", reference="summary"),
                    ),
                ),
            ),
            provider="scripted",
            model="scripted-model",
        )
        for i in range(3)
    ]
    provider = ScriptedProvider(results=results)
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()

    obs1 = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
        field_fingerprint="fp_a",
    )
    obs2 = make_observation(
        run_id=context.run.id,
        label="What makes you a great fit here?",
        control_type=ControlType.TEXTAREA,
        field_fingerprint="fp_b",
    )

    decisions = await service.decide(context, (obs1, obs2))
    assert decisions[0].answer == "Answer 0"
    assert decisions[1].decision == AnswerDecisionType.ABSTAIN
    assert decisions[1].reason_code == ReasonCode.PROVIDER_BUDGET_EXHAUSTED
    assert provider.calls == 1


# --- Cache isolation -----------------------------------------------------------


@pytest.mark.asyncio
async def test_cache_hit_avoids_second_provider_call() -> None:
    settings = make_settings()
    result = ProviderResult(
        answer="Cached answer.",
        confidence=0.95,
        claims=(
            ProviderResultClaim(
                text="Cached answer",
                evidence=(EvidenceReference(source="profile", reference="summary"),),
            ),
        ),
        provider="scripted",
        model="scripted-model",
    )
    provider = ScriptedProvider(results=[result])
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    first = await service.decide(context, (observation,))
    second = await service.decide(context, (observation,))
    assert first[0].answer == second[0].answer == "Cached answer."
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_cache_isolated_by_profile_version() -> None:
    settings = make_settings()
    results = [
        ProviderResult(
            answer=f"Answer for version {i}",
            confidence=0.95,
            claims=(
                ProviderResultClaim(
                    text=f"Answer for version {i}",
                    evidence=(
                        EvidenceReference(source="profile", reference="summary"),
                    ),
                ),
            ),
            provider="scripted",
            model="scripted-model",
        )
        for i in range(2)
    ]
    provider = ScriptedProvider(results=results)
    service = ApplicationAnswerService(settings, provider=provider)

    resume = make_resume()
    profile_v1 = make_profile(version=1)
    run_v1 = make_run(resume_asset_id=resume.id, applicant_profile_version=1)
    context_v1 = make_context(run=run_v1, profile=profile_v1, resume=resume)

    profile_v2 = make_profile(version=2)
    run_v2 = make_run(resume_asset_id=resume.id, applicant_profile_version=2)
    context_v2 = make_context(run=run_v2, profile=profile_v2, resume=resume)

    observation_v1 = make_observation(
        run_id=run_v1.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )
    observation_v2 = make_observation(
        run_id=run_v2.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    result_v1 = await service.decide(context_v1, (observation_v1,))
    result_v2 = await service.decide(context_v2, (observation_v2,))

    assert result_v1[0].answer != result_v2[0].answer
    assert provider.calls == 2


# --- Redaction -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_decision_logging_never_includes_raw_answer_text(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = make_settings()
    secret_answer = "SECRET_ANSWER_TEXT_MUST_NOT_LEAK"
    provider = ScriptedProvider(
        results=[
            ProviderResult(
                answer=secret_answer,
                confidence=0.95,
                claims=(
                    ProviderResultClaim(
                        text=secret_answer,
                        evidence=(
                            EvidenceReference(source="profile", reference="summary"),
                        ),
                    ),
                ),
                provider="scripted",
                model="scripted-model",
            )
        ]
    )
    service = ApplicationAnswerService(settings, provider=provider)
    context = make_context()
    observation = make_observation(
        run_id=context.run.id,
        label="Why do you want this role?",
        control_type=ControlType.TEXTAREA,
    )

    with caplog.at_level(logging.INFO, logger="job_engine.application_answers"):
        (decision,) = await service.decide(context, (observation,))

    assert decision.answer == secret_answer
    for record in caplog.records:
        assert secret_answer not in record.getMessage()
