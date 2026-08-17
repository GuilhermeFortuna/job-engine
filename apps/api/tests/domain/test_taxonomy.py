import pytest

from job_engine.domain.taxonomy import (
    TaxonomyError,
    load_role_families,
    load_technology_aliases,
    match_role_families,
    parse_role_families,
    parse_technology_aliases,
)


def test_role_family_ids_match_v1_controlled_list() -> None:
    families = load_role_families()
    assert [family.id for family in families] == [
        "software_developer",
        "full_stack",
        "backend",
        "python",
        "frontend",
        "ai_application",
        "applied_ai",
    ]
    for family in families:
        assert family.title_terms


def test_parse_role_families_rejects_duplicate_ids() -> None:
    with pytest.raises(TaxonomyError, match="duplicate role-family id"):
        parse_role_families(
            {
                "families": [
                    {"id": "python", "title_terms": ["python"]},
                    {"id": "python", "title_terms": ["python engineer"]},
                ]
            }
        )


def test_parse_technology_aliases_rejects_duplicate_aliases() -> None:
    with pytest.raises(TaxonomyError, match="duplicate technology alias"):
        parse_technology_aliases(
            {
                "canonical_terms": ["JavaScript", "TypeScript"],
                "aliases": {"js": "JavaScript", "JS": "TypeScript"},
            }
        )


def test_technology_aliases_cover_profile_canonical_terms() -> None:
    aliases = load_technology_aliases()
    canonical = set(aliases.values())
    for term in (
        "Python",
        "JavaScript",
        "TypeScript",
        "React",
        "Next.js",
        "FastAPI",
        "PostgreSQL",
        "SQL",
        "Docker",
        "Git",
        "GitHub",
        "CI/CD",
        "AWS",
        "GCP",
        "LLM",
    ):
        assert term in canonical
    assert aliases["js"] == "JavaScript"
    assert aliases["postgres"] == "PostgreSQL"


def test_role_family_matching_allows_multiple_families() -> None:
    families = match_role_families("Senior Python Backend Engineer")
    assert "python" in families
    assert "backend" in families


def test_software_developer_matches_explicit_title_terms() -> None:
    families = match_role_families("Software Engineer")
    assert families == ("software_developer",)
