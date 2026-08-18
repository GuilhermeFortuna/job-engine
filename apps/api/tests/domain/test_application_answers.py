from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from pydantic import ValidationError

from job_engine.domain.applicant import PolicyCategory, QuestionIntent
from job_engine.domain.application_answers import (
    NEVER_GENERATIVE_INTENTS,
    AnswerDecision,
    AnswerDecisionType,
    ControlType,
    EvidenceReference,
    IntentClassification,
    ObservationValidationConstraints,
    QuestionObservation,
    ReasonCode,
    classify_question,
    evaluate_policy,
    validate_control_compatibility,
)

FIXTURES_PATH = (
    Path(__file__).resolve().parents[1] / "fixtures" / "application_questions.json"
)


def _load_fixture_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    return cases


def _make_observation(case: dict[str, Any]) -> QuestionObservation:
    return QuestionObservation(
        run_id=uuid4(),
        adapter_id="test_adapter",
        page_id="page_1",
        field_fingerprint=f"fp_{case['case_id']}",
        label=case["label"],
        required=False,
        control_type=ControlType(case["control_type"]),
        options=tuple(case.get("options", ())),
    )


@pytest.mark.parametrize("case", _load_fixture_cases(), ids=lambda c: c["case_id"])
def test_fixture_intent_classification(case: dict[str, Any]) -> None:
    observation = _make_observation(case)
    classification = classify_question(observation)
    expected_intent = case["expected_intent"]
    if expected_intent is None:
        assert classification.intent is None
    else:
        assert classification.intent == QuestionIntent(expected_intent)


@pytest.mark.parametrize("case", _load_fixture_cases(), ids=lambda c: c["case_id"])
def test_fixture_policy_precedence(case: dict[str, Any]) -> None:
    observation = _make_observation(case)
    classification = classify_question(observation)

    has_approved = case["expected_category"] == "approved_reusable"
    has_verified = case["expected_category"] == "verified_profile"

    category = evaluate_policy(
        classification,
        observation,
        has_approved_reusable=has_approved,
        has_verified_profile=has_verified,
        owner_declined=False,
    )
    assert category == PolicyCategory(case["expected_category"])


def test_unrecognized_intent_returns_review_required() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="Completely unrelated and unmatched question about pineapples",
        required=False,
        control_type=ControlType.TEXTAREA,
    )
    classification = classify_question(observation)
    assert classification.intent is None


def test_never_generative_intents_cannot_reach_grounded_generated() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="placeholder",
        required=False,
        control_type=ControlType.TEXT,
    )
    for intent in NEVER_GENERATIVE_INTENTS:
        classification = IntentClassification(intent=intent, sensitive_hint=True)
        for approved in (True, False):
            for verified in (True, False):
                for declined in (True, False):
                    category = evaluate_policy(
                        classification,
                        observation,
                        has_approved_reusable=approved,
                        has_verified_profile=verified,
                        owner_declined=declined,
                    )
                    assert category != PolicyCategory.GROUNDED_GENERATED


def test_unresolved_classification_never_reaches_grounded_generated() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="placeholder",
        required=False,
        control_type=ControlType.TEXT,
    )
    classification = IntentClassification(intent=None, sensitive_hint=False)
    category = evaluate_policy(
        classification,
        observation,
        has_approved_reusable=False,
        has_verified_profile=False,
        owner_declined=False,
    )
    assert category == PolicyCategory.REVIEW_REQUIRED


def test_demographic_owner_declined_yields_decline_optional() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="Gender",
        required=False,
        control_type=ControlType.SINGLE_SELECT,
        options=("Male", "Female", "Decline to answer"),
    )
    classification = classify_question(observation)
    assert classification.intent == QuestionIntent.GENDER
    category = evaluate_policy(
        classification,
        observation,
        has_approved_reusable=False,
        has_verified_profile=False,
        owner_declined=True,
    )
    assert category == PolicyCategory.DECLINE_OPTIONAL


def test_demographic_exact_owner_answer_is_permitted_without_generation() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp_demographic_exact",
        label="Gender",
        required=False,
        control_type=ControlType.SINGLE_SELECT,
        options=("Male", "Female", "Decline to answer"),
    )
    category = evaluate_policy(
        classify_question(observation),
        observation,
        has_approved_reusable=True,
        has_verified_profile=False,
        owner_declined=False,
    )
    assert category == PolicyCategory.APPROVED_REUSABLE


def test_policy_precedence_prefers_approved_reusable_over_verified_profile() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="What is your notice period?",
        required=False,
        control_type=ControlType.TEXT,
    )
    classification = classify_question(observation)
    category = evaluate_policy(
        classification,
        observation,
        has_approved_reusable=True,
        has_verified_profile=True,
        owner_declined=False,
    )
    assert category == PolicyCategory.APPROVED_REUSABLE


# --- Control compatibility --------------------------------------------------


def test_single_select_rejects_unlisted_option() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="x",
        required=True,
        control_type=ControlType.SINGLE_SELECT,
        options=("Yes", "No"),
    )
    assert (
        validate_control_compatibility(observation, "Maybe")
        == ReasonCode.OPTION_MISMATCH
    )
    assert validate_control_compatibility(observation, "Yes") is None


def test_multi_select_rejects_unlisted_member() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="x",
        required=True,
        control_type=ControlType.MULTI_SELECT,
        options=("Python", "Go", "Rust"),
    )
    assert (
        validate_control_compatibility(observation, "Python, Java")
        == ReasonCode.OPTION_MISMATCH
    )
    assert validate_control_compatibility(observation, "Python, Go") is None


def test_checkbox_requires_boolean_like_value() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="x",
        required=True,
        control_type=ControlType.CHECKBOX,
    )
    assert validate_control_compatibility(observation, "true") is None
    assert (
        validate_control_compatibility(observation, "banana")
        == ReasonCode.INVALID_CONTROL_VALUE
    )


def test_text_enforces_max_length_without_truncating() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="x",
        required=True,
        control_type=ControlType.TEXT,
        validation_constraints=ObservationValidationConstraints(max_length=5),
    )
    assert (
        validate_control_compatibility(observation, "123456")
        == ReasonCode.CHARACTER_LIMIT_EXCEEDED
    )
    assert validate_control_compatibility(observation, "12345") is None


def test_file_control_never_supplies_answer_value() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="Attach resume",
        required=True,
        control_type=ControlType.FILE,
    )
    assert (
        validate_control_compatibility(observation, "some_answer")
        == ReasonCode.INVALID_CONTROL_VALUE
    )


def test_required_control_cannot_resolve_to_empty_answer() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="x",
        required=True,
        control_type=ControlType.TEXT,
    )
    assert (
        validate_control_compatibility(observation, None)
        == ReasonCode.REQUIRED_VALUE_MISSING
    )
    assert (
        validate_control_compatibility(observation, "   ")
        == ReasonCode.REQUIRED_VALUE_MISSING
    )


def test_optional_control_permits_empty_answer() -> None:
    observation = QuestionObservation(
        run_id=uuid4(),
        adapter_id="a",
        page_id="p",
        field_fingerprint="fp1",
        label="x",
        required=False,
        control_type=ControlType.TEXT,
    )
    assert validate_control_compatibility(observation, None) is None


# --- AnswerDecision model validation -----------------------------------------


def test_auto_fill_requires_answer_and_evidence() -> None:
    with pytest.raises(ValidationError):
        AnswerDecision(
            field_fingerprint="fp",
            decision=AnswerDecisionType.AUTO_FILL,
            policy_category=PolicyCategory.VERIFIED_PROFILE,
            confidence=1.0,
            reason_code=ReasonCode.EXACT_VERIFIED_PROFILE,
        )


def test_auto_fill_and_submit_requires_high_confidence() -> None:
    with pytest.raises(ValidationError):
        AnswerDecision(
            field_fingerprint="fp",
            decision=AnswerDecisionType.AUTO_FILL_AND_SUBMIT,
            answer="x",
            policy_category=PolicyCategory.GROUNDED_GENERATED,
            confidence=0.5,
            evidence=(EvidenceReference(source="job", reference="j1"),),
            reason_code=ReasonCode.GROUNDED_GENERATED,
        )


def test_review_required_must_not_carry_answer() -> None:
    with pytest.raises(ValidationError):
        AnswerDecision(
            field_fingerprint="fp",
            decision=AnswerDecisionType.REVIEW_REQUIRED,
            answer="should not be here",
            policy_category=PolicyCategory.REVIEW_REQUIRED,
            confidence=0.0,
            reason_code=ReasonCode.UNRECOGNIZED_INTENT,
        )


def test_confidence_must_be_bounded() -> None:
    with pytest.raises(ValidationError):
        AnswerDecision(
            field_fingerprint="fp",
            decision=AnswerDecisionType.ABSTAIN,
            policy_category=PolicyCategory.REVIEW_REQUIRED,
            confidence=1.5,
            reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
        )
