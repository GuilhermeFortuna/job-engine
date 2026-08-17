from __future__ import annotations

import argparse
import asyncio
import json

from job_engine.config import Settings
from job_engine.db.session import create_engine, create_session_factory
from job_engine.services.ingestion import run_ingestion


async def _run(source_id: str) -> None:
    settings = Settings()
    engine = create_engine(settings.database_url)
    factory = create_session_factory(engine)
    try:
        async with factory() as session:
            run = await run_ingestion(session, source_id, settings)
            await session.commit()
            print(
                json.dumps(
                    {
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
                )
            )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Job Engine source ingestion")
    parser.add_argument("source_id", help="Approved source ID, e.g. himalayas")
    args = parser.parse_args()
    asyncio.run(_run(args.source_id))


if __name__ == "__main__":
    main()
