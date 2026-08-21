import ipaddress
from decimal import Decimal
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
DOCUMENTED_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine"
DEFAULT_ENABLED_SOURCES: tuple[str, ...] = (
    "himalayas",
    "jobicy",
    "remoteok",
    "greenhouse",
    "lever",
)
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
ATS_DISCOVERY_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; ats-native)"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = DOCUMENTED_DATABASE_URL
    data_root: Path = Field(
        default=Path.home() / ".job-engine" / "data",
        validation_alias=AliasChoices("job_engine_data_root", "data_root"),
    )
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
    ats_discovery_user_agent: str = ATS_DISCOVERY_USER_AGENT
    greenhouse_connect_timeout_seconds: float = 5.0
    greenhouse_read_timeout_seconds: float = 30.0
    greenhouse_max_retries: int = 1
    greenhouse_stale_after_successful_misses: int = 2
    lever_connect_timeout_seconds: float = 5.0
    lever_read_timeout_seconds: float = 30.0
    lever_max_retries: int = 1
    lever_stale_after_successful_misses: int = 2

    def stale_after_successful_misses(self, source_id: str) -> int:
        if source_id == "himalayas":
            return self.himalayas_stale_after_successful_misses
        if source_id == "jobicy":
            return self.jobicy_stale_after_successful_misses
        if source_id == "remoteok":
            return self.remoteok_stale_after_successful_misses
        if source_id == "greenhouse":
            return self.greenhouse_stale_after_successful_misses
        if source_id == "lever":
            return self.lever_stale_after_successful_misses
        return 2

    @property
    def resolved_data_root(self) -> Path:
        raw = Path(self.data_root).expanduser()
        if raw.is_absolute():
            return raw.resolve()
        return (REPO_ROOT / raw).resolve()

    def ensure_data_root(self) -> Path:
        resolved = self.resolved_data_root
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

    def ensure_resume_root(self) -> Path:
        raw = Path(self.resume_root)
        if raw.is_absolute():
            resolved = raw.resolve()
        else:
            resolved = (REPO_ROOT / raw).resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

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

    # BACK-013 / BACK-015: hybrid local and Gemini grounded answer provider.
    # Deterministic by default; local is loopback-only;
    # Gemini is fail-closed until PROVIDER-PRIVACY-001 is accepted.
    answer_provider: Literal["deterministic", "local", "gemini"] = Field(
        default="deterministic",
        validation_alias=AliasChoices("job_engine_answer_provider", "answer_provider"),
    )
    local_provider_base_url: str = Field(
        default="http://127.0.0.1:11434/v1",
        validation_alias=AliasChoices(
            "job_engine_local_provider_base_url",
            "local_provider_base_url",
        ),
    )
    local_model: str = Field(
        default="qwen3:4b",
        validation_alias=AliasChoices("job_engine_local_model", "local_model"),
    )
    local_inference_concurrency: int = Field(default=1, ge=1, le=8)
    local_inference_queue_limit: int = Field(default=16, ge=1, le=256)
    local_inference_acquire_timeout_seconds: float = Field(default=15.0, gt=0, le=300.0)
    local_inference_answer_timeout_seconds: float = Field(default=15.0, gt=0, le=300.0)
    local_inference_extraction_timeout_seconds: float = Field(
        default=45.0, gt=0, le=600.0
    )
    local_inference_max_input_tokens: int = Field(default=8192, ge=256, le=131072)
    local_inference_max_output_tokens: int = Field(default=500, ge=16, le=8192)
    gemini_model: str = Field(
        default="gemini-2.5-flash",
        validation_alias=AliasChoices("job_engine_gemini_model", "gemini_model"),
    )
    provider_privacy_attestation_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "job_engine_provider_privacy_attestation_id",
            "provider_privacy_attestation_id",
        ),
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
    # Review threshold; never an authorization signal (V2.1 Outcome 5 / BACK-013)
    answer_auto_submit_confidence_threshold: float = 0.85

    @field_validator("local_provider_base_url")
    @classmethod
    def validate_local_provider_base_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("local_provider_base_url must use http or https scheme")
        if parsed.username or parsed.password:
            raise ValueError(
                "local_provider_base_url must not contain embedded credentials"
            )
        host = parsed.hostname
        if not host:
            raise ValueError("local_provider_base_url missing hostname")
        host_lower = host.lower()
        if host_lower == "localhost":
            return value
        try:
            ip = ipaddress.ip_address(host_lower)
            if not ip.is_loopback:
                raise ValueError(
                    f"local_provider_base_url must point to loopback, got: {host}"
                )
        except ValueError as exc:
            if "must point to loopback" in str(exc):
                raise
            raise ValueError(
                f"local_provider_base_url must point to loopback, got: {host}"
            ) from exc
        return value

    @property
    def resolved_evidence_root(self) -> Path:
        raw = Path(self.evidence_root).expanduser()
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
