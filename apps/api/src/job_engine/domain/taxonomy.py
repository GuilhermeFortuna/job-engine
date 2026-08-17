from __future__ import annotations

import json
import re
from functools import lru_cache
from importlib import resources
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

REQUIRED_ROLE_FAMILY_IDS = (
    "software_developer",
    "full_stack",
    "backend",
    "python",
    "frontend",
    "ai_application",
    "applied_ai",
)


class TaxonomyError(ValueError):
    """Raised when a vocabulary file is invalid."""


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class RoleFamily(FrozenModel):
    id: str
    title_terms: tuple[str, ...] = Field(min_length=1)


def _read_json(name: str) -> Any:
    payload = (
        resources.files("job_engine.data").joinpath(name).read_text(encoding="utf-8")
    )
    return json.loads(payload)


def parse_role_families(payload: object) -> tuple[RoleFamily, ...]:
    if not isinstance(payload, dict) or "families" not in payload:
        raise TaxonomyError("role families payload must contain 'families'")
    families_raw = payload["families"]
    if not isinstance(families_raw, list):
        raise TaxonomyError("role families must be a list")

    seen: set[str] = set()
    families: list[RoleFamily] = []
    for item in families_raw:
        if not isinstance(item, dict):
            raise TaxonomyError("each role family must be an object")
        family_id = item.get("id")
        if not isinstance(family_id, str) or not family_id:
            raise TaxonomyError("role-family id must be a non-empty string")
        if family_id in seen:
            raise TaxonomyError(f"duplicate role-family id: {family_id}")
        seen.add(family_id)
        terms = item.get("title_terms")
        if not isinstance(terms, list) or not terms:
            raise TaxonomyError(f"role family {family_id} must list title terms")
        normalized_terms = tuple(str(term) for term in terms)
        families.append(RoleFamily(id=family_id, title_terms=normalized_terms))
    return tuple(families)


@lru_cache(maxsize=1)
def load_role_families() -> tuple[RoleFamily, ...]:
    families = parse_role_families(_read_json("role_families.json"))
    loaded_ids = tuple(family.id for family in families)
    if loaded_ids != REQUIRED_ROLE_FAMILY_IDS:
        raise TaxonomyError(
            "role-family IDs must match the V1 controlled list in order"
        )
    return families


def parse_technology_aliases(payload: object) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise TaxonomyError("technology aliases payload must be an object")
    canonical_terms = payload.get("canonical_terms")
    aliases_raw = payload.get("aliases")
    if not isinstance(canonical_terms, list) or not canonical_terms:
        raise TaxonomyError("canonical_terms must be a non-empty list")
    if not isinstance(aliases_raw, dict):
        raise TaxonomyError("aliases must be an object")

    canonical_display = {str(term) for term in canonical_terms}
    mapped: dict[str, str] = {}
    for alias, canonical in aliases_raw.items():
        if not isinstance(alias, str) or not alias.strip():
            raise TaxonomyError("technology alias must be a non-empty string")
        if not isinstance(canonical, str) or canonical not in canonical_display:
            raise TaxonomyError(f"alias {alias!r} maps to unknown canonical term")
        key = alias.casefold().strip()
        existing = mapped.get(key)
        if existing is not None and existing != canonical:
            raise TaxonomyError(f"duplicate technology alias: {alias}")
        mapped[key] = canonical
    return mapped


@lru_cache(maxsize=1)
def load_technology_aliases() -> dict[str, str]:
    return parse_technology_aliases(_read_json("technology_aliases.json"))


def match_role_families(
    title: str, families: tuple[RoleFamily, ...] | None = None
) -> tuple[str, ...]:
    catalog = families if families is not None else load_role_families()
    folded = title.casefold()
    matched: list[str] = []
    for family in catalog:
        for term in family.title_terms:
            pattern = rf"(?<![\w]){re.escape(term.casefold())}(?![\w])"
            if re.search(pattern, folded):
                matched.append(family.id)
                break
    return tuple(matched)
