from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from job_engine.config import Settings
from job_engine.domain.enums import IngestionRunStatus
from job_engine.ingest import ingest_source
from job_engine.sources.base import redact_text

logger = logging.getLogger("job_engine.sync")

IngestOne = Callable[[str], Awaitable[Mapping[str, Any]]]
OnSourceStart = Callable[[str, int, int], None]
OnSourceFinish = Callable[[Mapping[str, Any]], None]


def _source_failed(summary: Mapping[str, Any]) -> bool:
    return summary.get("status") == IngestionRunStatus.FAILURE.value


def _count(summary: Mapping[str, Any], key: str) -> int:
    value = summary.get(key, 0)
    return int(value) if value is not None else 0


def _failed_source_result(source_id: str, exc: BaseException) -> dict[str, Any]:
    message = redact_text(f"{type(exc).__name__}: {exc}")
    return {
        "source_id": source_id,
        "status": IngestionRunStatus.FAILURE.value,
        "error": f"{source_id}: {message}",
    }


def format_source_start(source_id: str, index: int, total: int) -> str:
    return f"[{index}/{total}] Syncing {source_id}..."


def format_source_result(summary: Mapping[str, Any]) -> str:
    status = str(summary.get("status", "unknown"))
    if status == IngestionRunStatus.FAILURE.value:
        error = str(summary.get("error", "")).strip()
        if error:
            return f"      {status}  {error}"
        return f"      {status}"
    return (
        f"      {status}  fetched={_count(summary, 'fetched_count')}  "
        f"inserted={_count(summary, 'inserted_count')}  "
        f"updated={_count(summary, 'updated_count')}  "
        f"stale={_count(summary, 'marked_stale_count')}  "
        f"closed={_count(summary, 'marked_closed_count')}"
    )


def format_sync_report(report: Mapping[str, Any]) -> str:
    sources = [dict(item) for item in report.get("sources", ())]
    lines = ["Catalog sync report"]
    for summary in sources:
        source_id = str(summary.get("source_id", "unknown"))
        status = str(summary.get("status", "unknown"))
        if status == IngestionRunStatus.FAILURE.value:
            error = str(summary.get("error", "")).strip()
            detail = f"  {error}" if error else ""
            lines.append(f"  {source_id}  {status}{detail}")
            continue
        lines.append(
            f"  {source_id}  {status}  "
            f"inserted={_count(summary, 'inserted_count')}  "
            f"updated={_count(summary, 'updated_count')}  "
            f"stale={_count(summary, 'marked_stale_count')}  "
            f"closed={_count(summary, 'marked_closed_count')}"
        )

    inserted = sum(_count(item, "inserted_count") for item in sources)
    updated = sum(_count(item, "updated_count") for item in sources)
    stale = sum(_count(item, "marked_stale_count") for item in sources)
    closed = sum(_count(item, "marked_closed_count") for item in sources)
    lines.append("")
    if inserted == updated == stale == closed == 0:
        lines.append("  Totals: no catalog changes")
    else:
        lines.append(
            f"  Totals: {inserted} inserted, {updated} updated, "
            f"{stale} stale, {closed} closed"
        )
    failed = sum(1 for item in sources if _source_failed(item))
    succeeded = len(sources) - failed
    lines.append(f"  Result: {succeeded}/{len(sources)} sources succeeded")
    return "\n".join(lines)


async def sync_all_sources(
    settings: Settings | None = None,
    *,
    ingest_one: IngestOne | None = None,
    on_source_start: OnSourceStart | None = None,
    on_source_finish: OnSourceFinish | None = None,
) -> dict[str, Any]:
    resolved = settings if settings is not None else Settings()
    ids = resolved.enabled_sources

    async def default_ingest(source_id: str) -> Mapping[str, Any]:
        return await ingest_source(source_id, resolved)

    runner = ingest_one if ingest_one is not None else default_ingest
    sources: list[dict[str, Any]] = []
    ok = True
    total = len(ids)
    for index, source_id in enumerate(ids, start=1):
        if on_source_start is not None:
            on_source_start(source_id, index, total)
        try:
            summary = dict(await runner(source_id))
        except Exception as exc:
            logger.exception("Source %s failed", source_id)
            summary = _failed_source_result(source_id, exc)
            ok = False
        else:
            if _source_failed(summary):
                ok = False
        sources.append(summary)
        if on_source_finish is not None:
            on_source_finish(summary)
    return {"ok": ok, "sources": sources}


def main() -> None:
    report = asyncio.run(
        sync_all_sources(
            on_source_start=lambda source_id, index, total: print(
                format_source_start(source_id, index, total),
                flush=True,
            ),
            on_source_finish=lambda summary: print(
                format_source_result(summary),
                flush=True,
            ),
        )
    )
    print(flush=True)
    print(format_sync_report(report), flush=True)
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
