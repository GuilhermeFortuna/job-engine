import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest

from job_engine.services.normalization import (
    NormalizationCandidate,
    canonicalize_url,
    comparison_key,
    display_text,
    normalize_candidate,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "fixtures" / "normalization_cases.json"
)


def _aware_now() -> datetime:
    return datetime(2026, 8, 16, 23, 30, tzinfo=UTC)


def _candidate(**overrides: object) -> NormalizationCandidate:
    payload: dict[str, object] = {
        "source_id": "jobicy",
        "source_posting_id": "abc-123",
        "source_name": "Jobicy",
        "listing_url": "https://jobicy.com/jobs/abc-123",
        "title_original": "Python Engineer",
        "company_original": "Acme Ltd",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "remote_evidence": None,
        "employment_type_evidence": None,
        "seniority_evidence": None,
        "compensation_original_text": None,
        "compensation_currency": None,
        "compensation_period": None,
        "compensation_minimum": None,
        "compensation_maximum": None,
        "technologies_original_text": None,
        "location_eligibility_evidence": None,
        "published_at": _aware_now(),
        "source_timestamp": _aware_now(),
        "first_seen_at": _aware_now(),
        "last_seen_at": _aware_now(),
        "closed_at": None,
        "status": "active",
        "ingestion_run_id": uuid4(),
        "adapter_version": "1.0.0",
        "raw_source_metadata": None,
    }
    payload.update(overrides)
    return NormalizationCandidate.model_validate(payload)


def _load_cases() -> list[dict[str, Any]]:
    return cast(
        list[dict[str, Any]],
        json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))["cases"],
    )


def test_display_text_normalizes_unicode_and_whitespace_without_casefold() -> None:
    assert display_text("  Python   Engineer  ") == "Python Engineer"


def test_comparison_key_strips_tested_punctuation_and_legal_suffixes() -> None:
    assert comparison_key("Acme Ltd.", strip_legal_suffixes=True) == "acme"
    assert comparison_key("Acme, Inc.", strip_legal_suffixes=True) == "acme"
    assert display_text("Acme Ltd.") == "Acme Ltd."


def test_canonicalize_url_rejects_non_http() -> None:
    with pytest.raises(ValueError, match="HTTP"):
        canonicalize_url("ftp://jobs.example.com/abc")


def test_canonicalize_url_drops_default_port_and_trailing_slash() -> None:
    assert (
        canonicalize_url("https://Example.com:443/jobs/") == "https://example.com/jobs"
    )
    assert canonicalize_url("http://Example.com:80/jobs") == "http://example.com/jobs"


@pytest.mark.parametrize("case", _load_cases(), ids=lambda case: case["id"])
def test_normalization_fixture_cases(case: dict[str, Any]) -> None:
    record = normalize_candidate(_candidate(**case["candidate"]))
    expect = case["expect"]
    group = record.group
    posting = record.posting
    compensation = group.compensation

    if "title" in expect:
        assert group.title == expect["title"]
    if "title_original" in expect:
        assert group.title_original == expect["title_original"]
        assert posting.title_original == expect["title_original"]
    if "title_comparison_key" in expect:
        assert record.title_comparison_key == expect["title_comparison_key"]
        assert group.title_comparison_key == expect["title_comparison_key"]
    if "company" in expect:
        assert group.company == expect["company"]
    if "company_comparison_key" in expect:
        assert record.company_comparison_key == expect["company_comparison_key"]
        assert group.company_comparison_key == expect["company_comparison_key"]
    if "location_original" in expect:
        assert group.location_original == expect["location_original"]
    if "location_comparison_key" in expect:
        assert record.location_comparison_key == expect["location_comparison_key"]
        assert group.location_comparison_key == expect["location_comparison_key"]
    if "location_normalized_country" in expect:
        assert (
            group.location_normalized_country == expect["location_normalized_country"]
        )
    if "location_normalized_region" in expect:
        assert group.location_normalized_region == expect["location_normalized_region"]
    if "remote_status" in expect:
        assert group.remote_status.value == expect["remote_status"]
        assert posting.remote_status.value == expect["remote_status"]
    if "location_eligibility_unknown" in expect:
        assert (
            group.location_eligibility_unknown is expect["location_eligibility_unknown"]
        )
    if "eligible_regions" in expect:
        assert [item.region.value for item in group.eligible_locations] == expect[
            "eligible_regions"
        ]
    if "compensation_original_text" in expect:
        assert compensation.original_text == expect["compensation_original_text"]
    if "compensation_currency" in expect:
        assert compensation.currency == expect["compensation_currency"]
    if "compensation_period" in expect:
        assert compensation.period == expect["compensation_period"]
    if "compensation_minimum" in expect:
        expected_min = expect["compensation_minimum"]
        if expected_min is None:
            assert compensation.minimum is None
            assert compensation.minimum != Decimal("0")
        else:
            assert compensation.minimum == Decimal(expected_min)
    if "compensation_maximum" in expect:
        expected_max = expect["compensation_maximum"]
        assert compensation.maximum == (
            None if expected_max is None else Decimal(expected_max)
        )
    if "compensation_annual_usd_minimum" in expect:
        expected = expect["compensation_annual_usd_minimum"]
        assert compensation.annual_usd_minimum == (
            None if expected is None else Decimal(expected)
        )
    if "compensation_annual_usd_maximum" in expect:
        expected = expect["compensation_annual_usd_maximum"]
        assert compensation.annual_usd_maximum == (
            None if expected is None else Decimal(expected)
        )
    if "employment_type" in expect:
        assert group.employment_type.value == expect["employment_type"]
    if "seniority" in expect:
        assert group.seniority.value == expect["seniority"]
    if "seniority_original" in expect:
        assert group.seniority_original == expect["seniority_original"]
        assert posting.seniority_original == expect["seniority_original"]
    if "technology_terms" in expect:
        assert [term.term for term in group.technologies] == expect["technology_terms"]
    if "role_families" in expect:
        assert list(record.role_families) == expect["role_families"]
        assert list(group.role_families) == expect["role_families"]
    if "application_url" in expect or "listing_url" in expect:
        expected_url = expect.get("listing_url", expect.get("application_url"))
        assert posting.listing_url == expected_url
    if "canonical_url" in expect:
        assert record.canonical_url == expect["canonical_url"]
        assert posting.listing_url_canonical == expect["canonical_url"]
