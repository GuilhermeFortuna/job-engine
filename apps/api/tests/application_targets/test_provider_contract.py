"""Cross-runtime provider host/path contract fixture (BACK-016)."""

from __future__ import annotations

import json
from pathlib import Path

from job_engine.application_targets.provider_contract import (
    CONTRACT_PATH,
    load_provider_host_path_contract,
    match_provider_url,
)


def test_contract_file_is_shared_with_desktop() -> None:
    contract = load_provider_host_path_contract()
    assert contract.contract_id == "BACK-016-provider-host-path-v1"
    assert "greenhouse" in contract.providers
    assert "lever" in contract.providers
    desktop_copy = (
        Path(__file__).resolve().parents[3]
        / "desktop"
        / "tests"
        / "fixtures"
        / "provider-host-path-contract.json"
    )
    assert desktop_copy.is_file()
    assert json.loads(CONTRACT_PATH.read_text()) == json.loads(desktop_copy.read_text())


def test_greenhouse_and_lever_hosts_match_contract() -> None:
    assert match_provider_url(
        "https://boards.greenhouse.io/acme/jobs/123",
        expected_provider="greenhouse",
    ).matched
    assert (
        match_provider_url(
            "https://job-boards.greenhouse.io/acme/jobs/123",
            expected_provider="greenhouse",
        ).desktop_adapter_id
        == "greenhouse"
    )
    assert match_provider_url(
        "https://jobs.lever.co/acme/abcd-efgh/apply",
        expected_provider="lever",
    ).matched


def test_lookalike_and_eu_lever_rejected() -> None:
    lookalike = match_provider_url(
        "https://evil.boards.greenhouse.io/acme/jobs/123",
        expected_provider="greenhouse",
    )
    assert not lookalike.matched
    assert lookalike.reason_code == "LOOKALIKE_HOST"

    eu = match_provider_url(
        "https://jobs.eu.lever.co/acme/abcd/apply",
        expected_provider="lever",
    )
    assert not eu.matched
    assert eu.reason_code == "PROVIDER_REGION_UNBOUND"


def test_substring_matching_is_not_used() -> None:
    result = match_provider_url(
        "https://notgreenhouse.io.example/acme/jobs/1",
        expected_provider="greenhouse",
    )
    assert not result.matched
