"""Shared local inference broker and loopback OpenAI-compatible client."""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx

from job_engine.domain.local_ai import (
    LocalAiError,
    LocalAiFailureCode,
    LocalAiTaskClass,
)

logger = logging.getLogger(__name__)

# Reject thinking/prose pollution around JSON schema payloads.
_THINKING_MARKERS = ("<think>", "</think>", "<thinking>", "</thinking>")


@dataclass(frozen=True, slots=True)
class LocalInferenceRequest:
    task_class: LocalAiTaskClass
    model: str
    system_prompt: str
    user_prompt: str
    response_json_schema: dict[str, Any]
    schema_name: str
    max_output_tokens: int
    timeout_seconds: float
    max_input_tokens: int = 8192


@dataclass(frozen=True, slots=True)
class LocalInferenceResponse:
    content: dict[str, Any]
    model: str
    latency_ms: int
    raw_content_length: int


def validate_loopback_base_url(base_url: str) -> str:
    parsed = urlsplit(base_url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Local provider base_url must use http or https scheme")
    if parsed.username or parsed.password:
        raise ValueError(
            "Local provider base_url must not contain embedded credentials"
        )
    host = parsed.hostname
    if not host:
        raise ValueError("Local provider base_url missing hostname")
    host_lower = host.lower()
    if host_lower == "localhost":
        return base_url
    try:
        ip = ipaddress.ip_address(host_lower)
        if not ip.is_loopback:
            raise ValueError(
                f"Local provider base_url must point to loopback, got: {host}"
            )
    except ValueError as exc:
        if "must point to loopback" in str(exc):
            raise
        raise ValueError(
            f"Local provider base_url must point to loopback, got: {host}"
        ) from exc
    return base_url


def parse_strict_json_object(raw_text: str) -> dict[str, Any]:
    """Accept only a JSON object payload; never parse prose around it."""
    if not isinstance(raw_text, str):
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            "Model response content is not a string",
        )
    stripped = raw_text.strip()
    if not stripped:
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            "Model response content is empty",
        )
    lower = stripped.lower()
    for marker in _THINKING_MARKERS:
        if marker in lower:
            raise LocalAiError(
                LocalAiFailureCode.INVALID_STRUCTURE,
                "Model response contains thinking/prose pollution",
            )
    # Reject leading prose: must start with '{'
    if not stripped.startswith("{"):
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            "Model response is not a bare JSON object",
        )
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            f"Non-JSON model response: {exc}",
        ) from exc
    if not isinstance(parsed, dict):
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            "Model response is not a JSON object",
        )
    return parsed


def validate_json_schema(
    value: Any, schema: dict[str, Any], *, path: str = "$"
) -> None:
    """Validate the bounded JSON-schema subset used by local inference tasks."""
    expected = schema.get("type")
    type_matches = {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "boolean": isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "null": value is None,
    }
    if isinstance(expected, str) and not type_matches.get(expected, False):
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            f"Model response schema mismatch at {path}: expected {expected}",
        )

    if "enum" in schema and value not in schema["enum"]:
        raise LocalAiError(
            LocalAiFailureCode.INVALID_STRUCTURE,
            f"Model response schema mismatch at {path}: value is not allowed",
        )

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        if isinstance(required, list):
            missing = [key for key in required if key not in value]
            if missing:
                raise LocalAiError(
                    LocalAiFailureCode.INVALID_STRUCTURE,
                    f"Model response schema mismatch at {path}: missing {missing[0]}",
                )
        if schema.get("additionalProperties") is False:
            extras = [key for key in value if key not in properties]
            if extras:
                raise LocalAiError(
                    LocalAiFailureCode.INVALID_STRUCTURE,
                    f"Model response schema mismatch at {path}: unexpected {extras[0]}",
                )
        if isinstance(properties, dict):
            for key, child_schema in properties.items():
                if key in value and isinstance(child_schema, dict):
                    validate_json_schema(value[key], child_schema, path=f"{path}.{key}")

    if isinstance(value, list):
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                validate_json_schema(item, item_schema, path=f"{path}[{index}]")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if isinstance(minimum, (int, float)) and value < minimum:
            raise LocalAiError(
                LocalAiFailureCode.INVALID_STRUCTURE,
                f"Model response schema mismatch at {path}: below minimum",
            )
        if isinstance(maximum, (int, float)) and value > maximum:
            raise LocalAiError(
                LocalAiFailureCode.INVALID_STRUCTURE,
                f"Model response schema mismatch at {path}: above maximum",
            )


class LocalInferenceBroker:
    """Backend-owned semaphore + bounded queue for all local model calls."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        concurrency_limit: int = 1,
        queue_limit: int = 16,
        acquire_timeout_seconds: float = 15.0,
    ) -> None:
        if concurrency_limit < 1:
            raise ValueError("concurrency_limit must be >= 1")
        if queue_limit < 1:
            raise ValueError("queue_limit must be >= 1")
        if acquire_timeout_seconds <= 0:
            raise ValueError("acquire_timeout_seconds must be > 0")

        self._client = client
        self._base_url = validate_loopback_base_url(base_url).rstrip("/")
        self._semaphore = asyncio.Semaphore(concurrency_limit)
        self._concurrency_limit = concurrency_limit
        self._queue_limit = queue_limit
        self._acquire_timeout_seconds = acquire_timeout_seconds
        self._waiting = 0
        self._active = 0
        self._lock = asyncio.Lock()
        self._closed = False

    @property
    def client(self) -> httpx.AsyncClient:
        return self._client

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def concurrency_limit(self) -> int:
        return self._concurrency_limit

    @property
    def queue_limit(self) -> int:
        return self._queue_limit

    @property
    def active_count(self) -> int:
        return self._active

    @property
    def waiting_count(self) -> int:
        return self._waiting

    async def aclose(self) -> None:
        self._closed = True
        await self._client.aclose()

    async def run(
        self,
        request: LocalInferenceRequest,
        *,
        execute: Callable[[LocalInferenceRequest], Awaitable[LocalInferenceResponse]]
        | None = None,
    ) -> LocalInferenceResponse:
        if self._closed:
            raise LocalAiError(
                LocalAiFailureCode.INTERNAL_ERROR,
                "Local inference broker is closed",
            )

        async with self._lock:
            queued = self._waiting + self._active
            if queued >= self._concurrency_limit + self._queue_limit:
                raise LocalAiError(
                    LocalAiFailureCode.QUEUE_FULL,
                    "Local inference queue is full",
                )
            self._waiting += 1

        acquired = False
        try:
            try:
                await asyncio.wait_for(
                    self._semaphore.acquire(),
                    timeout=self._acquire_timeout_seconds,
                )
                acquired = True
            except TimeoutError as exc:
                raise LocalAiError(
                    LocalAiFailureCode.TIMEOUT,
                    "Timed out waiting for local inference slot",
                ) from exc
            finally:
                async with self._lock:
                    self._waiting -= 1
                    if acquired:
                        self._active += 1

            runner = execute if execute is not None else self._execute_chat_completion
            try:
                return await asyncio.wait_for(
                    runner(request),
                    timeout=request.timeout_seconds,
                )
            except TimeoutError as exc:
                raise LocalAiError(
                    LocalAiFailureCode.TIMEOUT,
                    f"Local inference task timed out after {request.timeout_seconds}s",
                ) from exc
        finally:
            if acquired:
                async with self._lock:
                    self._active -= 1
                self._semaphore.release()

    async def probe_runtime(
        self, model: str
    ) -> tuple[bool, bool, LocalAiFailureCode | None]:
        """Return (reachable, model_available, failure_code)."""
        try:
            response = await self._client.get(f"{self._base_url}/models")
        except httpx.TimeoutException:
            return False, False, LocalAiFailureCode.TIMEOUT
        except httpx.HTTPError:
            return False, False, LocalAiFailureCode.RUNTIME_UNREACHABLE

        if response.status_code >= 400:
            return False, False, LocalAiFailureCode.RUNTIME_UNREACHABLE

        try:
            body = response.json()
            models = body.get("data", [])
            ids = {
                item.get("id")
                for item in models
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
        except (ValueError, AttributeError, TypeError):
            return True, False, LocalAiFailureCode.INVALID_STRUCTURE

        if model not in ids:
            return True, False, LocalAiFailureCode.MODEL_MISSING
        return True, True, None

    async def _execute_chat_completion(
        self, request: LocalInferenceRequest
    ) -> LocalInferenceResponse:
        started = asyncio.get_running_loop().time()
        # Truncate user prompt roughly by characters if over input budget.
        # Tokenization is model-specific; use a conservative 4 chars/token bound.
        max_chars = request.max_input_tokens * 4
        user_prompt = request.user_prompt
        if len(user_prompt) > max_chars:
            user_prompt = user_prompt[:max_chars]

        payload: dict[str, Any] = {
            "model": request.model,
            "temperature": 0.0,
            "max_tokens": request.max_output_tokens,
            # Disable Qwen/Ollama thinking for structured JSON tasks.
            "think": False,
            "chat_template_kwargs": {"enable_thinking": False},
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": request.schema_name,
                    "strict": True,
                    "schema": request.response_json_schema,
                },
            },
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        try:
            response = await self._client.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                timeout=request.timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise LocalAiError(
                LocalAiFailureCode.TIMEOUT, f"Local provider timeout: {exc}"
            ) from exc
        except httpx.HTTPError as exc:
            raise LocalAiError(
                LocalAiFailureCode.RUNTIME_UNREACHABLE,
                f"Local provider unreachable: {exc}",
            ) from exc

        if 300 <= response.status_code < 400:
            raise LocalAiError(
                LocalAiFailureCode.RUNTIME_UNREACHABLE,
                f"Local provider returned redirect HTTP {response.status_code}",
            )

        if response.status_code == 404:
            raise LocalAiError(
                LocalAiFailureCode.MODEL_MISSING,
                "Local model missing or endpoint not found: "
                f"HTTP {response.status_code}",
            )

        if response.status_code >= 400:
            # Ollama often returns 404-ish messages for missing models in body.
            body_text = ""
            try:
                body_text = response.text.lower()
            except Exception:
                body_text = ""
            if "not found" in body_text or (
                "model" in body_text and "pull" in body_text
            ):
                raise LocalAiError(
                    LocalAiFailureCode.MODEL_MISSING,
                    f"Local provider returned HTTP {response.status_code}",
                )
            raise LocalAiError(
                LocalAiFailureCode.RUNTIME_UNREACHABLE,
                f"Local provider returned HTTP {response.status_code}",
            )

        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]
            response_model = body.get("model") or request.model
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LocalAiError(
                LocalAiFailureCode.INVALID_STRUCTURE,
                f"Unexpected local response shape: {exc}",
            ) from exc

        parsed = parse_strict_json_object(content)
        validate_json_schema(parsed, request.response_json_schema)
        latency_ms = int((asyncio.get_running_loop().time() - started) * 1000)
        return LocalInferenceResponse(
            content=parsed,
            model=str(response_model),
            latency_ms=latency_ms,
            raw_content_length=len(content) if isinstance(content, str) else 0,
        )


def create_local_http_client(*, timeout_seconds: float = 60.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=False)
