from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DOCUMENTED_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine"
DEFAULT_ENABLED_SOURCES: tuple[str, ...] = ("himalayas", "jobicy")
HIMALAYAS_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; himalayas adapter)"
)
JOBICY_USER_AGENT = (
    "JobEngine/0.1 (+https://github.com/GuilhermeFortuna/job-engine; "
    "personal catalog; jobicy adapter)"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = DOCUMENTED_DATABASE_URL
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

    def stale_after_successful_misses(self, source_id: str) -> int:
        if source_id == "himalayas":
            return self.himalayas_stale_after_successful_misses
        if source_id == "jobicy":
            return self.jobicy_stale_after_successful_misses
        return 2

    @field_validator("enabled_sources", mode="before")
    @classmethod
    def parse_enabled_sources(cls, value: object) -> object:
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        return value
