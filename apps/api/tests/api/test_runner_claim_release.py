"""HTTP contract for targeted claiming and runner claim release."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.config import Settings
from job_engine.db.repositories import CatalogRepository
from job_engine.domain.applications import RunnerReleaseReason
from job_engine.domain.enums import EmploymentType, JobStatus, RemoteStatus, Seniority
from job_engine.domain.jobs import Compensation, JobGroupInput, SourcePostingInput
from tests.api.test_applications import _setup_fixtures

RELEASE_REASON = RunnerReleaseReason.UNSUPPORTED_AUTOMATION_MODE.value


def _release_path(run_id: str) -> str:
    return f"/api/v1/runner/runs/{run_id}/release-claim"


def _runner_headers(settings: Settings, **extra: str) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {settings.runner_secret}",
        "X-Runner-Id": "test_runner_1",
    }
    headers.update(extra)
    return headers


async def _create_second_group(session: AsyncSession) -> UUID:
    """A second job group, so a second run can exist alongside the first."""
    now = datetime.now(UTC)
    cat_repo = CatalogRepository(session)
    group = await cat_repo.create_job_group(
        JobGroupInput(
            title="Staff Platform Engineer",
            title_original="Staff Platform Engineer",
            title_comparison_key="staff platform engineer",
            company="Globex",
            company_original="Globex",
            company_comparison_key="globex",
            description="Run the platform",
            location_original="Remote",
            location_comparison_key="remote",
            location_normalized_country="US",
            location_normalized_region=None,
            remote_status=RemoteStatus.REMOTE,
            employment_type=EmploymentType.FULL_TIME,
            seniority=Seniority.SENIOR,
            seniority_original="Staff",
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
    posting = await cat_repo.upsert_source_posting(
        SourcePostingInput(
            source_id="globex_greenhouse",
            source_posting_id="202",
            source_name="Greenhouse",
            application_url="https://boards.greenhouse.io/globex/jobs/202",
            application_url_canonical="https://boards.greenhouse.io/globex/jobs/202",
            title_original="Staff Platform Engineer",
            company_original="Globex",
            description="Run the platform",
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
    await cat_repo.add_posting_to_group(group.id, posting.id)
    await session.commit()
    return group.id


async def _create_run(client: AsyncClient, group_id: UUID, mode: str) -> str:
    resp = await client.post(
        "/api/v1/application-runs",
        json={"job_group_ids": [str(group_id)], "automation_mode": mode},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["created_runs"][0]["id"])


async def _claim(
    client: AsyncClient, settings: Settings, run_id: str | None = None
) -> dict[str, object]:
    resp = await client.post(
        "/api/v1/runner/claims",
        headers=_runner_headers(settings),
        json={"run_id": run_id} if run_id else None,
    )
    assert resp.status_code == 200, resp.text
    return dict(resp.json())


# --- Targeted claim ---------------------------------------------------------


async def test_targeted_claim_takes_the_requested_run(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_a, _, _ = await _setup_fixtures(session, settings)
    group_b = await _create_second_group(session)

    first = await _create_run(client, group_a, "semi_auto_pause_before_submit")
    second = await _create_run(client, group_b, "semi_auto_pause_before_submit")

    claim = await _claim(client, settings, run_id=second)
    run = claim["run"]
    assert isinstance(run, dict)
    assert run["id"] == second
    assert run["status"] == "claimed"

    detail = await client.get(f"/api/v1/application-runs/{first}")
    assert detail.json()["status"] == "queued"


async def test_targeted_claim_of_unclaimable_run_returns_204(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_a, _, _ = await _setup_fixtures(session, settings)
    group_b = await _create_second_group(session)

    target = await _create_run(client, group_a, "semi_auto_pause_before_submit")
    other = await _create_run(client, group_b, "semi_auto_pause_before_submit")

    # Take the target out of the queue without holding a lease, so nothing but
    # the targeting itself can explain the 204.
    cancelled = await client.post(f"/api/v1/application-runs/{target}/cancel", json={})
    assert cancelled.status_code == 200

    resp = await client.post(
        "/api/v1/runner/claims",
        headers=_runner_headers(settings),
        json={"run_id": target},
    )
    # `other` is queued and would satisfy an untargeted claim, but a targeted
    # claim must never substitute a different run.
    assert resp.status_code == 204
    assert not resp.content

    detail = await client.get(f"/api/v1/application-runs/{other}")
    assert detail.json()["status"] == "queued"


async def test_claim_without_body_preserves_fifo(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_a, _, _ = await _setup_fixtures(session, settings)
    group_b = await _create_second_group(session)

    first = await _create_run(client, group_a, "semi_auto_pause_before_submit")
    await _create_run(client, group_b, "semi_auto_pause_before_submit")

    claim = await _claim(client, settings)
    run = claim["run"]
    assert isinstance(run, dict)
    assert run["id"] == first


# --- Release ----------------------------------------------------------------


async def test_release_requeues_run_and_kills_grant(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")

    claim = await _claim(client, settings, run_id=run_id)
    lease_token = str(claim["lease_token"])
    grant_token = str(claim["grant_token"])

    resp = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings,
            **{"X-Runner-Lease-Token": lease_token, "Idempotency-Key": "idem-1"},
        ),
        json={"reason": RELEASE_REASON},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "queued"
    assert body["retry_failure_count"] == 0

    # The grant issued with the released lease no longer works.
    resume_resp = await client.get(
        f"/api/v1/runner/runs/{run_id}/resume-asset",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Resume-Grant-Token": grant_token,
        },
    )
    assert resume_resp.status_code == 410

    # The run is immediately claimable again.
    reclaim = await _claim(client, settings, run_id=run_id)
    reclaimed = reclaim["run"]
    assert isinstance(reclaimed, dict)
    assert reclaimed["status"] == "claimed"


async def test_release_requires_idempotency_key(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    claim = await _claim(client, settings, run_id=run_id)

    resp = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings, **{"X-Runner-Lease-Token": str(claim["lease_token"])}
        ),
        json={"reason": RELEASE_REASON},
    )
    assert resp.status_code == 400
    assert "Idempotency-Key" in resp.json()["detail"]


async def test_release_rejects_bad_credentials(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    await _claim(client, settings, run_id=run_id)

    # Wrong runner bearer secret.
    bad_secret = await client.post(
        _release_path(run_id),
        headers={
            "Authorization": "Bearer not-the-runner-secret",
            "X-Runner-Lease-Token": "whatever",
            "Idempotency-Key": "idem-1",
        },
        json={"reason": RELEASE_REASON},
    )
    assert bad_secret.status_code == 401

    # Missing lease token.
    missing_lease = await client.post(
        _release_path(run_id),
        headers=_runner_headers(settings, **{"Idempotency-Key": "idem-1"}),
        json={"reason": RELEASE_REASON},
    )
    assert missing_lease.status_code == 401

    # Wrong lease token.
    wrong_lease = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings,
            **{"X-Runner-Lease-Token": "nope", "Idempotency-Key": "idem-1"},
        ),
        json={"reason": RELEASE_REASON},
    )
    assert wrong_lease.status_code == 401


async def test_release_refused_after_submit_checkpoint(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    claim = await _claim(client, settings, run_id=run_id)
    lease_token = str(claim["lease_token"])

    chk = await client.post(
        f"/api/v1/runner/runs/{run_id}/checkpoints",
        headers=_runner_headers(settings, **{"X-Runner-Lease-Token": lease_token}),
        json={"checkpoint": "submitting", "step_description": "Submitting"},
    )
    assert chk.status_code == 200

    resp = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings,
            **{"X-Runner-Lease-Token": lease_token, "Idempotency-Key": "idem-1"},
        ),
        json={"reason": RELEASE_REASON},
    )
    assert resp.status_code == 409
    assert "cannot be released" in resp.json()["detail"]


async def test_release_rejects_unknown_run(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _setup_fixtures(session, settings)
    resp = await client.post(
        _release_path(str(uuid4())),
        headers=_runner_headers(
            settings,
            **{"X-Runner-Lease-Token": "irrelevant", "Idempotency-Key": "idem-1"},
        ),
        json={"reason": RELEASE_REASON},
    )
    assert resp.status_code == 404


async def test_release_rejects_unknown_reason(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    claim = await _claim(client, settings, run_id=run_id)

    resp = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings,
            **{
                "X-Runner-Lease-Token": str(claim["lease_token"]),
                "Idempotency-Key": "idem-1",
            },
        ),
        json={"reason": "because_i_said_so"},
    )
    assert resp.status_code == 422


# --- Release idempotency ----------------------------------------------------


async def test_release_replay_is_idempotent(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    claim = await _claim(client, settings, run_id=run_id)
    headers = _runner_headers(
        settings,
        **{
            "X-Runner-Lease-Token": str(claim["lease_token"]),
            "Idempotency-Key": "idem-1",
        },
    )

    first = await client.post(
        _release_path(run_id), headers=headers, json={"reason": RELEASE_REASON}
    )
    assert first.status_code == 200
    second = await client.post(
        _release_path(run_id), headers=headers, json={"reason": RELEASE_REASON}
    )
    assert second.status_code == 200
    assert second.json()["attempt_count"] == first.json()["attempt_count"]
    assert second.json()["updated_at"] == first.json()["updated_at"]

    detail = await client.get(f"/api/v1/application-runs/{run_id}")
    releases = [
        e for e in detail.json()["events"] if e["event_type"] == "lease_released"
    ]
    assert len(releases) == 1


async def test_release_replay_rejects_spoofed_runner_id(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    claim = await _claim(client, settings, run_id=run_id)
    lease_token = str(claim["lease_token"])

    ok = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings,
            **{"X-Runner-Lease-Token": lease_token, "Idempotency-Key": "idem-1"},
        ),
        json={"reason": RELEASE_REASON},
    )
    assert ok.status_code == 200

    # A different runner presenting the same lease token must not be able to
    # replay the release.
    spoofed = await client.post(
        _release_path(run_id),
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Id": "impostor_runner",
            "X-Runner-Lease-Token": lease_token,
            "Idempotency-Key": "idem-1",
        },
        json={"reason": RELEASE_REASON},
    )
    assert spoofed.status_code == 401

    # A mismatched idempotency key is likewise refused.
    wrong_key = await client.post(
        _release_path(run_id),
        headers=_runner_headers(
            settings,
            **{"X-Runner-Lease-Token": lease_token, "Idempotency-Key": "idem-other"},
        ),
        json={"reason": RELEASE_REASON},
    )
    assert wrong_key.status_code == 401


async def test_release_token_dies_after_reclaim(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")
    claim = await _claim(client, settings, run_id=run_id)
    lease_token = str(claim["lease_token"])
    headers = _runner_headers(
        settings,
        **{"X-Runner-Lease-Token": lease_token, "Idempotency-Key": "idem-1"},
    )

    assert (
        await client.post(
            _release_path(run_id), headers=headers, json={"reason": RELEASE_REASON}
        )
    ).status_code == 200

    # Re-claiming retires the release record.
    await _claim(client, settings, run_id=run_id)

    stale = await client.post(
        _release_path(run_id), headers=headers, json={"reason": RELEASE_REASON}
    )
    assert stale.status_code == 401


# --- Attempt identity -------------------------------------------------------


async def test_release_preserves_monotonic_attempt_identity(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, _, _ = await _setup_fixtures(session, settings)
    run_id = await _create_run(client, group_id, "full_auto")

    attempts: list[int] = []
    for index in range(3):
        claim = await _claim(client, settings, run_id=run_id)
        run = claim["run"]
        assert isinstance(run, dict)
        attempts.append(int(run["attempt_count"]))
        resp = await client.post(
            _release_path(run_id),
            headers=_runner_headers(
                settings,
                **{
                    "X-Runner-Lease-Token": str(claim["lease_token"]),
                    "Idempotency-Key": f"idem-{index}",
                },
            ),
            json={"reason": RELEASE_REASON},
        )
        assert resp.status_code == 200
        # Repeated releases never consume the retry budget.
        assert resp.json()["retry_failure_count"] == 0
        assert resp.json()["status"] == "queued"

    assert attempts == sorted(set(attempts))
    assert len(attempts) == 3

    # Evidence must be keyed to the current attempt, never a released one.
    claim = await _claim(client, settings, run_id=run_id)
    lease_headers = _runner_headers(
        settings, **{"X-Runner-Lease-Token": str(claim["lease_token"])}
    )
    stale = await client.post(
        f"/api/v1/runner/runs/{run_id}/evidence",
        headers=lease_headers,
        data={"attempt": str(attempts[0]), "evidence_type": "log"},
        files={"file": ("run.log", b"stale attempt", "text/plain")},
    )
    assert stale.status_code == 400

    run = claim["run"]
    assert isinstance(run, dict)
    current = await client.post(
        f"/api/v1/runner/runs/{run_id}/evidence",
        headers=lease_headers,
        data={"attempt": str(run["attempt_count"]), "evidence_type": "log"},
        files={"file": ("run.log", b"current attempt", "text/plain")},
    )
    assert current.status_code == 200
    assert f"attempt_{run['attempt_count']}" in current.json()["relative_path"]
