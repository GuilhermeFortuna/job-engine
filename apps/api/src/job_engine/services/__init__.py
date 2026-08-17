from job_engine.services.deduplication import (
    CatalogApplyResult,
    DedupDecision,
    DedupKind,
    DedupReason,
    apply_to_catalog,
    decide_duplicate,
    employment_compatible,
)
from job_engine.services.ingestion import resolve_group_lifecycle, run_ingestion
from job_engine.services.normalization import (
    FieldNormalization,
    NormalizationCandidate,
    NormalizedRecord,
    canonicalize_url,
    comparison_key,
    display_text,
    normalize_candidate,
)

__all__ = [
    "CatalogApplyResult",
    "DedupDecision",
    "DedupKind",
    "DedupReason",
    "FieldNormalization",
    "NormalizationCandidate",
    "NormalizedRecord",
    "apply_to_catalog",
    "canonicalize_url",
    "comparison_key",
    "decide_duplicate",
    "display_text",
    "employment_compatible",
    "normalize_candidate",
    "resolve_group_lifecycle",
    "run_ingestion",
]
