from datetime import UTC, datetime, timedelta
from decimal import Decimal

from job_engine.services.search import (
    compensation_matches,
    description_excerpt,
    escape_ilike,
    posted_after,
)


def test_description_excerpt_none_and_blank() -> None:
    assert description_excerpt(None) is None
    assert description_excerpt("   ") is None
    assert description_excerpt("Short description.") == "Short description."


def test_description_excerpt_strips_html_to_plain_text() -> None:
    excerpt = description_excerpt(
        "<p>We are seeking a highly skilled and motivated "
        "<strong>Senior Software Engineer (React)</strong> to join our team.</p>"
    )
    assert excerpt == (
        "We are seeking a highly skilled and motivated "
        "Senior Software Engineer (React) to join our team."
    )
    assert excerpt is not None
    assert "<" not in excerpt
    assert (
        description_excerpt(
            '<p>A <a href="https://fcamara.com">FCamara</a> está em busca de um...</p>'
        )
        == "A FCamara está em busca de um..."
    )


def test_description_excerpt_truncates_on_whitespace() -> None:
    text = ("word " * 80).strip()
    excerpt = description_excerpt(text)
    assert excerpt is not None
    assert excerpt.endswith("...")
    assert len(excerpt) <= 283
    assert "word" in excerpt


def test_escape_ilike_literals() -> None:
    assert escape_ilike("100%") == "100\\%"
    assert escape_ilike("a_b") == "a\\_b"
    assert escape_ilike("a\\b") == "a\\\\b"


def test_posted_after_windows() -> None:
    now = datetime(2026, 8, 16, 23, 30, tzinfo=UTC)
    assert posted_after("any", now=now) is None
    assert posted_after("24h", now=now) == now - timedelta(hours=24)
    assert posted_after("7d", now=now) == now - timedelta(days=7)
    assert posted_after("30d", now=now) == now - timedelta(days=30)


def test_compensation_unknown_predicate() -> None:
    minimum = Decimal("100000")
    assert not compensation_matches(
        None, None, minimum_annual_usd=None, include_unknown=False
    )
    assert compensation_matches(
        None, None, minimum_annual_usd=None, include_unknown=True
    )
    assert compensation_matches(
        None, None, minimum_annual_usd=minimum, include_unknown=True
    )
    assert not compensation_matches(
        None, None, minimum_annual_usd=minimum, include_unknown=False
    )
    assert compensation_matches(
        Decimal("120000"),
        None,
        minimum_annual_usd=minimum,
        include_unknown=False,
    )
    assert not compensation_matches(
        Decimal("90000"),
        None,
        minimum_annual_usd=minimum,
        include_unknown=False,
    )
    assert compensation_matches(
        None,
        Decimal("150000"),
        minimum_annual_usd=minimum,
        include_unknown=False,
    )
