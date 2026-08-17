from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from tests.factories import job_group_input, persist_job, source_posting_input

from job_engine.domain.enums import (
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import Compensation, EligibleLocation, TechnologyTerm


def _ids(payload: dict[str, object]) -> list[str]:
    items = payload["items"]
    assert isinstance(items, list)
    return [str(item["id"]) for item in items]


async def _seed_matrix(session: AsyncSession) -> dict[str, UUID]:
    now = datetime.now(UTC)
    ids: dict[str, UUID] = {}
    ids["python_brazil"] = await persist_job(
        session,
        group=job_group_input(
            title="Python Engineer",
            company="Acme",
            description="Build APIs with FastAPI.",
            remote_status=RemoteStatus.REMOTE,
            seniority=Seniority.MID,
            role_families=("python",),
            technologies=(TechnologyTerm(term="Python", source_text="Python"),),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.BRAZIL,
                    evidence_text="Remote in Brazil",
                ),
            ),
            location_eligibility_unknown=False,
            compensation=Compensation(
                original_text="$120000/year",
                currency="USD",
                period="year",
                minimum=Decimal("120000"),
                annual_usd_minimum=Decimal("120000"),
            ),
            published_at=now - timedelta(hours=1),
            first_seen_at=now - timedelta(hours=1),
            last_seen_at=now,
        ),
        postings=[source_posting_input(source_id="jobicy", source_posting_id="py-1")],
    )
    ids["frontend_latam"] = await persist_job(
        session,
        group=job_group_input(
            title="React Developer",
            company="Globex",
            description="Frontend product work.",
            remote_status=RemoteStatus.HYBRID,
            seniority=Seniority.SENIOR,
            role_families=("frontend",),
            technologies=(TechnologyTerm(term="React", source_text="React"),),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.LATIN_AMERICA,
                    evidence_text="LATAM",
                ),
            ),
            location_eligibility_unknown=False,
            compensation=Compensation(),
            published_at=now - timedelta(days=3),
            first_seen_at=now - timedelta(days=3),
            last_seen_at=now,
        ),
        postings=[
            source_posting_input(source_id="himalayas", source_posting_id="fe-1")
        ],
    )
    ids["grouped"] = await persist_job(
        session,
        group=job_group_input(
            title="Backend Engineer",
            company="Initech",
            description="Grouped posting.",
            remote_status=RemoteStatus.REMOTE,
            seniority=Seniority.MID,
            role_families=("backend",),
            technologies=(TechnologyTerm(term="FastAPI", source_text="FastAPI"),),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.WORLDWIDE,
                    evidence_text="Anywhere",
                ),
            ),
            compensation=Compensation(
                original_text="$90000/year",
                currency="USD",
                period="year",
                minimum=Decimal("90000"),
                annual_usd_minimum=Decimal("90000"),
            ),
            published_at=now - timedelta(hours=2),
            first_seen_at=now - timedelta(hours=2),
            last_seen_at=now,
        ),
        postings=[
            source_posting_input(
                source_id="himalayas",
                source_posting_id="grp-h",
                application_url="https://himalayas.example/jobs/grp-h",
                application_url_canonical="https://himalayas.example/jobs/grp-h",
            ),
            source_posting_input(
                source_id="jobicy",
                source_posting_id="grp-j",
                application_url="https://jobicy.example/jobs/grp-j",
                application_url_canonical="https://jobicy.example/jobs/grp-j",
            ),
        ],
    )
    ids["unknown_eligibility"] = await persist_job(
        session,
        group=job_group_input(
            title="Unknown Eligibility Role",
            role_families=("software_developer",),
            eligible_locations=(),
            location_eligibility_unknown=True,
            published_at=now - timedelta(hours=3),
            first_seen_at=now - timedelta(hours=3),
            last_seen_at=now,
        ),
        postings=[source_posting_input(source_posting_id="unk-el")],
    )
    ids["onsite_junior"] = await persist_job(
        session,
        group=job_group_input(
            title="Onsite Junior",
            remote_status=RemoteStatus.ONSITE,
            seniority=Seniority.JUNIOR,
            role_families=("software_developer",),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.WORLDWIDE,
                    evidence_text="Anywhere",
                ),
            ),
            location_eligibility_unknown=False,
            published_at=now - timedelta(hours=4),
            first_seen_at=now - timedelta(hours=4),
            last_seen_at=now,
        ),
        postings=[source_posting_input(source_posting_id="onsite-1")],
    )
    ids["old"] = await persist_job(
        session,
        group=job_group_input(
            title="Old Listing",
            role_families=("software_developer",),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.WORLDWIDE,
                    evidence_text="Anywhere",
                ),
            ),
            location_eligibility_unknown=False,
            published_at=now - timedelta(days=40),
            first_seen_at=now - timedelta(days=40),
            last_seen_at=now - timedelta(days=10),
        ),
        postings=[source_posting_input(source_posting_id="old-1")],
    )
    ids["high_comp"] = await persist_job(
        session,
        group=job_group_input(
            title="Staff Engineer",
            seniority=Seniority.LEAD_STAFF,
            role_families=("software_developer",),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.WORLDWIDE,
                    evidence_text="Anywhere",
                ),
            ),
            location_eligibility_unknown=False,
            compensation=Compensation(
                original_text="$200000/year",
                currency="USD",
                period="year",
                minimum=Decimal("200000"),
                annual_usd_minimum=Decimal("200000"),
            ),
            published_at=now - timedelta(hours=5),
            first_seen_at=now - timedelta(hours=5),
            last_seen_at=now,
        ),
        postings=[source_posting_input(source_posting_id="high-1")],
    )
    ids["closed"] = await persist_job(
        session,
        group=job_group_input(
            title="Closed Python Role",
            status=JobStatus.CLOSED,
            closed_at=now,
            role_families=("python",),
        ),
        postings=[
            source_posting_input(source_posting_id="closed-1", status=JobStatus.CLOSED)
        ],
    )
    ids["stale"] = await persist_job(
        session,
        group=job_group_input(
            title="Stale Python Role",
            status=JobStatus.STALE,
            role_families=("python",),
        ),
        postings=[
            source_posting_input(source_posting_id="stale-1", status=JobStatus.STALE)
        ],
    )
    ids["accent"] = await persist_job(
        session,
        group=job_group_input(
            title="São Paulo Engineer",
            role_families=("software_developer",),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.WORLDWIDE,
                    evidence_text="Anywhere",
                ),
            ),
            location_eligibility_unknown=False,
            published_at=now - timedelta(minutes=30),
            first_seen_at=now - timedelta(minutes=30),
            last_seen_at=now,
        ),
        postings=[source_posting_input(source_posting_id="accent-1")],
    )
    ids["wildcard"] = await persist_job(
        session,
        group=job_group_input(
            title="100% remote specialist",
            role_families=("software_developer",),
            eligible_locations=(
                EligibleLocation(
                    region=LocationEligibilityRegion.WORLDWIDE,
                    evidence_text="Anywhere",
                ),
            ),
            location_eligibility_unknown=False,
            published_at=now - timedelta(minutes=20),
            first_seen_at=now - timedelta(minutes=20),
            last_seen_at=now,
        ),
        postings=[source_posting_input(source_posting_id="wild-1")],
    )
    return ids


async def test_empty_catalog_returns_zero_pages(client: AsyncClient) -> None:
    response = await client.get("/api/v1/jobs")
    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "page": 1,
        "page_size": 25,
        "total": 0,
        "total_pages": 0,
    }


async def test_search_excludes_closed_and_stale(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    response = await client.get("/api/v1/jobs")
    assert response.status_code == 200
    found = set(_ids(response.json()))
    assert str(ids["closed"]) not in found
    assert str(ids["stale"]) not in found
    assert str(ids["python_brazil"]) in found


async def test_each_filter_alone(session: AsyncSession, client: AsyncClient) -> None:
    ids = await _seed_matrix(session)

    async def only(params: str) -> set[str]:
        response = await client.get(f"/api/v1/jobs?{params}")
        assert response.status_code == 200
        return set(_ids(response.json()))

    assert await only("q=Build APIs with FastAPI") == {str(ids["python_brazil"])}
    assert await only("role_family=frontend") == {str(ids["frontend_latam"])}
    assert await only("technology=React") == {str(ids["frontend_latam"])}
    assert await only("remote_status=hybrid") == {str(ids["frontend_latam"])}
    assert await only("location_eligibility=brazil") == {str(ids["python_brazil"])}
    assert await only("location_eligibility=unknown") == {
        str(ids["unknown_eligibility"])
    }
    assert await only("seniority=junior") == {str(ids["onsite_junior"])}
    assert await only("source=himalayas") == {
        str(ids["frontend_latam"]),
        str(ids["grouped"]),
    }
    recent = await only("posted_within=24h")
    assert str(ids["python_brazil"]) in recent
    assert str(ids["old"]) not in recent
    week = await only("posted_within=7d")
    assert str(ids["frontend_latam"]) in week
    assert str(ids["old"]) not in week
    month = await only("posted_within=30d")
    assert str(ids["frontend_latam"]) in month
    assert str(ids["old"]) not in month
    any_date = await only("posted_within=any")
    assert str(ids["old"]) in any_date


async def test_and_across_categories_or_within_category(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    and_response = await client.get(
        "/api/v1/jobs?role_family=python&remote_status=remote"
    )
    assert set(_ids(and_response.json())) == {str(ids["python_brazil"])}

    or_response = await client.get(
        "/api/v1/jobs?role_family=python&role_family=frontend"
    )
    assert set(_ids(or_response.json())) == {
        str(ids["python_brazil"]),
        str(ids["frontend_latam"]),
    }


async def test_grouped_sources_are_one_item(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    response = await client.get("/api/v1/jobs?q=Grouped")
    payload = response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["id"] == str(ids["grouped"])
    assert [source["source_id"] for source in item["sources"]] == [
        "himalayas",
        "jobicy",
    ]
    assert item["primary_application_url"] == "https://himalayas.example/jobs/grp-h"


async def test_unknown_compensation_filter_and_json(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    included = await client.get(
        "/api/v1/jobs?minimum_annual_usd=100000&include_unknown_compensation=true"
    )
    included_ids = set(_ids(included.json()))
    assert str(ids["python_brazil"]) in included_ids
    assert str(ids["frontend_latam"]) in included_ids
    assert str(ids["grouped"]) not in included_ids

    excluded = await client.get(
        "/api/v1/jobs?minimum_annual_usd=100000&include_unknown_compensation=false"
    )
    excluded_ids = set(_ids(excluded.json()))
    assert str(ids["python_brazil"]) in excluded_ids
    assert str(ids["frontend_latam"]) not in excluded_ids

    unknown_item = next(
        item for item in (await client.get("/api/v1/jobs?q=React")).json()["items"]
    )
    money = unknown_item["compensation"]
    assert money["annual_usd_minimum"] is None
    assert money["annual_usd_maximum"] is None
    assert money["minimum"] is None
    assert "0" not in str(money.values())

    known_only = await client.get("/api/v1/jobs?include_unknown_compensation=false")
    known_only_ids = set(_ids(known_only.json()))
    assert str(ids["python_brazil"]) in known_only_ids
    assert str(ids["frontend_latam"]) not in known_only_ids


async def test_description_excerpt_returns_plain_text_not_html(
    session: AsyncSession, client: AsyncClient
) -> None:
    await persist_job(
        session,
        group=job_group_input(
            title="HTML Card Role",
            description=(
                "<p>We are seeking a highly skilled and motivated "
                "<strong>Senior Software Engineer (React)</strong>.</p>"
            ),
        ),
    )
    response = await client.get("/api/v1/jobs?q=HTML+Card")
    assert response.status_code == 200
    item = response.json()["items"][0]
    excerpt = item["description_excerpt"]
    assert excerpt is not None
    assert "<p>" not in excerpt
    assert "<strong>" not in excerpt
    assert "Senior Software Engineer (React)" in excerpt


async def test_compensation_sort_places_unknown_last(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    response = await client.get("/api/v1/jobs?sort=compensation_desc&page_size=100")
    ordered = _ids(response.json())
    assert ordered[0] == str(ids["high_comp"])
    assert ordered.index(str(ids["python_brazil"])) < ordered.index(
        str(ids["frontend_latam"])
    )


async def test_newest_sort_and_pagination_stability(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    first = await client.get("/api/v1/jobs?sort=newest&page=1&page_size=2")
    second = await client.get("/api/v1/jobs?sort=newest&page=2&page_size=2")
    payload = first.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 2
    assert payload["total"] >= 3
    assert payload["total_pages"] == (payload["total"] + 1) // 2
    first_ids = _ids(payload)
    second_ids = _ids(second.json())
    assert len(first_ids) == 2
    assert set(first_ids).isdisjoint(second_ids)
    assert str(ids["wildcard"]) == first_ids[0]


async def test_accent_sensitive_and_escaped_ilike(
    session: AsyncSession, client: AsyncClient
) -> None:
    ids = await _seed_matrix(session)
    accented = await client.get("/api/v1/jobs", params={"q": "São"})
    ascii_query = await client.get("/api/v1/jobs", params={"q": "Sao"})
    assert str(ids["accent"]) in _ids(accented.json())
    assert str(ids["accent"]) not in _ids(ascii_query.json())

    wildcard = await client.get("/api/v1/jobs", params={"q": "100%"})
    matched = set(_ids(wildcard.json()))
    assert str(ids["wildcard"]) in matched
    assert str(ids["python_brazil"]) not in matched


async def test_validation_errors(client: AsyncClient) -> None:
    cases = [
        "/api/v1/jobs?page=0",
        "/api/v1/jobs?page_size=101",
        "/api/v1/jobs?posted_within=year",
        "/api/v1/jobs?sort=relevance",
        "/api/v1/jobs?role_family=data_scientist",
        "/api/v1/jobs?source=not-a-source",
        "/api/v1/jobs?technology=Fortran",
        "/api/v1/jobs?remote_status=eligible",
    ]
    for url in cases:
        response = await client.get(url)
        assert response.status_code == 422, url


async def test_page_past_end_keeps_total(
    session: AsyncSession, client: AsyncClient
) -> None:
    await _seed_matrix(session)
    response = await client.get("/api/v1/jobs?page=99&page_size=25")
    payload = response.json()
    assert payload["items"] == []
    assert payload["total"] > 0
    assert payload["page"] == 99
