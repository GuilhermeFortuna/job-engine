from __future__ import annotations

import logging
from typing import Any

import pytest

from job_engine.config import Settings
from job_engine.domain.enums import IngestionRunStatus
from job_engine.sync import (
    format_source_result,
    format_source_start,
    format_sync_report,
    main,
    sync_all_sources,
)

AGGREGATOR_SOURCES = ("himalayas", "jobicy", "remoteok")

SUCCESS_COUNTS = {
    "fetched_count": 10,
    "accepted_count": 9,
    "rejected_count": 1,
    "inserted_count": 4,
    "updated_count": 5,
    "marked_stale_count": 0,
    "marked_closed_count": 0,
}


def _success(source_id: str) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-00000000000{len(source_id)}",
        "source_id": source_id,
        "status": IngestionRunStatus.SUCCESS.value,
        **SUCCESS_COUNTS,
    }


@pytest.mark.asyncio
async def test_sync_runs_all_enabled_sources_and_combines_summaries() -> None:
    called: list[str] = []

    async def ingest_one(source_id: str) -> dict[str, Any]:
        called.append(source_id)
        return _success(source_id)

    report = await sync_all_sources(
        Settings(enabled_sources=AGGREGATOR_SOURCES),
        ingest_one=ingest_one,
    )

    assert called == ["himalayas", "jobicy", "remoteok"]
    assert report["ok"] is True
    assert [item["source_id"] for item in report["sources"]] == called
    assert report["sources"][0]["fetched_count"] == 10
    assert report["sources"][1]["inserted_count"] == 4
    assert report["sources"][2]["updated_count"] == 5


@pytest.mark.asyncio
async def test_sync_continues_after_one_source_raises(
    caplog: pytest.LogCaptureFixture,
) -> None:
    called: list[str] = []

    async def ingest_one(source_id: str) -> dict[str, Any]:
        called.append(source_id)
        if source_id == "jobicy":
            raise RuntimeError("jobicy upstream timeout")
        return _success(source_id)

    with caplog.at_level(logging.ERROR, logger="job_engine.sync"):
        report = await sync_all_sources(
            Settings(enabled_sources=AGGREGATOR_SOURCES),
            ingest_one=ingest_one,
        )

    assert called == ["himalayas", "jobicy", "remoteok"]
    assert report["ok"] is False
    by_source = {item["source_id"]: item for item in report["sources"]}
    assert by_source["himalayas"]["status"] == IngestionRunStatus.SUCCESS.value
    assert by_source["remoteok"]["status"] == IngestionRunStatus.SUCCESS.value
    assert by_source["jobicy"]["status"] == IngestionRunStatus.FAILURE.value
    assert "jobicy" in by_source["jobicy"]["error"]
    assert "jobicy upstream timeout" in by_source["jobicy"]["error"]
    assert any(
        "jobicy" in record.getMessage() and "failed" in record.getMessage().lower()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_sync_treats_ingestion_failure_status_as_failed_source() -> None:
    async def ingest_one(source_id: str) -> dict[str, Any]:
        if source_id == "himalayas":
            return {
                "id": "00000000-0000-0000-0000-000000000001",
                "source_id": source_id,
                "status": IngestionRunStatus.FAILURE.value,
                "fetched_count": 0,
                "accepted_count": 0,
                "rejected_count": 0,
                "inserted_count": 0,
                "updated_count": 0,
                "marked_stale_count": 0,
                "marked_closed_count": 0,
            }
        return _success(source_id)

    report = await sync_all_sources(
        Settings(enabled_sources=AGGREGATOR_SOURCES),
        ingest_one=ingest_one,
    )

    assert report["ok"] is False
    assert report["sources"][0]["source_id"] == "himalayas"
    assert report["sources"][0]["status"] == IngestionRunStatus.FAILURE.value
    assert report["sources"][1]["status"] == IngestionRunStatus.SUCCESS.value
    assert report["sources"][2]["status"] == IngestionRunStatus.SUCCESS.value


@pytest.mark.asyncio
async def test_sync_partial_success_does_not_fail_the_run() -> None:
    async def ingest_one(source_id: str) -> dict[str, Any]:
        summary = _success(source_id)
        if source_id == "remoteok":
            summary["status"] = IngestionRunStatus.PARTIAL_SUCCESS.value
        return summary

    report = await sync_all_sources(
        Settings(enabled_sources=AGGREGATOR_SOURCES),
        ingest_one=ingest_one,
    )

    assert report["ok"] is True
    assert report["sources"][2]["status"] == IngestionRunStatus.PARTIAL_SUCCESS.value


def test_format_source_start_includes_index_and_source() -> None:
    line = format_source_start("himalayas", 1, 3)
    assert "1/3" in line
    assert "himalayas" in line


def test_format_source_result_includes_catalog_counts() -> None:
    line = format_source_result(_success("himalayas"))
    assert "success" in line
    assert "fetched=10" in line
    assert "inserted=4" in line
    assert "updated=5" in line


def test_format_source_result_includes_failure_error() -> None:
    line = format_source_result(
        {
            "source_id": "jobicy",
            "status": IngestionRunStatus.FAILURE.value,
            "error": "jobicy: RuntimeError: jobicy upstream timeout",
        }
    )
    assert "failure" in line
    assert "jobicy upstream timeout" in line


def test_format_sync_report_summarizes_updates() -> None:
    text = format_sync_report(
        {
            "ok": True,
            "sources": [
                _success("himalayas"),
                _success("jobicy"),
                _success("remoteok"),
            ],
        }
    )
    assert "himalayas" in text
    assert "jobicy" in text
    assert "remoteok" in text
    assert "12 inserted" in text
    assert "15 updated" in text


def test_format_sync_report_when_nothing_changed() -> None:
    unchanged = {
        **_success("himalayas"),
        "inserted_count": 0,
        "updated_count": 0,
        "marked_stale_count": 0,
        "marked_closed_count": 0,
    }
    text = format_sync_report({"ok": True, "sources": [unchanged]})
    assert "no catalog changes" in text.lower()


@pytest.mark.asyncio
async def test_sync_emits_progress_as_each_source_runs() -> None:
    events: list[tuple[str, str]] = []

    async def ingest_one(source_id: str) -> dict[str, Any]:
        events.append(("run", source_id))
        return _success(source_id)

    await sync_all_sources(
        Settings(enabled_sources=AGGREGATOR_SOURCES),
        ingest_one=ingest_one,
        on_source_start=lambda source_id, index, total: events.append(
            ("start", f"{index}/{total}:{source_id}")
        ),
        on_source_finish=lambda summary: events.append(
            ("finish", str(summary["source_id"]))
        ),
    )

    assert events == [
        ("start", "1/3:himalayas"),
        ("run", "himalayas"),
        ("finish", "himalayas"),
        ("start", "2/3:jobicy"),
        ("run", "jobicy"),
        ("finish", "jobicy"),
        ("start", "3/3:remoteok"),
        ("run", "remoteok"),
        ("finish", "remoteok"),
    ]


def test_main_prints_progress_and_final_report(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def ingest_one(
        source_id: str, settings: Settings | None = None
    ) -> dict[str, Any]:
        return _success(source_id)

    monkeypatch.setattr("job_engine.sync.ingest_source", ingest_one)

    with pytest.raises(SystemExit) as exited:
        main()

    assert exited.value.code == 0
    output = capsys.readouterr().out
    assert "1/5" in output
    assert "himalayas" in output
    assert "jobicy" in output
    assert "remoteok" in output
    assert "greenhouse" in output
    assert "lever" in output
    assert "20 inserted" in output
    assert "25 updated" in output
    assert "Catalog sync report" in output


def test_main_exits_nonzero_when_a_source_fails(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def ingest_one(
        source_id: str, settings: Settings | None = None
    ) -> dict[str, Any]:
        if source_id == "remoteok":
            raise RuntimeError("remoteok unavailable")
        return _success(source_id)

    monkeypatch.setattr("job_engine.sync.ingest_source", ingest_one)

    with pytest.raises(SystemExit) as exited:
        main()

    assert exited.value.code == 1
    output = capsys.readouterr().out
    assert "remoteok" in output
    assert "greenhouse" in output
    assert "lever" in output
    assert "failure" in output
    assert "remoteok unavailable" in output
    assert "Catalog sync report" in output
