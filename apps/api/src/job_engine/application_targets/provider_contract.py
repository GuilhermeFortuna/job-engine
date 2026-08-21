"""Declarative provider host/path contract shared with desktop selection tests.

Backend capability checks use this contract only. Substring matching and
client-supplied adapter IDs are rejected.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict

ProviderId = Literal["greenhouse", "lever"]

REPO_ROOT = Path(__file__).resolve().parents[5]
CONTRACT_PATH = REPO_ROOT / "docs" / "automation" / "provider-host-path-contract.json"


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ProviderHostPathRule(FrozenModel):
    desktop_adapter_id: str
    production_supported: bool
    allowed_hosts: tuple[str, ...]
    path_pattern: str
    require_https: bool = True
    unbound_hosts: tuple[str, ...] = ()


class ProviderHostPathContract(FrozenModel):
    contract_id: str
    register_revision: str
    providers: dict[str, ProviderHostPathRule]


class ProviderMatchResult(FrozenModel):
    matched: bool
    provider: ProviderId | None = None
    desktop_adapter_id: str | None = None
    production_supported: bool = False
    reason_code: str | None = None


@lru_cache(maxsize=1)
def load_provider_host_path_contract() -> ProviderHostPathContract:
    payload = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    return ProviderHostPathContract.model_validate(payload)


def match_provider_url(
    url: str,
    *,
    expected_provider: ProviderId | None = None,
    contract: ProviderHostPathContract | None = None,
) -> ProviderMatchResult:
    """Match a URL against the frozen host/path contract.

    Exact hostname equality and full-path regex only — never substring host
    tests. URL credentials, non-HTTPS (when required), and unbound hosts fail.
    """
    resolved = contract or load_provider_host_path_contract()
    parsed = urlparse(url)
    if parsed.username or parsed.password:
        return ProviderMatchResult(matched=False, reason_code="URL_CREDENTIALS")
    host = (parsed.hostname or "").lower()
    if not host:
        return ProviderMatchResult(matched=False, reason_code="MISSING_HOST")

    providers: list[tuple[ProviderId, ProviderHostPathRule]] = []
    for provider_id, rule in resolved.providers.items():
        if provider_id not in {"greenhouse", "lever"}:
            continue
        typed_id: ProviderId = provider_id  # type: ignore[assignment]
        if expected_provider is not None and typed_id != expected_provider:
            continue
        providers.append((typed_id, rule))

    for provider_id, rule in providers:
        if host in {item.lower() for item in rule.unbound_hosts}:
            return ProviderMatchResult(
                matched=False,
                provider=provider_id,
                desktop_adapter_id=rule.desktop_adapter_id,
                production_supported=False,
                reason_code="PROVIDER_REGION_UNBOUND",
            )
        if rule.require_https and parsed.scheme != "https":
            continue
        if parsed.port not in (None, 443) and rule.require_https:
            continue
        allowed = {item.lower() for item in rule.allowed_hosts}
        if host not in allowed:
            continue
        path = parsed.path.rstrip("/") or "/"
        if not re.fullmatch(rule.path_pattern, path):
            continue
        if not rule.production_supported:
            return ProviderMatchResult(
                matched=False,
                provider=provider_id,
                desktop_adapter_id=rule.desktop_adapter_id,
                production_supported=False,
                reason_code="ADAPTER_UNSUPPORTED",
            )
        return ProviderMatchResult(
            matched=True,
            provider=provider_id,
            desktop_adapter_id=rule.desktop_adapter_id,
            production_supported=True,
            reason_code=None,
        )

    # Lookalike: host contains a provider token but is not an exact allowlisted host.
    lookalike_tokens = ("greenhouse.io", "lever.co")
    if any(token in host for token in lookalike_tokens):
        return ProviderMatchResult(matched=False, reason_code="LOOKALIKE_HOST")
    return ProviderMatchResult(matched=False, reason_code="HOST_PATH_MISMATCH")


def contract_fixture_payload() -> dict[str, Any]:
    """Raw contract dict for cross-runtime fixture assertions."""
    payload = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError("provider host/path contract must be a JSON object")
    return payload
