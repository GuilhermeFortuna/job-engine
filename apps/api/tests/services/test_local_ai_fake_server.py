"""Fake loopback OpenAI-compatible server tests for local-AI structured tasks."""

from __future__ import annotations

import json

import httpx
import pytest

from job_engine.domain.local_ai import (
    SELF_TEST_RESPONSE_SCHEMA,
    LocalAiError,
    LocalAiFailureCode,
    LocalAiTaskClass,
)
from job_engine.services.local_inference import (
    LocalInferenceBroker,
    LocalInferenceRequest,
)


def _chat_response(
    content: str, *, model: str = "qwen3:4b", status: int = 200
) -> httpx.Response:
    return httpx.Response(
        status,
        json={
            "model": model,
            "choices": [{"message": {"content": content}}],
        },
    )


@pytest.mark.asyncio
async def test_valid_json_self_test_through_broker() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        body = json.loads(request.content)
        assert body["think"] is False
        assert body["chat_template_kwargs"]["enable_thinking"] is False
        assert body["response_format"]["type"] == "json_schema"
        return _chat_response('{"ok": true, "echo": "token"}')

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, follow_redirects=False)
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    try:
        result = await broker.run(
            LocalInferenceRequest(
                task_class=LocalAiTaskClass.SELF_TEST,
                model="qwen3:4b",
                system_prompt="sys",
                user_prompt="user",
                response_json_schema=SELF_TEST_RESPONSE_SCHEMA,
                schema_name="self_test",
                max_output_tokens=64,
                timeout_seconds=5.0,
            )
        )
        assert result.content == {"ok": True, "echo": "token"}
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_thinking_pollution_rejected() -> None:
    transport = httpx.MockTransport(
        lambda r: _chat_response('<think>plan</think>{"ok": true, "echo": "x"}')
    )
    client = httpx.AsyncClient(transport=transport, follow_redirects=False)
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    try:
        with pytest.raises(LocalAiError) as exc:
            await broker.run(
                LocalInferenceRequest(
                    task_class=LocalAiTaskClass.SELF_TEST,
                    model="qwen3:4b",
                    system_prompt="sys",
                    user_prompt="user",
                    response_json_schema=SELF_TEST_RESPONSE_SCHEMA,
                    schema_name="self_test",
                    max_output_tokens=64,
                    timeout_seconds=5.0,
                )
            )
        assert exc.value.code == LocalAiFailureCode.INVALID_STRUCTURE
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_malformed_json_rejected() -> None:
    transport = httpx.MockTransport(lambda r: _chat_response("{not json"))
    client = httpx.AsyncClient(transport=transport, follow_redirects=False)
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    try:
        with pytest.raises(LocalAiError) as exc:
            await broker.run(
                LocalInferenceRequest(
                    task_class=LocalAiTaskClass.SELF_TEST,
                    model="qwen3:4b",
                    system_prompt="sys",
                    user_prompt="user",
                    response_json_schema=SELF_TEST_RESPONSE_SCHEMA,
                    schema_name="self_test",
                    max_output_tokens=64,
                    timeout_seconds=5.0,
                )
            )
        assert exc.value.code == LocalAiFailureCode.INVALID_STRUCTURE
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_missing_model_maps_to_failure_code() -> None:
    transport = httpx.MockTransport(
        lambda r: httpx.Response(404, text="model 'qwen3:4b' not found, try pulling")
    )
    client = httpx.AsyncClient(transport=transport, follow_redirects=False)
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    try:
        with pytest.raises(LocalAiError) as exc:
            await broker.run(
                LocalInferenceRequest(
                    task_class=LocalAiTaskClass.SELF_TEST,
                    model="qwen3:4b",
                    system_prompt="sys",
                    user_prompt="user",
                    response_json_schema=SELF_TEST_RESPONSE_SCHEMA,
                    schema_name="self_test",
                    max_output_tokens=64,
                    timeout_seconds=5.0,
                )
            )
        assert exc.value.code == LocalAiFailureCode.MODEL_MISSING
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_probe_runtime_model_availability() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "qwen3:4b"}, {"id": "other"}]})

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, follow_redirects=False)
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    try:
        reachable, available, failure = await broker.probe_runtime("qwen3:4b")
        assert reachable is True
        assert available is True
        assert failure is None
        reachable, available, failure = await broker.probe_runtime("missing")
        assert reachable is True
        assert available is False
        assert failure == LocalAiFailureCode.MODEL_MISSING
    finally:
        await broker.aclose()
