import hashlib
import io
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import pypdf

from job_engine.db.repositories import (
    ApplicantVaultRepository,
    ResourceNotFoundError,
)
from job_engine.domain.applicant import (
    ApplicantProfile,
    ApplicantProfileInput,
    CertificationEntry,
    ConfirmedField,
    EducationEntry,
    EmploymentEntry,
    FieldDiffStatus,
    FieldSource,
    LanguageProficiency,
    PolicyCategory,
    ProfileFieldDiff,
    QuestionIntent,
    ResumeAsset,
    ResumeAssetInput,
    ResumeImportProposal,
    ReusableAnswer,
    ReusableAnswerInput,
    ValueState,
)


class ResumeFileValidationError(ValueError):
    """Raised when a resume file path or content violates validation rules."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def resolve_and_verify_subpath(
    root: Path, subpath: str, allowed_extensions: set[str]
) -> Path:
    if not subpath or not isinstance(subpath, str):
        raise ResumeFileValidationError("Path must be a non-empty string")
    if "\0" in subpath:
        raise ResumeFileValidationError("Path must not contain null bytes")
    if subpath.startswith("/") or subpath.startswith("\\"):
        raise ResumeFileValidationError("Path must be relative to the resume root")

    pure = Path(subpath)
    if pure.is_absolute():
        raise ResumeFileValidationError("Path must be relative to the resume root")
    for part in pure.parts:
        if part in {"..", "."}:
            raise ResumeFileValidationError("Path traversal elements are forbidden")

    root_resolved = root.resolve(strict=True)
    if not root_resolved.is_dir():
        raise ResumeFileValidationError(f"Root path is not a directory: {root}")

    candidate = root_resolved / pure
    try:
        candidate_resolved = candidate.resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as err:
        raise ResumeFileValidationError(
            f"File not found or unresolvable: {subpath}"
        ) from err

    if not candidate_resolved.is_relative_to(root_resolved):
        raise ResumeFileValidationError(
            f"Path escapes the configured resume root: {subpath}"
        )
    if not candidate_resolved.is_file():
        raise ResumeFileValidationError(f"Path is not a regular file: {subpath}")

    suffix = candidate_resolved.suffix.lower()
    if suffix not in allowed_extensions:
        raise ResumeFileValidationError(
            f"File extension '{suffix}' not allowed "
            f"(expected one of {allowed_extensions})"
        )
    return candidate_resolved


def compute_file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def validate_pdf_text_layer(path: Path) -> tuple[int, str]:
    file_size = path.stat().st_size
    if file_size == 0:
        raise ResumeFileValidationError("PDF file is empty")

    with path.open("rb") as f:
        header = f.read(5)
        if header != b"%PDF-":
            raise ResumeFileValidationError("File signature does not match PDF header")
        f.seek(0)
        file_bytes = f.read()

    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    except Exception as err:
        raise ResumeFileValidationError(
            f"Malformed or corrupt PDF document: {err}"
        ) from err

    if reader.is_encrypted:
        raise ResumeFileValidationError(
            "Encrypted or password-protected PDFs are forbidden"
        )
    if len(reader.pages) == 0:
        raise ResumeFileValidationError("PDF document contains zero pages")

    extracted_parts: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text()
            if page_text:
                extracted_parts.append(page_text)
        except Exception as err:
            raise ResumeFileValidationError(
                f"Failed to extract text from PDF page: {err}"
            ) from err

    full_text = "\n".join(extracted_parts).strip()
    if not any(c.isalnum() for c in full_text):
        raise ResumeFileValidationError(
            "PDF does not contain a readable text layer (may be image-only or unparsed)"
        )

    sha256_hex = hashlib.sha256(file_bytes).hexdigest().lower()
    return file_size, sha256_hex


def parse_markdown_resume(content: str) -> ApplicantProfileInput:
    lines = [line.rstrip() for line in content.splitlines()]

    first_name = ""
    last_name = ""
    headline = ""
    email = ""
    phone = ""
    city = ""
    region = ""
    country = ""
    portfolio_url = ""
    linkedin_url = ""
    github_url = ""
    summary = ""
    skills_list: list[str] = []
    employment_entries: list[EmploymentEntry] = []
    education_entries: list[EducationEntry] = []
    cert_entries: list[CertificationEntry] = []
    language_entries: list[LanguageProficiency] = []

    sections: dict[str, list[str]] = {}
    current_section = "HEADER"
    sections[current_section] = []

    for line in lines:
        if line.startswith("## "):
            sec_title = line[3:].strip().upper()
            current_section = sec_title
            sections[current_section] = []
        else:
            sections.setdefault(current_section, []).append(line)

    # Parse Header
    header_lines = sections.get("HEADER", [])
    for line in header_lines:
        stripped = line.strip()
        if stripped.startswith("# "):
            name_parts = stripped[2:].strip().split()
            if name_parts:
                first_name = name_parts[0]
                last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        elif stripped.startswith("**") and stripped.endswith("**"):
            headline = stripped.strip("*").strip()
        else:
            # Check for emails
            email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", stripped)
            if email_match:
                email = email_match.group(0)
            # Check for phone
            phone_match = re.search(
                r"(\+\d{1,3}\s?(\(\d+\)|\d+)?[\s\d-]{6,})", stripped
            )
            if phone_match and not phone:
                phone = phone_match.group(0).strip()
            # Check for URLs
            found_urls: list[str] = []
            for m in re.finditer(r"\[([^\]]*)\]\(([^)]+)\)", stripped):
                found_urls.append(m.group(2).strip())
            for token in stripped.split():
                clean_tok = token.strip("()[]<>,•*")
                if clean_tok.startswith("http://") or clean_tok.startswith("https://"):
                    found_urls.append(clean_tok)
                elif clean_tok.startswith("linkedin.com/") or clean_tok.startswith(
                    "github.com/"
                ):
                    found_urls.append(f"https://{clean_tok}")

            for url in found_urls:
                norm_url = (
                    url
                    if (
                        url.startswith("http://")
                        or url.startswith("https://")
                        or ":" in url
                    )
                    else f"https://{url}"
                )
                if "linkedin.com" in norm_url and not linkedin_url:
                    linkedin_url = norm_url
                elif "github.com" in norm_url and not github_url:
                    github_url = norm_url
                elif (
                    not portfolio_url
                    and not norm_url.startswith("tel:")
                    and not norm_url.startswith("mailto:")
                    and ("http://" in norm_url or "https://" in norm_url)
                ):
                    portfolio_url = norm_url
            # Parse Location if available (e.g. City, Country • ...)
            parts = [p.strip() for p in stripped.split("•")]
            if (
                parts
                and "," in parts[0]
                and not any(k in parts[0] for k in ["http", "@", "+"])
            ):
                loc_parts = [lp.strip() for lp in parts[0].split(",")]
                if len(loc_parts) >= 2:
                    city = loc_parts[0]
                    country = loc_parts[-1]
                    if len(loc_parts) == 3:
                        region = loc_parts[1]

    # Parse Summary
    for sec_name, sec_lines in sections.items():
        if "SUMMARY" in sec_name:
            summary = "\n".join(
                line_item.strip()
                for line_item in sec_lines
                if line_item.strip() and not line_item.startswith("---")
            )

    # Parse Skills
    for sec_name, sec_lines in sections.items():
        if "SKILL" in sec_name:
            for line in sec_lines:
                stripped = line.strip()
                if stripped.startswith("- "):
                    content_part = stripped[2:]
                    if ":" in content_part:
                        _, items_str = content_part.split(":", 1)
                    else:
                        items_str = content_part
                    # strip bold/brackets
                    items_str = (
                        items_str.replace("[", "").replace("]", "").replace("*", "")
                    )
                    for term in items_str.split(","):
                        term_clean = term.strip()
                        if term_clean and not term_clean.startswith("e.g."):
                            skills_list.append(term_clean)

    # Parse Experience
    for sec_name, sec_lines in sections.items():
        if "EXPERIENCE" in sec_name:
            current_company = ""
            current_location = ""
            current_role = ""
            current_dates = ""
            current_bullets: list[str] = []

            def flush_experience() -> None:
                nonlocal \
                    current_company, \
                    current_location, \
                    current_role, \
                    current_dates, \
                    current_bullets
                if current_company or current_role:
                    start_date = current_dates
                    end_date = None
                    is_current = False
                    if "–" in current_dates or "-" in current_dates:
                        sep = "–" if "–" in current_dates else "-"
                        parts = [p.strip() for p in current_dates.split(sep, 1)]
                        start_date = parts[0]
                        end_date = parts[1] if len(parts) > 1 else None
                        if end_date and "present" in end_date.lower():
                            is_current = True
                    employment_entries.append(
                        EmploymentEntry(
                            id=uuid4(),
                            company=current_company or "Unknown Company",
                            title=current_role or "Engineer",
                            location=current_location or None,
                            start_date=start_date or "Unknown",
                            end_date=end_date,
                            is_current=is_current,
                            responsibilities=tuple(current_bullets),
                        )
                    )
                current_company = ""
                current_location = ""
                current_role = ""
                current_dates = ""
                current_bullets = []

            for line in sec_lines:
                stripped = line.strip()
                if stripped.startswith("### "):
                    flush_experience()
                    header_content = stripped[4:].strip()
                    if "|" in header_content:
                        c_part, l_part = header_content.split("|", 1)
                        current_company = c_part.replace("*", "").strip()
                        current_location = l_part.replace("*", "").strip()
                    else:
                        current_company = header_content.replace("*", "").strip()
                elif stripped.startswith("**") and "|" in stripped:
                    r_part, d_part = stripped.split("|", 1)
                    current_role = r_part.replace("*", "").strip()
                    current_dates = d_part.replace("*", "").strip()
                elif stripped.startswith("- "):
                    bullet = stripped[2:].replace("*", "").strip()
                    if bullet:
                        current_bullets.append(bullet)
            flush_experience()

    # Parse Education & Certifications
    for sec_name, sec_lines in sections.items():
        if "EDUCATION" in sec_name or "CERTIFICATION" in sec_name:
            for line in sec_lines:
                stripped = line.strip()
                if stripped.startswith("- "):
                    entry_text = stripped[2:].strip()
                    entry_lower = entry_text.lower()
                    is_cert = (
                        "CERTIFICATION" in sec_name
                        or "cert" in entry_lower
                        or "aws" in entry_lower
                        or "architect" in entry_lower
                        or "gcp" in entry_lower
                        or "azure" in entry_lower
                        or "license" in entry_lower
                    ) and not (
                        "b.s." in entry_lower
                        or "b.a." in entry_lower
                        or "m.s." in entry_lower
                        or "ph.d." in entry_lower
                        or "bachelor" in entry_lower
                        or "master" in entry_lower
                        or "degree" in entry_lower
                        or "university" in entry_lower
                    )
                    if is_cert:
                        cert_entries.append(
                            CertificationEntry(
                                id=uuid4(),
                                name=entry_text.replace("*", "").strip(),
                            )
                        )
                    else:
                        inst = "Unknown"
                        deg = entry_text.replace("*", "").strip()
                        if "—" in entry_text or "-" in entry_text:
                            sep = "—" if "—" in entry_text else "-"
                            deg_p, inst_p = entry_text.split(sep, 1)
                            deg = deg_p.replace("*", "").strip()
                            inst = inst_p.replace("*", "").strip()
                        education_entries.append(
                            EducationEntry(
                                id=uuid4(),
                                institution=inst,
                                degree=deg,
                            )
                        )

    # Parse Languages
    for sec_name, sec_lines in sections.items():
        if "LANGUAGE" in sec_name:
            for line in sec_lines:
                stripped = line.strip()
                if stripped.startswith("- "):
                    content_part = stripped[2:].strip()
                    if ":" in content_part:
                        l_part, p_part = content_part.split(":", 1)
                        language_entries.append(
                            LanguageProficiency(
                                id=uuid4(),
                                language=l_part.replace("*", "").strip(),
                                proficiency=p_part.replace("*", "").strip(),
                            )
                        )

    now = _utcnow()

    def make_field[T](val: T | None, state: ValueState) -> ConfirmedField[T]:
        if state == ValueState.PROVIDED and val is not None:
            return ConfirmedField[T](
                state=ValueState.PROVIDED,
                value=val,
                source=FieldSource.RESUME_IMPORT,
                last_confirmed_at=now,
                policy_category=PolicyCategory.VERIFIED_PROFILE,
            )
        return ConfirmedField[T](state=ValueState.UNKNOWN)

    return ApplicantProfileInput(
        first_name=make_field(
            first_name, ValueState.PROVIDED if first_name else ValueState.UNKNOWN
        ),
        last_name=make_field(
            last_name, ValueState.PROVIDED if last_name else ValueState.UNKNOWN
        ),
        email=make_field(email, ValueState.PROVIDED if email else ValueState.UNKNOWN),
        phone=make_field(phone, ValueState.PROVIDED if phone else ValueState.UNKNOWN),
        city=make_field(city, ValueState.PROVIDED if city else ValueState.UNKNOWN),
        region=make_field(
            region, ValueState.PROVIDED if region else ValueState.UNKNOWN
        ),
        country=make_field(
            country, ValueState.PROVIDED if country else ValueState.UNKNOWN
        ),
        timezone=make_field(None, ValueState.UNKNOWN),
        headline=make_field(
            headline, ValueState.PROVIDED if headline else ValueState.UNKNOWN
        ),
        summary=make_field(
            summary, ValueState.PROVIDED if summary else ValueState.UNKNOWN
        ),
        portfolio_url=make_field(
            portfolio_url, ValueState.PROVIDED if portfolio_url else ValueState.UNKNOWN
        ),
        linkedin_url=make_field(
            linkedin_url, ValueState.PROVIDED if linkedin_url else ValueState.UNKNOWN
        ),
        github_url=make_field(
            github_url, ValueState.PROVIDED if github_url else ValueState.UNKNOWN
        ),
        custom_urls=make_field(None, ValueState.UNKNOWN),
        notice_period_days=make_field(None, ValueState.UNKNOWN),
        employment_history=make_field(
            tuple(employment_entries),
            ValueState.PROVIDED if employment_entries else ValueState.UNKNOWN,
        ),
        education_history=make_field(
            tuple(education_entries),
            ValueState.PROVIDED if education_entries else ValueState.UNKNOWN,
        ),
        skills=make_field(
            tuple(skills_list),
            ValueState.PROVIDED if skills_list else ValueState.UNKNOWN,
        ),
        languages=make_field(
            tuple(language_entries),
            ValueState.PROVIDED if language_entries else ValueState.UNKNOWN,
        ),
        certifications=make_field(
            tuple(cert_entries),
            ValueState.PROVIDED if cert_entries else ValueState.UNKNOWN,
        ),
        work_authorizations=make_field(None, ValueState.UNKNOWN),
        compensation_expectation=make_field(None, ValueState.UNKNOWN),
        location_preferences=make_field(None, ValueState.UNKNOWN),
        demographics=make_field(None, ValueState.UNKNOWN),
    )


def generate_import_proposal(
    current_profile: ApplicantProfile | None,
    source_markdown_path: str,
    parsed: ApplicantProfileInput,
) -> ResumeImportProposal:
    diffs: list[ProfileFieldDiff] = []
    field_names = [
        "first_name",
        "last_name",
        "email",
        "phone",
        "city",
        "region",
        "country",
        "headline",
        "summary",
        "portfolio_url",
        "linkedin_url",
        "github_url",
        "skills",
        "employment_history",
        "education_history",
        "languages",
        "certifications",
    ]

    for name in field_names:
        proposed_field: ConfirmedField[Any] = getattr(parsed, name)
        current_field: ConfirmedField[Any] = (
            getattr(current_profile, name) if current_profile else ConfirmedField()
        )

        if proposed_field.state != ValueState.PROVIDED:
            continue

        if current_field.state == ValueState.UNKNOWN:
            diffs.append(
                ProfileFieldDiff(
                    field_path=name,
                    status=FieldDiffStatus.ADDED,
                    current_value=None,
                    proposed_value=proposed_field.value,
                    message="Field will be populated from resume import",
                )
            )
        elif current_field.state == ValueState.DECLINED:
            diffs.append(
                ProfileFieldDiff(
                    field_path=name,
                    status=FieldDiffStatus.UNCHANGED,
                    current_value="[DECLINED]",
                    proposed_value=proposed_field.value,
                    message=(
                        "Field was explicitly declined by owner; "
                        "proposed import ignored"
                    ),
                )
            )
        elif current_field.state == ValueState.PROVIDED:
            if current_field.value == proposed_field.value:
                diffs.append(
                    ProfileFieldDiff(
                        field_path=name,
                        status=FieldDiffStatus.UNCHANGED,
                        current_value=current_field.value,
                        proposed_value=proposed_field.value,
                        message="Field matches confirmed value",
                    )
                )
            else:
                diffs.append(
                    ProfileFieldDiff(
                        field_path=name,
                        status=FieldDiffStatus.MODIFIED,
                        current_value=current_field.value,
                        proposed_value=proposed_field.value,
                        message="Field differs from confirmed value",
                    )
                )

    return ResumeImportProposal(
        source_markdown_path=source_markdown_path,
        generated_at=_utcnow(),
        diffs=tuple(diffs),
        proposed_profile=parsed,
    )


class ApplicantService:
    def __init__(self, repo: ApplicantVaultRepository, resume_root: Path) -> None:
        self._repo = repo
        self._resume_root = resume_root

    async def get_profile(self) -> ApplicantProfile | None:
        return await self._repo.get_profile()

    async def replace_profile(
        self, profile_input: ApplicantProfileInput, expected_version: int | None
    ) -> ApplicantProfile:
        return await self._repo.replace_profile(profile_input, expected_version)

    async def import_resume_preview(
        self, source_markdown_path: str
    ) -> ResumeImportProposal:
        canonical_md = resolve_and_verify_subpath(
            self._resume_root, source_markdown_path, {".md"}
        )
        content = canonical_md.read_text(encoding="utf-8")
        parsed = parse_markdown_resume(content)
        current = await self._repo.get_profile()
        return generate_import_proposal(current, source_markdown_path, parsed)

    async def list_resumes(self) -> tuple[ResumeAsset, ...]:
        return await self._repo.list_resumes()

    async def get_resume(self, resume_id: str) -> ResumeAsset | None:
        return await self._repo.get_resume(resume_id)

    async def register_resume(self, input_data: ResumeAssetInput) -> ResumeAsset:
        existing = await self._repo.get_resume(input_data.resume_id)
        if existing is not None:
            raise ResumeFileValidationError(
                f"Resume with ID '{input_data.resume_id}' is already registered"
            )

        resolve_and_verify_subpath(
            self._resume_root, input_data.source_markdown_path, {".md"}
        )
        pdf_path = resolve_and_verify_subpath(
            self._resume_root, input_data.upload_pdf_path, {".pdf"}
        )
        if input_data.preview_html_path:
            resolve_and_verify_subpath(
                self._resume_root, input_data.preview_html_path, {".html"}
            )

        file_size, sha256_hex = validate_pdf_text_layer(pdf_path)
        return await self._repo.create_resume(
            input_data,
            sha256=sha256_hex,
            file_size_bytes=file_size,
            last_verified_at=_utcnow(),
        )

    async def patch_resume(
        self,
        resume_id: str,
        *,
        label: str | None = None,
        is_default: bool | None = None,
        refresh_checksum: bool = False,
        expected_version: int,
    ) -> ResumeAsset:
        current = await self._repo.get_resume(resume_id)
        if current is None:
            raise ResourceNotFoundError(f"Resume asset {resume_id} does not exist")

        sha256_val: str | None = None
        size_val: int | None = None
        verified_at: datetime | None = None

        if refresh_checksum:
            pdf_path = resolve_and_verify_subpath(
                self._resume_root, current.upload_pdf_path, {".pdf"}
            )
            size_val, sha256_val = validate_pdf_text_layer(pdf_path)
            verified_at = _utcnow()

        return await self._repo.update_resume(
            resume_id,
            label=label,
            is_default=is_default,
            sha256=sha256_val,
            file_size_bytes=size_val,
            last_verified_at=verified_at,
            expected_version=expected_version,
        )

    async def delete_resume(self, resume_id: str, expected_version: int) -> None:
        await self._repo.delete_resume(resume_id, expected_version)

    async def list_answers(
        self,
        *,
        question_intent: QuestionIntent | str | None = None,
        jurisdiction: str | None = None,
        platform_scope: str | None = None,
    ) -> tuple[ReusableAnswer, ...]:
        return await self._repo.list_answers(
            question_intent=question_intent,
            jurisdiction=jurisdiction,
            platform_scope=platform_scope,
        )

    async def get_answer(self, answer_id: str) -> ReusableAnswer | None:
        return await self._repo.get_answer(answer_id)

    async def create_answer(self, answer_input: ReusableAnswerInput) -> ReusableAnswer:
        existing = await self._repo.get_answer(answer_input.answer_id)
        if existing is not None:
            raise ValueError(
                f"Answer with ID '{answer_input.answer_id}' already exists"
            )
        return await self._repo.create_answer(answer_input)

    async def update_answer(
        self,
        answer_id: str,
        answer_input: ReusableAnswerInput,
        expected_version: int,
    ) -> ReusableAnswer:
        return await self._repo.update_answer(answer_id, answer_input, expected_version)

    async def delete_answer(self, answer_id: str, expected_version: int) -> None:
        await self._repo.delete_answer(answer_id, expected_version)
