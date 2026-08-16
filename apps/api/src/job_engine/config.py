from pydantic_settings import BaseSettings, SettingsConfigDict

DOCUMENTED_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = DOCUMENTED_DATABASE_URL
