"""Seed a disposable database with profile, resume, and one catalog job.

Used by CROSS-012 production smoke. The smoke creates the application run
through POST /api/v1/application-runs rather than inserting it here.

Prints one JSON object to stdout.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

API_ROOT = Path(__file__).resolve().parents[3] / "api"
sys.path.insert(0, str(API_ROOT / "src"))

from job_engine.config import DOCUMENTED_DATABASE_URL  # noqa: E402
from job_engine.db.repositories import (  # noqa: E402
    ApplicantVaultRepository,
    CatalogRepository,
)
from job_engine.db.session import create_engine as create_async_engine  # noqa: E402
from job_engine.db.session import create_session_factory, to_sync_url  # noqa: E402
from job_engine.domain.applicant import (  # noqa: E402
    ApplicantProfileInput,
    ConfirmedField,
    FieldSource,
    PolicyCategory,
    ResumeAssetInput,
    ValueState,
)
from job_engine.domain.enums import (  # noqa: E402
    EmploymentType,
    JobStatus,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import Compensation, JobGroupInput, SourcePostingInput  # noqa: E402

SYNTHETIC_PDF = b"%PDF-1.4 synthetic fixture resume\n%%EOF\n"


def _owner_field(value: str) -> ConfirmedField[str]:
    return ConfirmedField[str](
        value=value,
        source=FieldSource.OWNER,
        state=ValueState.PROVIDED,
        last_confirmed_at=datetime.now(UTC),
        policy_category=PolicyCategory.VERIFIED_PROFILE,
    )


def create_database(db_name: str) -> str:
    engine = create_engine(to_sync_url(DOCUMENTED_DATABASE_URL), isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        engine.dispose()
    admin_url = make_url(DOCUMENTED_DATABASE_URL)
    return admin_url.set(database=db_name).render_as_string(hide_password=False)


def migrate(database_url: str) -> None:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option(
        "sqlalchemy.url", to_sync_url(database_url).render_as_string(hide_password=False)
    )
    command.upgrade(config, "head")


async def seed(
    database_url: str,
    application_url: str,
    canonical_url: str,
    source_id: str,
    resume_root: Path,
) -> dict[str, str]:
    resume_root.mkdir(parents=True, exist_ok=True)
    pdf_path = resume_root / "synthetic-resume.pdf"
    pdf_path.write_bytes(SYNTHETIC_PDF)
    resume_sha256 = hashlib.sha256(SYNTHETIC_PDF).hexdigest()

    engine = create_async_engine(database_url)
    factory = create_session_factory(engine)
    async with factory() as session:
        vault = ApplicantVaultRepository(session)
        await vault.replace_profile(
            ApplicantProfileInput(
                first_name=_owner_field("Ada"),
                last_name=_owner_field("Fixture"),
                email=_owner_field("ada.fixture@example.test"),
                phone=_owner_field("+15550100"),
                city=_owner_field("Lisbon"),
                country=_owner_field("Portugal"),
            ),
            expected_version=None,
        )
        resume = await vault.create_resume(
            ResumeAssetInput(
                resume_id="res_fixture_default",
                label="Fixture resume",
                source_markdown_path="synthetic-resume.md",
                upload_pdf_path="synthetic-resume.pdf",
                language="en",
                is_default=True,
            ),
            sha256=resume_sha256,
        )

        catalog = CatalogRepository(session)
        now = datetime.now(UTC)
        group = await catalog.create_job_group(
            JobGroupInput(
                title="Senior Platform Engineer",
                title_original="Senior Platform Engineer",
                title_comparison_key="senior platform engineer",
                company="Fixture Industries",
                company_original="Fixture Industries",
                company_comparison_key="fixture industries",
                description="Synthetic role used only by the desktop production smoke.",
                location_original="Remote",
                location_comparison_key="remote",
                location_normalized_country="PT",
                location_normalized_region=None,
                remote_status=RemoteStatus.REMOTE,
                employment_type=EmploymentType.FULL_TIME,
                seniority=Seniority.SENIOR,
                seniority_original="Senior",
                compensation=Compensation(),
                published_at=now,
                first_seen_at=now,
                last_seen_at=now,
                closed_at=None,
                status=JobStatus.ACTIVE,
                location_eligibility_unknown=False,
                last_ingestion_run_id=None,
            )
        )
        posting = await catalog.upsert_source_posting(
            SourcePostingInput(
                source_id=source_id,
                source_posting_id="smoke-1",
                source_name=source_id,
                application_url=application_url,
                application_url_canonical=canonical_url,
                title_original="Senior Platform Engineer",
                company_original="Fixture Industries",
                description="Synthetic",
                location_original="Remote",
                remote_status=RemoteStatus.REMOTE,
                employment_type=EmploymentType.FULL_TIME,
                seniority=Seniority.SENIOR,
                first_seen_at=now,
                last_seen_at=now,
                closed_at=None,
                status=JobStatus.ACTIVE,
            )
        )
        await catalog.add_posting_to_group(group.id, posting.id)
        await session.commit()

    await engine.dispose()
    return {
        "job_group_id": str(group.id),
        "resume_id": resume.resume_id,
        "resume_sha256": resume_sha256,
    }


def main() -> None:
    application_url = sys.argv[1]
    canonical_url = sys.argv[2]
    source_id = sys.argv[3]
    resume_root = Path(sys.argv[4])
    db_name = f"job_engine_desktop_prod_{uuid4().hex[:12]}"

    database_url = create_database(db_name)
    migrate(database_url)
    seeded = asyncio.run(
        seed(database_url, application_url, canonical_url, source_id, resume_root)
    )

    print(
        json.dumps(
            {
                "database_url": database_url,
                "database_name": db_name,
                **seeded,
            }
        )
    )


if __name__ == "__main__":
    main()
