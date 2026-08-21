from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import UUID

from pydantic import field_validator

from job_engine.domain.enums import (
    EmploymentType,
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import (
    Compensation,
    EligibleLocation,
    FrozenModel,
    JobGroupInput,
    SourcePostingInput,
    TechnologyTerm,
    _require_aware_utc,
    _require_http_url,
)
from job_engine.domain.taxonomy import load_technology_aliases, match_role_families

PUNCTUATION_TO_SPACE = frozenset(".,;:!?'\"()[]{}\\&@#+*")
LEGAL_SUFFIXES = frozenset(
    {
        "inc",
        "incorporated",
        "llc",
        "ltd",
        "limited",
        "corp",
        "corporation",
        "plc",
        "gmbh",
        "ag",
        "sa",
    }
)
TRACKING_QUERY_KEYS = frozenset(
    {
        "gclid",
        "gbraid",
        "wbraid",
        "fbclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "_ga",
        "_gl",
    }
)
HOURS_PER_YEAR = Decimal("2080")
MONTHS_PER_YEAR = Decimal("12")
WHITESPACE_RE = re.compile(r"\s+")

REMOTE_PATTERNS: tuple[tuple[RemoteStatus, re.Pattern[str]], ...] = (
    (RemoteStatus.ONSITE, re.compile(r"\bon[\s-]?site\b", re.IGNORECASE)),
    (RemoteStatus.HYBRID, re.compile(r"\bhybrid\b", re.IGNORECASE)),
    (RemoteStatus.REMOTE, re.compile(r"\bremote\b", re.IGNORECASE)),
)
EMPLOYMENT_PATTERNS: tuple[tuple[EmploymentType, re.Pattern[str]], ...] = (
    (
        EmploymentType.FULL_TIME,
        re.compile(r"\bfull[\s-]?time\b|\bfte\b", re.IGNORECASE),
    ),
    (EmploymentType.PART_TIME, re.compile(r"\bpart[\s-]?time\b", re.IGNORECASE)),
    (EmploymentType.CONTRACT, re.compile(r"\bcontract(?:or)?s?\b", re.IGNORECASE)),
    (EmploymentType.TEMPORARY, re.compile(r"\btemp(?:orary)?\b", re.IGNORECASE)),
    (EmploymentType.INTERNSHIP, re.compile(r"\bintern(?:ship)?\b", re.IGNORECASE)),
)
SENIORITY_PATTERNS: tuple[tuple[Seniority, re.Pattern[str]], ...] = (
    (Seniority.INTERNSHIP, re.compile(r"\bintern(?:ship)?\b", re.IGNORECASE)),
    (Seniority.JUNIOR, re.compile(r"\b(?:junior|jr\.?)\b", re.IGNORECASE)),
    (
        Seniority.MID,
        re.compile(r"\b(?:mid(?:[\s-]?level)?|intermediate)\b", re.IGNORECASE),
    ),
    (Seniority.SENIOR, re.compile(r"\b(?:senior|sr\.?)\b", re.IGNORECASE)),
    (Seniority.LEAD_STAFF, re.compile(r"\b(?:lead|staff|principal)\b", re.IGNORECASE)),
)
ELIGIBILITY_PATTERNS: tuple[tuple[LocationEligibilityRegion, re.Pattern[str]], ...] = (
    (
        LocationEligibilityRegion.BRAZIL,
        re.compile(r"\b(?:brazil|brasil)\b", re.IGNORECASE),
    ),
    (
        LocationEligibilityRegion.LATIN_AMERICA,
        re.compile(r"\b(?:latin[\s-]?america|latam)\b", re.IGNORECASE),
    ),
    (
        LocationEligibilityRegion.WORLDWIDE,
        re.compile(
            r"\bworldwide\b|\banywhere in the world\b|\banywhere\b",
            re.IGNORECASE,
        ),
    ),
)
PERIOD_ALIASES = {
    "hour": "hour",
    "hourly": "hour",
    "hr": "hour",
    "month": "month",
    "monthly": "month",
    "mo": "month",
    "year": "year",
    "yearly": "year",
    "annual": "year",
    "annum": "year",
}


class NormalizationCandidate(FrozenModel):
    source_id: str
    source_posting_id: str
    source_name: str
    listing_url: str
    title_original: str
    company_original: str
    description: str | None = None
    location_original: str | None = None
    remote_evidence: str | None = None
    employment_type_evidence: str | None = None
    seniority_evidence: str | None = None
    compensation_original_text: str | None = None
    compensation_currency: str | None = None
    compensation_period: str | None = None
    compensation_minimum: Decimal | None = None
    compensation_maximum: Decimal | None = None
    technologies_original_text: str | None = None
    location_eligibility_evidence: str | None = None
    published_at: datetime | None = None
    source_timestamp: datetime | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    closed_at: datetime | None = None
    status: JobStatus = JobStatus.ACTIVE
    ingestion_run_id: UUID | None = None
    adapter_version: str | None = None
    raw_source_metadata: dict[str, Any] | None = None

    @field_validator("listing_url")
    @classmethod
    def listing_url_must_be_http(cls, value: str) -> str:
        return _require_http_url(value)

    @field_validator(
        "published_at",
        "source_timestamp",
        "first_seen_at",
        "last_seen_at",
        "closed_at",
    )
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class FieldNormalization[T](FrozenModel):
    value: T
    original: str | None = None
    reason: str


class NormalizedRecord(FrozenModel):
    posting: SourcePostingInput
    group: JobGroupInput
    canonical_url: str
    title_comparison_key: str
    company_comparison_key: str
    location_comparison_key: str
    role_families: tuple[str, ...]
    remote: FieldNormalization[RemoteStatus]
    employment_type: FieldNormalization[EmploymentType]
    seniority: FieldNormalization[Seniority]
    compensation: FieldNormalization[Compensation]


def display_text(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).strip()
    return WHITESPACE_RE.sub(" ", normalized)


def comparison_key(value: str, *, strip_legal_suffixes: bool = False) -> str:
    folded = display_text(value).casefold()
    mapped = "".join(" " if char in PUNCTUATION_TO_SPACE else char for char in folded)
    collapsed = WHITESPACE_RE.sub(" ", mapped).strip()
    if not strip_legal_suffixes:
        return collapsed
    tokens = collapsed.split()
    while tokens and tokens[-1] in LEGAL_SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


def canonicalize_url(value: str) -> str:
    parsed = urlparse(_require_http_url(value))
    host = (parsed.hostname or "").casefold()
    if not host:
        raise ValueError("URL must be an HTTP or HTTPS URL")
    netloc = host
    if parsed.port not in {None, 80, 443}:
        netloc = f"{host}:{parsed.port}"
    path = parsed.path
    if path.endswith("/") and path != "/":
        path = path[:-1]
    kept: list[tuple[str, str]] = []
    for key, item_value in parse_qsl(parsed.query, keep_blank_values=True):
        folded = key.casefold()
        if folded.startswith("utm_") or folded in TRACKING_QUERY_KEYS:
            continue
        kept.append((key, item_value))
    kept.sort(key=lambda item: (item[0].casefold(), item[1]))
    return urlunparse(
        (parsed.scheme.casefold(), netloc, path, "", urlencode(kept, doseq=True), "")
    )


def _match_exclusive_enum[T](
    evidence: str | None, patterns: tuple[tuple[T, re.Pattern[str]], ...]
) -> tuple[T | None, str]:
    if evidence is None or not display_text(evidence):
        return None, "unknown_missing"
    matches = [value for value, pattern in patterns if pattern.search(evidence)]
    unique: list[T] = []
    for item in matches:
        if item not in unique:
            unique.append(item)
    if len(unique) == 1:
        return unique[0], "explicit_text"
    return None, "unknown_ambiguous"


def _normalize_remote(evidence: str | None) -> FieldNormalization[RemoteStatus]:
    value, reason = _match_exclusive_enum(evidence, REMOTE_PATTERNS)
    return FieldNormalization(
        value=RemoteStatus.UNKNOWN if value is None else value,
        original=evidence,
        reason=reason,
    )


def _normalize_employment(evidence: str | None) -> FieldNormalization[EmploymentType]:
    value, reason = _match_exclusive_enum(evidence, EMPLOYMENT_PATTERNS)
    return FieldNormalization(
        value=EmploymentType.UNKNOWN if value is None else value,
        original=evidence,
        reason=reason,
    )


def _normalize_seniority(evidence: str | None) -> FieldNormalization[Seniority]:
    value, reason = _match_exclusive_enum(evidence, SENIORITY_PATTERNS)
    return FieldNormalization(
        value=Seniority.UNKNOWN if value is None else value,
        original=evidence,
        reason=reason,
    )


def _normalize_eligibility(
    evidence: str | None,
) -> tuple[bool, tuple[EligibleLocation, ...], str]:
    if evidence is None or not display_text(evidence):
        return True, (), "unknown_missing"
    locations = tuple(
        EligibleLocation(region=region, evidence_text=evidence)
        for region, pattern in ELIGIBILITY_PATTERNS
        if pattern.search(evidence)
    )
    if not locations:
        return True, (), "unknown_ambiguous"
    return False, locations, "explicit_text"


def _canonical_period(period: str | None) -> str | None:
    if period is None or not period.strip():
        return None
    return PERIOD_ALIASES.get(period.casefold().strip())


def _annualize(
    amount: Decimal | None, currency: str | None, period: str | None
) -> Decimal | None:
    if amount is None:
        return None
    if currency is None or currency.casefold() != "usd":
        return None
    canonical_period = _canonical_period(period)
    if canonical_period == "hour":
        return amount * HOURS_PER_YEAR
    if canonical_period == "month":
        return amount * MONTHS_PER_YEAR
    if canonical_period == "year":
        return amount
    return None


def _normalize_compensation(
    candidate: NormalizationCandidate,
) -> FieldNormalization[Compensation]:
    original = candidate.compensation_original_text
    currency = candidate.compensation_currency
    period = candidate.compensation_period
    minimum = candidate.compensation_minimum
    maximum = candidate.compensation_maximum
    if (
        original is None
        and currency is None
        and period is None
        and minimum is None
        and maximum is None
    ):
        return FieldNormalization(
            value=Compensation(),
            original=None,
            reason="unknown_missing",
        )
    annual_min = _annualize(minimum, currency, period)
    annual_max = _annualize(maximum, currency, period)
    if currency is not None and currency.casefold() != "usd":
        reason = "non_usd_preserved"
    elif annual_min is None and annual_max is None:
        reason = (
            "unknown_missing"
            if minimum is None and maximum is None
            else "period_or_currency_not_annualizable"
        )
    else:
        reason = "usd_annualized"
    return FieldNormalization(
        value=Compensation(
            original_text=original,
            currency=currency,
            period=period,
            minimum=minimum,
            maximum=maximum,
            annual_usd_minimum=annual_min,
            annual_usd_maximum=annual_max,
        ),
        original=original,
        reason=reason,
    )


def _normalize_technologies(original_text: str | None) -> tuple[TechnologyTerm, ...]:
    if original_text is None or not display_text(original_text):
        return ()
    aliases = load_technology_aliases()
    terms: list[TechnologyTerm] = []
    seen: set[str] = set()
    for raw_token in re.split(r"[,;]", original_text):
        token = display_text(raw_token)
        if not token:
            continue
        canonical = aliases.get(token.casefold(), token)
        if canonical.casefold() in seen:
            continue
        seen.add(canonical.casefold())
        terms.append(TechnologyTerm(term=canonical, source_text=original_text))
    return tuple(terms)


def normalize_candidate(candidate: NormalizationCandidate) -> NormalizedRecord:
    title_display = display_text(candidate.title_original)
    company_display = display_text(candidate.company_original)
    title_key = comparison_key(candidate.title_original, strip_legal_suffixes=True)
    company_key = comparison_key(candidate.company_original, strip_legal_suffixes=True)
    location_key = (
        comparison_key(candidate.location_original)
        if candidate.location_original
        else ""
    )
    canonical_url = canonicalize_url(candidate.listing_url)
    remote = _normalize_remote(candidate.remote_evidence)
    employment = _normalize_employment(candidate.employment_type_evidence)
    seniority = _normalize_seniority(candidate.seniority_evidence)
    compensation = _normalize_compensation(candidate)
    (
        eligibility_unknown,
        eligible_locations,
        _eligibility_reason,
    ) = _normalize_eligibility(candidate.location_eligibility_evidence)
    technologies = _normalize_technologies(candidate.technologies_original_text)
    role_families = match_role_families(candidate.title_original)

    posting = SourcePostingInput(
        source_id=candidate.source_id,
        source_posting_id=candidate.source_posting_id,
        source_name=candidate.source_name,
        listing_url=candidate.listing_url,
        listing_url_canonical=canonical_url,
        title_original=candidate.title_original,
        company_original=candidate.company_original,
        description=candidate.description,
        location_original=candidate.location_original,
        remote_status=remote.value,
        employment_type=employment.value,
        seniority=seniority.value,
        seniority_original=candidate.seniority_evidence,
        compensation=compensation.value,
        technologies_original_text=candidate.technologies_original_text,
        location_eligibility_evidence=candidate.location_eligibility_evidence,
        published_at=candidate.published_at,
        source_timestamp=candidate.source_timestamp,
        first_seen_at=candidate.first_seen_at,
        last_seen_at=candidate.last_seen_at,
        closed_at=candidate.closed_at,
        status=candidate.status,
        ingestion_run_id=candidate.ingestion_run_id,
        adapter_version=candidate.adapter_version,
        raw_source_metadata=candidate.raw_source_metadata,
    )
    group = JobGroupInput(
        title=title_display,
        title_original=candidate.title_original,
        title_comparison_key=title_key,
        company=company_display,
        company_original=candidate.company_original,
        company_comparison_key=company_key,
        description=candidate.description,
        location_original=candidate.location_original,
        location_comparison_key=location_key,
        location_normalized_country=None,
        location_normalized_region=None,
        remote_status=remote.value,
        employment_type=employment.value,
        seniority=seniority.value,
        seniority_original=candidate.seniority_evidence,
        compensation=compensation.value,
        published_at=candidate.published_at,
        first_seen_at=candidate.first_seen_at,
        last_seen_at=candidate.last_seen_at,
        closed_at=candidate.closed_at,
        status=candidate.status,
        location_eligibility_unknown=eligibility_unknown,
        technologies=technologies,
        eligible_locations=eligible_locations,
        role_families=role_families,
        last_ingestion_run_id=candidate.ingestion_run_id,
    )
    return NormalizedRecord(
        posting=posting,
        group=group,
        canonical_url=canonical_url,
        title_comparison_key=title_key,
        company_comparison_key=company_key,
        location_comparison_key=location_key,
        role_families=role_families,
        remote=remote,
        employment_type=employment,
        seniority=seniority,
        compensation=compensation,
    )
