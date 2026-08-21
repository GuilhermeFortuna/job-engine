"""Unit tests for LocalInferenceBroker concurrency and JSON parsing."""

from __future__ import annotations

import asyncio
from typing import Any

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
    LocalInferenceResponse,
    create_local_http_client,
    parse_strict_json_object,
)


def _request(**overrides: Any) -> LocalInferenceRequest:
    base: dict[str, Any] = {
        "task_class": LocalAiTaskClass.SELF_TEST,
        "model": "qwen3:4b",
        "system_prompt": "system",
        "user_prompt": "user",
        "response_json_schema": SELF_TEST_RESPONSE_SCHEMA,
        "schema_name": "test",
        "max_output_tokens": 64,
        "timeout_seconds": 5.0,
        "max_input_tokens": 1024,
    }
    base.update(overrides)
    return LocalInferenceRequest(**base)


@pytest.mark.asyncio
async def test_broker_fifo_semaphore_limits_concurrency() -> None:
    client = create_local_http_client()
    broker = LocalInferenceBroker(
        client=client,
        base_url="http://127.0.0.1:11434/v1",
        concurrency_limit=1,
        queue_limit=8,
        acquire_timeout_seconds=2.0,
    )
    trace: list[str] = []
    gate = asyncio.Event()

    async def execute(request: LocalInferenceRequest) -> LocalInferenceResponse:
        trace.append(f"start:{request.user_prompt}")
        await gate.wait()
        trace.append(f"end:{request.user_prompt}")
        return LocalInferenceResponse(
            content={"ok": True, "echo": request.user_prompt},
            model="qwen3:4b",
            latency_ms=1,
            raw_content_length=2,
        )

    try:
        task1 = asyncio.create_task(
            broker.run(_request(user_prompt="a"), execute=execute)
        )
        await asyncio.sleep(0.05)
        task2 = asyncio.create_task(
            broker.run(_request(user_prompt="b"), execute=execute)
        )
        await asyncio.sleep(0.05)
        assert broker.active_count == 1
        assert broker.waiting_count == 1
        assert trace == ["start:a"]
        gate.set()
        results = await asyncio.gather(task1, task2)
        assert [r.content["echo"] for r in results] == ["a", "b"]
        assert trace == ["start:a", "end:a", "start:b", "end:b"]
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_broker_queue_full() -> None:
    client = create_local_http_client()
    broker = LocalInferenceBroker(
        client=client,
        base_url="http://127.0.0.1:11434/v1",
        concurrency_limit=1,
        queue_limit=1,
        acquire_timeout_seconds=5.0,
    )
    started = asyncio.Event()
    release = asyncio.Event()

    async def execute(request: LocalInferenceRequest) -> LocalInferenceResponse:
        started.set()
        await release.wait()
        return LocalInferenceResponse(
            content={"ok": True, "echo": "x"},
            model="qwen3:4b",
            latency_ms=1,
            raw_content_length=1,
        )

    try:
        first = asyncio.create_task(broker.run(_request(), execute=execute))
        await started.wait()
        second = asyncio.create_task(broker.run(_request(), execute=execute))
        await asyncio.sleep(0.05)
        with pytest.raises(LocalAiError) as exc_info:
            await broker.run(_request(), execute=execute)
        assert exc_info.value.code == LocalAiFailureCode.QUEUE_FULL
        release.set()
        await asyncio.gather(first, second)
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_broker_acquire_timeout() -> None:
    client = create_local_http_client()
    broker = LocalInferenceBroker(
        client=client,
        base_url="http://127.0.0.1:11434/v1",
        concurrency_limit=1,
        queue_limit=4,
        acquire_timeout_seconds=0.05,
    )
    release = asyncio.Event()

    async def execute(request: LocalInferenceRequest) -> LocalInferenceResponse:
        await release.wait()
        return LocalInferenceResponse(
            content={"ok": True, "echo": "x"},
            model="qwen3:4b",
            latency_ms=1,
            raw_content_length=1,
        )

    try:
        first = asyncio.create_task(broker.run(_request(), execute=execute))
        await asyncio.sleep(0.02)
        with pytest.raises(LocalAiError) as exc_info:
            await broker.run(_request(), execute=execute)
        assert exc_info.value.code == LocalAiFailureCode.TIMEOUT
        release.set()
        await first
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_broker_task_timeout_cancellation() -> None:
    client = create_local_http_client()
    broker = LocalInferenceBroker(
        client=client,
        base_url="http://127.0.0.1:11434/v1",
        concurrency_limit=1,
        queue_limit=4,
        acquire_timeout_seconds=1.0,
    )

    async def execute(request: LocalInferenceRequest) -> LocalInferenceResponse:
        await asyncio.sleep(1.0)
        return LocalInferenceResponse(
            content={"ok": True, "echo": "x"},
            model="qwen3:4b",
            latency_ms=1,
            raw_content_length=1,
        )

    try:
        with pytest.raises(LocalAiError) as exc_info:
            await broker.run(_request(timeout_seconds=0.05), execute=execute)
        assert exc_info.value.code == LocalAiFailureCode.TIMEOUT
    finally:
        await broker.aclose()


@pytest.mark.asyncio
async def test_one_shared_client() -> None:
    client = create_local_http_client()
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    assert broker.client is client
    await broker.aclose()


def test_parse_strict_json_rejects_thinking_and_prose() -> None:
    assert parse_strict_json_object('{"ok": true, "echo": "x"}')["ok"] is True
    with pytest.raises(LocalAiError) as exc:
        parse_strict_json_object('<think>hmm</think>{"ok": true, "echo": "x"}')
    assert exc.value.code == LocalAiFailureCode.INVALID_STRUCTURE
    with pytest.raises(LocalAiError):
        parse_strict_json_object('Here you go: {"ok": true, "echo": "x"}')
    with pytest.raises(LocalAiError):
        parse_strict_json_object("not json")


@pytest.mark.asyncio
async def test_broker_graceful_shutdown_closes_client() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"data": []})
    )
    client = httpx.AsyncClient(transport=transport, follow_redirects=False)
    broker = LocalInferenceBroker(client=client, base_url="http://127.0.0.1:11434/v1")
    await broker.aclose()
    with pytest.raises(LocalAiError) as exc:
        await broker.run(_request(), execute=lambda r: asyncio.sleep(0))  # type: ignore[arg-type, return-value]
    assert exc.value.code == LocalAiFailureCode.INTERNAL_ERROR
