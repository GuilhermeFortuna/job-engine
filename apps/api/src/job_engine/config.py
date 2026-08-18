from decimal import Decimal
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
DOCUMENTED_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine"
DEFAULT_ENABLED_SOURCES: tuple[str, ...] = ("himalayas", "jobicy", "remoteok")
HIMALAYAS_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; himalayas adapter)"
)
JOBICY_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; jobicy adapter)"
)
REMOTEOK_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; remoteok adapter)"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = DOCUMENTED_DATABASE_URL
    resume_root: Path = Field(
        default=Path("docs/resume"),
        validation_alias=AliasChoices("job_engine_resume_root", "resume_root"),
    )
    # BACK-007: configured V1 source IDs for filter vocabulary, source query
    # validation, and catalog health. BACK-004 owns other source settings.
    enabled_sources: tuple[str, ...] = DEFAULT_ENABLED_SOURCES
    himalayas_base_url: str = "https://himalayas.app"
    himalayas_connect_timeout_seconds: float = 5.0
    himalayas_read_timeout_seconds: float = 15.0
    himalayas_max_pages_per_window: int = 5
    himalayas_max_retries: int = 1
    himalayas_user_agent: str = HIMALAYAS_USER_AGENT
    himalayas_stale_after_successful_misses: int = 2
    jobicy_base_url: str = "https://jobicy.com"
    jobicy_connect_timeout_seconds: float = 5.0
    jobicy_read_timeout_seconds: float = 15.0
    jobicy_max_retries: int = 1
    jobicy_user_agent: str = JOBICY_USER_AGENT
    jobicy_count: int = 100
    jobicy_max_windows: int = 3
    jobicy_stale_after_successful_misses: int = 3
    remoteok_base_url: str = "https://remoteok.com"
    remoteok_connect_timeout_seconds: float = 5.0
    remoteok_read_timeout_seconds: float = 15.0
    remoteok_max_retries: int = 1
    remoteok_user_agent: str = REMOTEOK_USER_AGENT
    remoteok_stale_after_successful_misses: int = 3

    def stale_after_successful_misses(self, source_id: str) -> int:
        if source_id == "himalayas":
            return self.himalayas_stale_after_successful_misses
        if source_id == "jobicy":
            return self.jobicy_stale_after_successful_misses
        if source_id == "remoteok":
            return self.remoteok_stale_after_successful_misses
        return 2

    @property
    def resolved_resume_root(self) -> Path:
        raw = Path(self.resume_root)
        if raw.is_absolute():
            resolved = raw.resolve(strict=True)
        else:
            resolved = (REPO_ROOT / raw).resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError(f"resume_root is not a directory: {resolved}")
        return resolved

    runner_secret: str = Field(
        default="",
        validation_alias=AliasChoices("job_engine_runner_secret", "runner_secret"),
    )
    runner_lease_duration_seconds: int = 60
    runner_heartbeat_interval_seconds: int = 15
    runner_concurrency_limit: int = 1
    max_queue_limit: int = 25
    run_timeout_seconds: int = 300
    step_timeout_seconds: int = 30
    frontend_origin: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("job_engine_frontend_origin", "frontend_origin"),
    )
    evidence_root: Path = Field(
        default=Path.home() / ".job-engine" / "evidence",
        validation_alias=AliasChoices("job_engine_evidence_root", "evidence_root"),
    )
    evidence_retention_days: int = 30

    # BACK-011: grounded application answering. deterministic-only by
    # default; a non-deterministic provider is fail-closed until
    # PROVIDER-PRIVACY-001 is accepted (provider_privacy_attestation_id set).
    answer_provider: Literal["deterministic", "openai", "gemini"] = Field(
        default="deterministic",
        validation_alias=AliasChoices("job_engine_answer_provider", "answer_provider"),
    )
    provider_privacy_attestation_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "job_engine_provider_privacy_attestation_id",
            "provider_privacy_attestation_id",
        ),
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("job_engine_openai_api_key", "openai_api_key"),
    )
    gemini_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("job_engine_gemini_api_key", "gemini_api_key"),
    )
    answer_provider_timeout_seconds: float = 15.0
    answer_provider_max_output_tokens: int = 500
    answer_provider_max_calls_per_run: int = 5
    answer_provider_estimated_cost_per_call_usd: Decimal = Decimal("0.01")
    answer_run_cost_cap_usd: Decimal = Decimal("0.05")
    answer_batch_cost_cap_usd: Decimal = Decimal("5.00")
    answer_auto_submit_confidence_threshold: float = 0.85

    @property
    def resolved_evidence_root(self) -> Path:
        raw = Path(self.evidence_root)
        if raw.is_absolute():
            resolved = raw.resolve()
        else:
            resolved = (REPO_ROOT / raw).resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

    @field_validator("enabled_sources", mode="before")
    @classmethod
    def parse_enabled_sources(cls, value: object) -> object:
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        return value
