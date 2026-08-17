from collections.abc import Callable

from job_engine.config import Settings
from job_engine.sources.base import SourceAdapter

AdapterFactory = Callable[[Settings], SourceAdapter]

_REGISTRY: dict[str, AdapterFactory] = {}


class UnknownSourceError(LookupError):
    """Raised when an adapter is requested for an unregistered source ID."""


def register(source_id: str, factory: AdapterFactory) -> None:
    _REGISTRY[source_id] = factory


def _ensure_registered() -> None:
    # Lazy import avoids the registry <-> adapter cycle at module load.
    from job_engine.sources.himalayas import HimalayasAdapter
    from job_engine.sources.jobicy import JobicyAdapter

    register("himalayas", HimalayasAdapter)
    register("jobicy", JobicyAdapter)


def registered_ids() -> frozenset[str]:
    _ensure_registered()
    return frozenset(_REGISTRY)


def get_adapter(source_id: str, settings: Settings) -> SourceAdapter:
    _ensure_registered()
    try:
        factory = _REGISTRY[source_id]
    except KeyError as exc:
        raise UnknownSourceError(source_id) from exc
    return factory(settings)
