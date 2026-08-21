from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr

from job_engine.config import Settings
from job_engine.domain.application_answers import (
    PROMPT_CONTRACT_VERSION,
    ControlType,
    EvidenceReference,
    GroundedContext,
    JobEvidence,
    PrivacyGateClosedError,
    ProviderInvalidStructureError,
    ProviderUnavailableError,
)
from job_engine.domain.enums import (
    EmploymentType,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.services.answer_providers import (
    DeterministicProvider,
    GeminiProvider,
    LocalProvider,
    build_provider,
)


def make_grounded_context() -> GroundedContext:
    job_id = uuid4()
    return GroundedContext(
        question_label="Why are you interested in this role?",
        question_help_text="Tell us what motivates you",
        control_type=ControlType.TEXTAREA,
        options=(),
        max_length=500,
        headline="Senior Backend Engineer",
        summary="Builds reliable distributed systems.",
        skills=("Python", "FastAPI", "PostgreSQL"),
        employment_history=(),
        job_evidence=JobEvidence(
            job_id=job_id,
            title="Senior Backend Engineer",
            seniority=Seniority.SENIOR,
            employment_type=EmploymentType.FULL_TIME,
            remote_status=RemoteStatus.REMOTE,
            technologies=("Python", "PostgreSQL"),
            eligible_regions=(LocationEligibilityRegion.WORLDWIDE,),
            location_eligibility_unknown=False,
        ),
    )


def mock_httpx_transport(
    monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport
) -> None:
    orig_init = httpx.AsyncClient.__init__

    def custom_init(self: httpx.AsyncClient, *args: Any, **kwargs: Any) -> None:
        kwargs["transport"] = transport
        orig_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", custom_init)


# --- Deterministic Provider Tests --------------------------------------------


@pytest.mark.asyncio
async def test_deterministic_provider_declines_generation() -> None:
    provider = DeterministicProvider()
    assert provider.provider_name == "deterministic"
    assert provider.model_name == "none"
    context = make_grounded_context()

    with pytest.raises(
        ProviderUnavailableError, match="Deterministic provider does not generate"
    ):
        await provider.generate(context, max_output_tokens=100, timeout_seconds=5.0)


# --- Local Provider Tests ----------------------------------------------------


def test_local_provider_loopback_validation() -> None:
    # Valid loopback URLs
    LocalProvider(model="llama3", base_url="http://127.0.0.1:11434/v1")
    LocalProvider(model="llama3", base_url="http://localhost:11434/v1")
    LocalProvider(model="llama3", base_url="http://[::1]:11434/v1")
    LocalProvider(model="llama3", base_url="https://127.0.0.1:8080/v1")
    LocalProvider(model="llama3", base_url="http://127.0.1.1:11434/v1")

    # Invalid URLs (non-loopback, DNS, credentials, wrong scheme)
    with pytest.raises(ValueError, match="loopback"):
        LocalProvider(model="llama3", base_url="http://example.com/v1")
    with pytest.raises(ValueError, match="loopback"):
        LocalProvider(model="llama3", base_url="http://192.168.1.100:11434")
    with pytest.raises(ValueError, match="loopback"):
        LocalProvider(model="llama3", base_url="http://10.0.0.1:11434")
    with pytest.raises(ValueError, match="loopback"):
        LocalProvider(model="llama3", base_url="http://0.0.0.0:11434")
    with pytest.raises(ValueError, match="embedded credentials"):
        LocalProvider(model="llama3", base_url="http://user:pass@127.0.0.1:11434")
    with pytest.raises(ValueError, match="http or https"):
        LocalProvider(model="llama3", base_url="ftp://127.0.0.1:11434")


def test_local_provider_requires_non_empty_model() -> None:
    with pytest.raises(ProviderUnavailableError, match="model name must be non-empty"):
        LocalProvider(model="")
    with pytest.raises(ProviderUnavailableError, match="model name must be non-empty"):
        LocalProvider(model="   ")


@pytest.mark.asyncio
async def test_local_provider_success(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        body = json.loads(request.content)
        assert body["model"] == "qwen2.5:7b"
        assert body["temperature"] == 0.0
        assert "response_format" in body
        resp_data = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "claims": [
                                    {
                                        "text": "Extensive Python experience.",
                                        "evidence_sources": ["profile:skills"],
                                    }
                                ],
                                "confidence": 0.95,
                            }
                        )
                    }
                }
            ]
        }
        return httpx.Response(200, json=resp_data)

    mock_httpx_transport(monkeypatch, httpx.MockTransport(handler))

    provider = LocalProvider(model="qwen2.5:7b", base_url="http://127.0.0.1:11434/v1")
    context = make_grounded_context()
    result = await provider.generate(
        context, max_output_tokens=300, timeout_seconds=5.0
    )

    assert result.provider == "local"
    assert result.model == "qwen2.5:7b"
    assert result.confidence == 0.95
    assert len(result.claims) == 1
    assert result.claims[0].text == "Extensive Python experience."
    assert result.claims[0].evidence == (
        EvidenceReference(source="profile", reference="skills"),
    )
    assert result.prompt_contract_version == PROMPT_CONTRACT_VERSION


@pytest.mark.asyncio
async def test_local_provider_rejects_redirects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "http://127.0.0.1:11434/other"})

    mock_httpx_transport(monkeypatch, httpx.MockTransport(handler))

    provider = LocalProvider(model="qwen2.5:7b", base_url="http://127.0.0.1:11434/v1")
    context = make_grounded_context()

    with pytest.raises(ProviderUnavailableError, match="redirect"):
        await provider.generate(context, max_output_tokens=300, timeout_seconds=5.0)


@pytest.mark.asyncio
async def test_local_provider_http_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal server error detailed body")

    mock_httpx_transport(monkeypatch, httpx.MockTransport(handler))

    provider = LocalProvider(model="qwen2.5:7b", base_url="http://127.0.0.1:11434/v1")
    context = make_grounded_context()

    with pytest.raises(ProviderUnavailableError) as exc_info:
        await provider.generate(context, max_output_tokens=300, timeout_seconds=5.0)
    # Confirm body is not interpolated into exception message
    assert "detailed body" not in str(exc_info.value)


# --- Gemini Provider Tests ---------------------------------------------------


@pytest.mark.asyncio
async def test_gemini_provider_uses_header_auth_and_no_url_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        # CRITICAL: x-goog-api-key header must be present
        assert request.headers.get("x-goog-api-key") == "secret-test-gemini-key"
        # CRITICAL: API key must NEVER be in URL query parameters
        assert "key" not in request.url.params
        assert "secret-test-gemini-key" not in str(request.url)

        body = json.loads(request.content)
        assert "generationConfig" in body
        assert body["generationConfig"]["responseMimeType"] == "application/json"
        assert "responseSchema" in body["generationConfig"]

        resp_data = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "claims": [
                                            {
                                                "text": "I build in Python.",
                                                "evidence_sources": ["profile:skills"],
                                            }
                                        ],
                                        "confidence": 0.98,
                                    }
                                )
                            }
                        ]
                    }
                }
            ]
        }
        return httpx.Response(200, json=resp_data)

    mock_httpx_transport(monkeypatch, httpx.MockTransport(handler))

    provider = GeminiProvider(
        api_key="secret-test-gemini-key",
        model="gemini-2.5-flash",
    )
    context = make_grounded_context()
    result = await provider.generate(
        context, max_output_tokens=300, timeout_seconds=5.0
    )

    assert result.provider == "gemini"
    assert result.model == "gemini-2.5-flash"
    assert result.confidence == 0.98
    assert len(result.claims) == 1
    assert result.claims[0].text == "I build in Python."


@pytest.mark.asyncio
async def test_gemini_provider_malformed_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        resp_data = {
            "candidates": [{"content": {"parts": [{"text": "not valid json"}]}}]
        }
        return httpx.Response(200, json=resp_data)

    mock_httpx_transport(monkeypatch, httpx.MockTransport(handler))

    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")
    context = make_grounded_context()

    with pytest.raises(ProviderInvalidStructureError):
        await provider.generate(context, max_output_tokens=300, timeout_seconds=5.0)


# --- build_provider Factory Tests --------------------------------------------


def test_build_provider_deterministic() -> None:
    settings = Settings(answer_provider="deterministic")
    provider = build_provider(settings)
    assert isinstance(provider, DeterministicProvider)


def test_build_provider_local_bypasses_privacy_gate() -> None:
    settings = Settings(
        answer_provider="local",
        local_model="qwen2.5:7b",
        local_provider_base_url="http://127.0.0.1:11434/v1",
        provider_privacy_attestation_id=None,  # Gate is NOT set
    )
    provider = build_provider(settings)
    assert isinstance(provider, LocalProvider)
    assert provider.model_name == "qwen2.5:7b"


def test_build_provider_local_fails_without_model() -> None:
    settings = Settings(
        answer_provider="local",
        local_model="   ",
    )
    with pytest.raises(
        ProviderUnavailableError, match="JOB_ENGINE_LOCAL_MODEL is not configured"
    ):
        build_provider(settings)


def test_build_provider_gemini_fails_without_privacy_attestation() -> None:
    settings = Settings(
        answer_provider="gemini",
        gemini_api_key=SecretStr("test-key"),
        provider_privacy_attestation_id="self-asserted-attestation",
    )
    with pytest.raises(PrivacyGateClosedError, match="PROVIDER-PRIVACY-001"):
        build_provider(settings)


def test_build_provider_gemini_fails_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "job_engine.services.answer_providers.ACCEPTED_PROVIDER_PRIVACY_ATTESTATIONS",
        frozenset({"test-accepted-attestation"}),
    )
    settings = Settings(
        answer_provider="gemini",
        gemini_api_key=None,
        provider_privacy_attestation_id="test-accepted-attestation",
    )
    with pytest.raises(
        PrivacyGateClosedError, match="JOB_ENGINE_GEMINI_API_KEY is not configured"
    ):
        build_provider(settings)


def test_build_provider_gemini_success_when_privacy_gate_open(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "job_engine.services.answer_providers.ACCEPTED_PROVIDER_PRIVACY_ATTESTATIONS",
        frozenset({"test-accepted-attestation"}),
    )
    settings = Settings(
        answer_provider="gemini",
        gemini_api_key=SecretStr("real-gemini-key"),
        gemini_model="gemini-2.5-flash",
        provider_privacy_attestation_id="test-accepted-attestation",
    )
    provider = build_provider(settings)
    assert isinstance(provider, GeminiProvider)
    assert provider.model_name == "gemini-2.5-flash"
