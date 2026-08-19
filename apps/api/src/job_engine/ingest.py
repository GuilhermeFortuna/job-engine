from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from job_engine.config import Settings
from job_engine.db.session import create_engine, create_session_factory
from job_engine.domain.jobs import IngestionRun
from job_engine.services.ingestion import run_ingestion


def ingestion_run_summary(run: IngestionRun) -> dict[str, Any]:
    return {
        "id": str(run.id),
        "source_id": run.source_id,
        "status": run.status.value,
        "fetched_count": run.fetched_count,
        "accepted_count": run.accepted_count,
        "rejected_count": run.rejected_count,
        "inserted_count": run.inserted_count,
        "updated_count": run.updated_count,
        "marked_stale_count": run.marked_stale_count,
        "marked_closed_count": run.marked_closed_count,
    }


async def ingest_source(
    source_id: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    resolved = settings if settings is not None else Settings()
    engine = create_engine(resolved.database_url)
    factory = create_session_factory(engine)
    try:
        async with factory() as session:
            run = await run_ingestion(session, source_id, resolved)
            await session.commit()
            return ingestion_run_summary(run)
    finally:
        await engine.dispose()


async def _run(source_id: str) -> None:
    print(json.dumps(await ingest_source(source_id)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Job Engine source ingestion")
    parser.add_argument("source_id", help="Approved source ID, e.g. himalayas")
    args = parser.parse_args()
    asyncio.run(_run(args.source_id))


if __name__ == "__main__":
    main()
