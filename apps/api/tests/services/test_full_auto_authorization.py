from uuid import uuid4

import pytest
from pydantic import ValidationError

from job_engine.api.schemas import ApplicationRunCreateRequest
from job_engine.domain.applications import (
    FULL_AUTO_OWNER_CONFIRMATION,
    AutomationMode,
)


def test_full_auto_request_freezes_explicit_owner_selection() -> None:
    job_group_ids = [uuid4(), uuid4()]
    request = ApplicationRunCreateRequest(
        job_group_ids=job_group_ids,
        resume_id="res_backend_primary",
        automation_mode=AutomationMode.FULL_AUTO,
        owner_confirmation=FULL_AUTO_OWNER_CONFIRMATION,
    )

    assert request.job_group_ids == job_group_ids
    assert request.resume_id == "res_backend_primary"
    assert request.owner_confirmation == FULL_AUTO_OWNER_CONFIRMATION


@pytest.mark.parametrize(
    ("resume_id", "owner_confirmation"),
    [
        (None, FULL_AUTO_OWNER_CONFIRMATION),
        ("res_backend_primary", None),
        ("res_backend_primary", "authorize"),
    ],
)
def test_full_auto_request_rejects_incomplete_authorization(
    resume_id: str | None, owner_confirmation: str | None
) -> None:
    with pytest.raises(ValidationError):
        ApplicationRunCreateRequest(
            job_group_ids=[uuid4()],
            resume_id=resume_id,
            automation_mode=AutomationMode.FULL_AUTO,
            owner_confirmation=owner_confirmation,
        )


def test_semi_auto_cannot_receive_full_auto_authorization() -> None:
    with pytest.raises(ValidationError):
        ApplicationRunCreateRequest(
            job_group_ids=[uuid4()],
            automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
            owner_confirmation=FULL_AUTO_OWNER_CONFIRMATION,
        )
