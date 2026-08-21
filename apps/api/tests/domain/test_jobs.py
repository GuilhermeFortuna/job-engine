from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from enum import StrEnum
from uuid import uuid4

import pytest
from pydantic import ValidationError

from job_engine.domain.enums import (
    EmploymentType,
    IngestionRunStatus,
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import (
    Compensation,
    EligibleLocation,
    JobGroupInput,
    SourcePostingInput,
    TechnologyTerm,
)


def _aware_now() -> datetime:
    return datetime(2026, 8, 16, 23, 30, tzinfo=UTC)


def _valid_compensation(**overrides: object) -> Compensation:
    payload: dict[str, object] = {
        "original_text": None,
        "currency": None,
        "period": None,
        "minimum": None,
        "maximum": None,
        "annual_usd_minimum": None,
        "annual_usd_maximum": None,
    }
    payload.update(overrides)
    return Compensation.model_validate(payload)


def _valid_source_posting(**overrides: object) -> SourcePostingInput:
    payload: dict[str, object] = {
        "source_id": "jobicy",
        "source_posting_id": "abc-123",
        "source_name": "Jobicy",
        "listing_url": "https://jobicy.com/jobs/abc-123",
        "listing_url_canonical": "https://jobicy.com/jobs/abc-123",
        "title_original": "Python Engineer",
        "company_original": "Acme Ltd",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "remote_status": RemoteStatus.REMOTE,
        "employment_type": EmploymentType.FULL_TIME,
        "seniority": Seniority.MID,
        "seniority_original": "Mid-level",
        "compensation": _valid_compensation(),
        "technologies_original_text": "Python, FastAPI",
        "location_eligibility_evidence": "Remote in Brazil",
        "published_at": _aware_now(),
        "source_timestamp": _aware_now(),
        "first_seen_at": _aware_now(),
        "last_seen_at": _aware_now(),
        "closed_at": None,
        "status": JobStatus.ACTIVE,
        "ingestion_run_id": uuid4(),
        "adapter_version": "1.0.0",
        "raw_source_metadata": None,
    }
    payload.update(overrides)
    return SourcePostingInput.model_validate(payload)


def _valid_job_group(**overrides: object) -> JobGroupInput:
    payload: dict[str, object] = {
        "title": "Python Engineer",
        "title_original": "Python Engineer (Backend)",
        "title_comparison_key": "python engineer",
        "company": "Acme",
        "company_original": "Acme Ltd",
        "company_comparison_key": "acme",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "location_comparison_key": "são paulo brazil",
        "location_normalized_country": "BR",
        "location_normalized_region": "latin_america",
        "remote_status": RemoteStatus.REMOTE,
        "employment_type": EmploymentType.FULL_TIME,
        "seniority": Seniority.MID,
        "seniority_original": "Mid-level",
        "compensation": _valid_compensation(),
        "published_at": _aware_now(),
        "first_seen_at": _aware_now(),
        "last_seen_at": _aware_now(),
        "closed_at": None,
        "status": JobStatus.ACTIVE,
        "location_eligibility_unknown": False,
        "technologies": (TechnologyTerm(term="Python", source_text="Python, FastAPI"),),
        "eligible_locations": (
            EligibleLocation(
                region=LocationEligibilityRegion.BRAZIL,
                evidence_text="Remote in Brazil",
            ),
        ),
        "role_families": ("python",),
        "last_ingestion_run_id": uuid4(),
    }
    payload.update(overrides)
    return JobGroupInput.model_validate(payload)


@pytest.mark.parametrize(
    ("enum_cls", "invalid"),
    [
        (RemoteStatus, "wfh"),
        (EmploymentType, "contractor"),
        (Seniority, "principal"),
        (JobStatus, "archived"),
        (IngestionRunStatus, "ok"),
    ],
)
def test_controlled_enums_reject_unknown_labels(
    enum_cls: type[StrEnum], invalid: str
) -> None:
    with pytest.raises(ValueError):
        enum_cls(invalid)


def test_unknown_is_a_first_class_enum_value() -> None:
    posting = _valid_source_posting(
        remote_status="unknown",
        employment_type="unknown",
        seniority="unknown",
        status="unknown",
    )

    assert posting.remote_status is RemoteStatus.UNKNOWN
    assert posting.employment_type is EmploymentType.UNKNOWN
    assert posting.seniority is Seniority.UNKNOWN
    assert posting.status is JobStatus.UNKNOWN


def test_application_url_rejects_non_http_schemes() -> None:
    with pytest.raises(ValidationError):
        _valid_source_posting(listing_url="ftp://jobs.example.com/abc")


def test_application_url_accepts_http_and_https() -> None:
    http = _valid_source_posting(listing_url="http://jobs.example.com/abc")
    https = _valid_source_posting(listing_url="https://jobs.example.com/abc")

    assert http.listing_url == "http://jobs.example.com/abc"
    assert https.listing_url == "https://jobs.example.com/abc"


def test_naive_datetimes_are_rejected() -> None:
    with pytest.raises(ValidationError):
        _valid_source_posting(first_seen_at=datetime(2026, 8, 16, 23, 30))


def test_aware_datetimes_are_stored_as_utc() -> None:
    offset = timezone(timedelta(hours=-3))
    local = datetime(2026, 8, 16, 20, 30, tzinfo=offset)

    posting = _valid_source_posting(first_seen_at=local)

    assert posting.first_seen_at.tzinfo is UTC
    assert posting.first_seen_at == datetime(2026, 8, 16, 23, 30, tzinfo=UTC)


def test_missing_compensation_amounts_are_none_not_zero() -> None:
    compensation = _valid_compensation()

    assert compensation.minimum is None
    assert compensation.maximum is None
    assert compensation.annual_usd_minimum is None
    assert compensation.annual_usd_maximum is None
    assert compensation.minimum != Decimal("0")


def test_job_group_preserves_originals_independently_of_normalized_values() -> None:
    group = _valid_job_group(
        title="Python Engineer",
        title_original="Sr Python Eng",
        seniority=Seniority.UNKNOWN,
        seniority_original="ninja",
        compensation=_valid_compensation(
            original_text="R$ 10k/mês",
            currency="BRL",
            period="month",
            minimum=Decimal("10000"),
            annual_usd_minimum=None,
        ),
        location_eligibility_unknown=True,
        eligible_locations=(),
    )

    assert group.title == "Python Engineer"
    assert group.title_original == "Sr Python Eng"
    assert group.seniority is Seniority.UNKNOWN
    assert group.seniority_original == "ninja"
    assert group.compensation.original_text == "R$ 10k/mês"
    assert group.compensation.annual_usd_minimum is None
    assert group.location_eligibility_unknown is True
    assert group.eligible_locations == ()


def test_domain_models_are_immutable() -> None:
    posting = _valid_source_posting()

    with pytest.raises(ValidationError):
        posting.source_id = "rewritten"
