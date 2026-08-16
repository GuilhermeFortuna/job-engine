from typing import Final

from sqlalchemy.engine import URL
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_SUPPORTED_ASYNC_DRIVER: Final = "postgresql+asyncpg"


class UnsupportedDatabaseUrlError(ValueError):
    """Raised when DATABASE_URL does not use a supported PostgreSQL driver."""


def to_async_url(database_url: str) -> URL:
    url = make_url(database_url)
    if url.drivername == "postgresql":
        return url.set(drivername=_SUPPORTED_ASYNC_DRIVER)
    if url.drivername == _SUPPORTED_ASYNC_DRIVER:
        return url
    raise UnsupportedDatabaseUrlError(
        f"Unsupported DATABASE_URL driver {url.drivername!r}; "
        "expected 'postgresql' or 'postgresql+asyncpg'"
    )


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(to_async_url(database_url))


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
