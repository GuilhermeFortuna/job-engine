import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest

from job_engine.services.deduplication import decide_duplicate
from job_engine.services.normalization import (
    NormalizationCandidate,
    normalize_candidate,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "fixtures" / "deduplication_cases.json"
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
        "remote_evidence": "Remote",
        "employment_type_evidence": "full-time",
        "seniority_evidence": "Mid-level",
        "compensation_original_text": None,
        "compensation_currency": None,
        "compensation_period": None,
        "compensation_minimum": None,
        "compensation_maximum": None,
        "technologies_original_text": "Python",
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


@pytest.mark.parametrize("case", _load_cases(), ids=lambda case: case["id"])
def test_deduplication_fixture_cases(case: dict[str, Any]) -> None:
    left = normalize_candidate(_candidate(**case["left"]))
    right = normalize_candidate(_candidate(**case["right"]))
    decision = decide_duplicate(left, right)
    assert decision.kind.value == case["expect"]["kind"]
    assert decision.reason.value == case["expect"]["reason"]
