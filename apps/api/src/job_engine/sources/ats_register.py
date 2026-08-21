"""Frozen CROSS-015 ATS-native source register for BACK-016.

Owner approval of revision CROSS-015-REG-2026-08-21.1 is recorded in
docs/development/STATUS.md (CROSS-015 = DONE). This module is the typed
runtime freeze of that revision; malformed or unapproved entries fail
startup/config validation.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

REGISTER_REVISION = "CROSS-015-REG-2026-08-21.1"
ATS_DISCOVERY_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; ats-native)"
)

ProviderId = Literal["greenhouse", "lever"]
LeverRegion = Literal["global", "eu"]


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class GreenhouseBoard(FrozenModel):
    id: str
    employer: str
    board_token: str
    hosted_board_url: str

    @field_validator("id")
    @classmethod
    def id_must_match_token(cls, value: str) -> str:
        if not value.startswith("greenhouse:"):
            raise ValueError("greenhouse board id must start with greenhouse:")
        return value


class LeverSite(FrozenModel):
    id: str
    employer: str
    site: str
    region: LeverRegion
    hosted_site_url: str

    @field_validator("id")
    @classmethod
    def id_must_match_site(cls, value: str) -> str:
        if not value.startswith("lever:"):
            raise ValueError("lever site id must start with lever:")
        return value


class LeverRegionConfig(FrozenModel):
    api_base: str
    hosted_host: str
    apply_path: str
    desktop_adapter_bound: bool
    approved_sites: tuple[str, ...] = ()


class GreenhouseProviderConfig(FrozenModel):
    api_base: str
    list_path: str
    query: dict[str, str]
    auth: Literal["none"]
    allowed_application_hosts: tuple[str, ...]
    job_path_pattern: str
    approved_boards: tuple[GreenhouseBoard, ...]


class LeverProviderConfig(FrozenModel):
    auth: Literal["none"]
    list_path: str
    query: dict[str, str]
    pagination: dict[str, int | bool]
    crawl_delay_seconds: float
    regions: dict[LeverRegion, LeverRegionConfig]
    approved_sites: tuple[LeverSite, ...]


class AtsDiscoveryConfig(FrozenModel):
    user_agent: str
    max_polls_per_source_per_day: int = Field(ge=1)
    application_post_allowed: bool


class AtsNativeRegister(FrozenModel):
    register_revision: str
    owner_approved: bool
    discovery: AtsDiscoveryConfig
    greenhouse: GreenhouseProviderConfig
    lever: LeverProviderConfig
    rejected_ids: tuple[str, ...]

    @model_validator(mode="after")
    def validate_approved_freeze(self) -> AtsNativeRegister:
        if self.register_revision != REGISTER_REVISION:
            raise ValueError(
                f"register_revision must be {REGISTER_REVISION}, "
                f"got {self.register_revision}"
            )
        if not self.owner_approved:
            raise ValueError(
                f"register revision {REGISTER_REVISION} is not owner-approved"
            )
        if self.discovery.application_post_allowed:
            raise ValueError("application_post_allowed must remain false")
        board_ids = {board.id for board in self.greenhouse.approved_boards}
        site_ids = {site.id for site in self.lever.approved_sites}
        overlap = board_ids & site_ids
        if overlap:
            raise ValueError(f"duplicate approved ids: {sorted(overlap)}")
        rejected = set(self.rejected_ids)
        if board_ids & rejected or site_ids & rejected:
            raise ValueError("approved id also listed in rejected_ids")
        for site in self.lever.approved_sites:
            region = self.lever.regions.get(site.region)
            if region is None:
                raise ValueError(f"missing lever region config for {site.region}")
            if site.region == "eu" and not region.desktop_adapter_bound:
                raise ValueError(
                    f"lever site {site.id} uses unbound EU desktop adapter region"
                )
            if not region.desktop_adapter_bound:
                raise ValueError(
                    f"lever site {site.id} region {site.region} is not desktop-bound"
                )
        return self


def load_approved_register() -> AtsNativeRegister:
    """Return the frozen owner-approved CROSS-015 register revision."""
    return AtsNativeRegister.model_validate(_FROZEN_REGISTER_PAYLOAD)


_FROZEN_REGISTER_PAYLOAD: dict[str, object] = {
    "register_revision": REGISTER_REVISION,
    "owner_approved": True,
    "discovery": {
        "user_agent": ATS_DISCOVERY_USER_AGENT,
        "max_polls_per_source_per_day": 1,
        "application_post_allowed": False,
    },
    "greenhouse": {
        "api_base": "https://boards-api.greenhouse.io",
        "list_path": "/v1/boards/{board_token}/jobs",
        "query": {"content": "true"},
        "auth": "none",
        "allowed_application_hosts": (
            "boards.greenhouse.io",
            "job-boards.greenhouse.io",
            "boards.eu.greenhouse.io",
        ),
        "job_path_pattern": "/{board_token}/jobs/{numeric_id}",
        "approved_boards": (
            {
                "id": "greenhouse:khanacademy",
                "employer": "Khan Academy",
                "board_token": "khanacademy",
                "hosted_board_url": "https://job-boards.greenhouse.io/khanacademy",
            },
            {
                "id": "greenhouse:thenewyorktimes",
                "employer": "The New York Times",
                "board_token": "thenewyorktimes",
                "hosted_board_url": "https://job-boards.greenhouse.io/thenewyorktimes",
            },
            {
                "id": "greenhouse:nationalpublicradioinc",
                "employer": "NPR",
                "board_token": "nationalpublicradioinc",
                "hosted_board_url": (
                    "https://job-boards.greenhouse.io/nationalpublicradioinc"
                ),
            },
            {
                "id": "greenhouse:wikimedia",
                "employer": "Wikimedia Foundation",
                "board_token": "wikimedia",
                "hosted_board_url": "https://job-boards.greenhouse.io/wikimedia",
            },
        ),
    },
    "lever": {
        "auth": "none",
        "list_path": "/v0/postings/{site}",
        "query": {"mode": "json"},
        "pagination": {"skip": True, "limit": 50},
        "crawl_delay_seconds": 1.0,
        "regions": {
            "global": {
                "api_base": "https://api.lever.co",
                "hosted_host": "jobs.lever.co",
                "apply_path": "/{site}/{posting_id}/apply",
                "desktop_adapter_bound": True,
            },
            "eu": {
                "api_base": "https://api.eu.lever.co",
                "hosted_host": "jobs.eu.lever.co",
                "apply_path": "/{site}/{posting_id}/apply",
                "desktop_adapter_bound": False,
                "approved_sites": (),
            },
        },
        "approved_sites": (
            {
                "id": "lever:ro",
                "employer": "Ro",
                "site": "ro",
                "region": "global",
                "hosted_site_url": "https://jobs.lever.co/ro",
            },
            {
                "id": "lever:lucasmuseum",
                "employer": "Lucas Museum of Narrative Art",
                "site": "lucasmuseum",
                "region": "global",
                "hosted_site_url": "https://jobs.lever.co/lucasmuseum",
            },
            {
                "id": "lever:coloradocoalition",
                "employer": "Colorado Coalition for the Homeless",
                "site": "coloradocoalition",
                "region": "global",
                "hosted_site_url": "https://jobs.lever.co/coloradocoalition",
            },
            {
                "id": "lever:Osmind",
                "employer": "Osmind",
                "site": "Osmind",
                "region": "global",
                "hosted_site_url": "https://jobs.lever.co/Osmind",
            },
        ),
    },
    "rejected_ids": (
        "greenhouse:stripe",
        "lever:lever",
        "lever:prosus",
    ),
}


APPROVED_REGISTER = load_approved_register()
