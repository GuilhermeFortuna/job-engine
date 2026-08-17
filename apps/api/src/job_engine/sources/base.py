from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable, Mapping
from datetime import datetime
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

import httpx

from job_engine.domain.enums import JobStatus
from job_engine.domain.jobs import FrozenModel

if TYPE_CHECKING:
    from job_engine.services.normalization import NormalizationCandidate

Sleeper = Callable[[float], Awaitable[None]]


class AdapterError(Exception):
    """Base error for source adapter failures."""


class AuthorizationError(AdapterError):
    """Raised when the source rejects credentials or authorization."""


class RateLimitError(AdapterError):
    def __init__(
        self, message: str, *, retry_after_seconds: float | None = None
    ) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class TransportError(AdapterError):
    """Raised for connect/read/timeout and unexpected HTTP transport failures."""


class UpstreamSchemaError(AdapterError):
    """Raised when a page envelope does not match the documented schema."""


class RecordValidationError(AdapterError):
    """Raised when a single source record cannot be parsed."""


class PageCursor(FrozenModel):
    window: str
    page: int


class SourcePage(FrozenModel):
    raw_records: tuple[object, ...]
    next_cursor: PageCursor | None = None
    fetched_count: int = 0


class LifecycleSignal(FrozenModel):
    last_seen_at: datetime
    closed_at: datetime | None = None
    status: JobStatus = JobStatus.ACTIVE


@runtime_checkable
class SourceAdapter(Protocol):
    source_id: str
    adapter_version: str

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage: ...

    def parse_record(self, raw: object) -> Mapping[str, Any]: ...

    def map_candidate(
        self,
        parsed: Mapping[str, Any],
        *,
        run_id: object,
        seen_at: datetime,
    ) -> NormalizationCandidate: ...

    def lifecycle_signal(
        self, parsed: Mapping[str, Any], *, seen_at: datetime
    ) -> LifecycleSignal: ...


def redact_text(message: str) -> str:
    redacted = re.sub(r"(?i)\bbearer\s+\S+", "Bearer [redacted]", message)
    return re.sub(
        r"(?i)(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*\S+",
        lambda match: f"{match.group(1)}: [redacted]",
        redacted,
    )


async def default_sleeper(seconds: float) -> None:
    await asyncio.sleep(seconds)


def _retry_after_seconds(response: httpx.Response) -> float:
    raw = response.headers.get("Retry-After")
    if raw is None:
        return 60.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 60.0


def _http_error_message(response: httpx.Response) -> str:
    content_type = response.headers.get("content-type", "")
    snippet = ""
    if "json" in content_type:
        snippet = response.text[:120].replace("\n", " ")
    return redact_text(f"HTTP {response.status_code} {snippet}".strip())


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Mapping[str, str] | None = None,
    sleeper: Sleeper | None = None,
    max_retries: int = 1,
) -> Any:
    sleep = sleeper or default_sleeper
    attempts = max_retries + 1
    last_error: AdapterError | None = None
    for attempt in range(attempts):
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as exc:
            last_error = TransportError(redact_text(str(exc)))
            if attempt + 1 >= attempts:
                raise last_error from exc
            await sleep(0.0)
            continue
        if response.status_code in {401, 403}:
            raise AuthorizationError(_http_error_message(response))
        if response.status_code == 400:
            raise UpstreamSchemaError(_http_error_message(response))
        if response.status_code == 429:
            retry_after = _retry_after_seconds(response)
            last_error = RateLimitError(
                _http_error_message(response), retry_after_seconds=retry_after
            )
            if attempt + 1 >= attempts:
                raise last_error
            await sleep(retry_after)
            continue
        if response.status_code != 200:
            raise TransportError(_http_error_message(response))
        try:
            return response.json()
        except ValueError as exc:
            raise UpstreamSchemaError("response is not JSON") from exc
    assert last_error is not None
    raise last_error
