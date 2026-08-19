from pathlib import Path
from uuid import uuid4

import pytest

from job_engine.domain.applicant import (
    ApplicantProfile,
    ConfirmedField,
    FieldDiffStatus,
    FieldSource,
    ValueState,
)
from job_engine.services.applicant import (
    ResumeFileValidationError,
    compute_file_sha256,
    generate_import_proposal,
    parse_markdown_resume,
    resolve_and_verify_subpath,
    validate_pdf_text_layer,
)


def _make_valid_pdf_bytes(text: str = "Candidate Full Stack Engineer Resume") -> bytes:
    content = f"BT /F1 12 Tf 72 712 Td ({text}) Tj ET".encode("latin-1")
    stream_len = len(content)
    pdf = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  /Contents 4 0 R
  /Resources << /Font << /F1 5 0 R >> >>
>>
endobj
4 0 obj
<< /Length {stream_len} >>
stream
BT /F1 12 Tf 72 712 Td ({text}) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
365
%%EOF
""".encode("latin-1")
    return pdf


def _make_empty_text_pdf_bytes() -> bytes:
    pdf = """%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000203 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
246
%%EOF
""".encode("latin-1")
    return pdf


def test_resolve_and_verify_subpath_valid(tmp_path: Path) -> None:
    doc = tmp_path / "resume.md"
    doc.write_text("# Test Resume", encoding="utf-8")

    sub_dir = tmp_path / "nested"
    sub_dir.mkdir()
    nested_doc = sub_dir / "resume.pdf"
    nested_doc.write_bytes(_make_valid_pdf_bytes())

    res1 = resolve_and_verify_subpath(tmp_path, "resume.md", {".md"})
    assert res1 == doc.resolve()

    res2 = resolve_and_verify_subpath(tmp_path, "nested/resume.pdf", {".pdf"})
    assert res2 == nested_doc.resolve()


def test_resolve_and_verify_subpath_traversal_rejection(tmp_path: Path) -> None:
    outside = tmp_path.parent / "secret.txt"
    outside.write_text("secret", encoding="utf-8")

    # Path traversal with ..
    with pytest.raises(ResumeFileValidationError, match="Path traversal"):
        resolve_and_verify_subpath(tmp_path, "../secret.txt", {".txt"})

    # Absolute path
    with pytest.raises(ResumeFileValidationError, match="Path must be relative"):
        resolve_and_verify_subpath(tmp_path, str(outside), {".txt"})

    # Leading slash
    with pytest.raises(ResumeFileValidationError, match="Path must be relative"):
        resolve_and_verify_subpath(tmp_path, "/etc/passwd", {".txt"})

    # Null bytes
    with pytest.raises(ResumeFileValidationError, match="null bytes"):
        resolve_and_verify_subpath(tmp_path, "resume.md\0.exe", {".md"})


def test_resolve_and_verify_subpath_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path.parent / "outside_secret.md"
    outside.write_text("secret", encoding="utf-8")

    # Create symlink inside root pointing outside
    link = tmp_path / "escape_link.md"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("Symlink creation not supported in this environment")

    with pytest.raises(
        ResumeFileValidationError, match="escapes the configured resume root"
    ):
        resolve_and_verify_subpath(tmp_path, "escape_link.md", {".md"})


def test_resolve_and_verify_subpath_extension_and_missing(tmp_path: Path) -> None:
    doc = tmp_path / "resume.txt"
    doc.write_text("test", encoding="utf-8")

    # Extension not allowed
    with pytest.raises(
        ResumeFileValidationError, match="File extension '.txt' not allowed"
    ):
        resolve_and_verify_subpath(tmp_path, "resume.txt", {".md", ".pdf"})

    # Missing file
    with pytest.raises(ResumeFileValidationError, match="File not found"):
        resolve_and_verify_subpath(tmp_path, "nonexistent.md", {".md"})


def test_validate_pdf_text_layer_valid(tmp_path: Path) -> None:
    pdf_file = tmp_path / "valid.pdf"
    pdf_bytes = _make_valid_pdf_bytes("Senior Backend Engineer Python")
    pdf_file.write_bytes(pdf_bytes)

    size, sha = validate_pdf_text_layer(pdf_file)
    assert size == len(pdf_bytes)
    assert len(sha) == 64
    assert sha == compute_file_sha256(pdf_file)


def test_validate_pdf_text_layer_invalid(tmp_path: Path) -> None:
    # Empty file
    empty_file = tmp_path / "empty.pdf"
    empty_file.write_bytes(b"")
    with pytest.raises(ResumeFileValidationError, match="PDF file is empty"):
        validate_pdf_text_layer(empty_file)

    # Invalid header
    bad_header = tmp_path / "bad.pdf"
    bad_header.write_bytes(b"NOT_A_PDF_FILE")
    with pytest.raises(ResumeFileValidationError, match="signature does not match"):
        validate_pdf_text_layer(bad_header)

    # PDF with no text layer
    no_text_pdf = tmp_path / "no_text.pdf"
    no_text_pdf.write_bytes(_make_empty_text_pdf_bytes())
    with pytest.raises(ResumeFileValidationError, match="readable text layer"):
        validate_pdf_text_layer(no_text_pdf)


def test_parse_markdown_resume_synthetic() -> None:
    sample_md = """# ALEX RIVERA
**Senior Software Engineer | Python, TypeScript, Distributed Systems**  
San Francisco, CA, USA • [+1 (555) 123-4567](tel:+15551234567)
[alex.rivera@example.com](mailto:alex.rivera@example.com) • [alexrivera.dev](https://alexrivera.dev)
[linkedin.com/in/alexrivera](https://linkedin.com/in/alexrivera) • [github.com/alexrivera](https://github.com/alexrivera)

---

## PROFESSIONAL SUMMARY
Seasoned backend engineer with 8+ years of experience designing scalable microservices,
async event pipelines, and robust APIs.

---

## TECHNICAL SKILLS
- **Languages:** Python, TypeScript, Go, SQL
- **Backend & APIs:** FastAPI, Node.js, PostgreSQL, Redis

---

## WORK EXPERIENCE

### **Acme Systems** | *San Francisco, CA*
**Staff Engineer** | *2021-06 – Present*
- Architected high-throughput ingestion pipeline handling 10M events daily.
- Mentored junior engineers and led system architecture reviews.

### **Beta Technologies** | *Remote*
**Senior Backend Developer** | *2018-01 – 2021-05*
- Built real-time WebSocket telemetry service.

---

## EDUCATION & CERTIFICATIONS
- **B.S. in Computer Science** — University of California, Berkeley *(2014-2018)*
- **AWS Solutions Architect** — Amazon Web Services *(2020)*

---

## LANGUAGES
- **English:** Native
- **Spanish:** Professional Working Proficiency
"""

    parsed = parse_markdown_resume(sample_md)

    assert parsed.first_name.value == "ALEX"
    assert parsed.last_name.value == "RIVERA"
    assert parsed.email.value == "alex.rivera@example.com"
    assert parsed.phone.value == "+1 (555) 123-4567"
    assert parsed.city.value == "San Francisco"
    assert parsed.country.value == "USA"
    assert parsed.portfolio_url.value == "https://alexrivera.dev"
    assert parsed.linkedin_url.value == "https://linkedin.com/in/alexrivera"
    assert parsed.github_url.value == "https://github.com/alexrivera"
    assert "Seasoned backend engineer" in (parsed.summary.value or "")

    skills = parsed.skills.value or ()
    assert "Python" in skills
    assert "TypeScript" in skills
    assert "FastAPI" in skills
    assert "PostgreSQL" in skills

    exp = parsed.employment_history.value or ()
    assert len(exp) == 2
    assert exp[0].company == "Acme Systems"
    assert exp[0].title == "Staff Engineer"
    assert exp[0].is_current is True

    edu = parsed.education_history.value or ()
    assert len(edu) >= 1
    assert "Berkeley" in edu[0].institution or "Berkeley" in edu[0].degree

    certs = parsed.certifications.value or ()
    assert len(certs) >= 1
    assert "AWS" in certs[0].name

    langs = parsed.languages.value or ()
    assert len(langs) == 2
    assert langs[0].language == "English"

    # Invariant: Sensitive fields remain UNKNOWN
    assert parsed.work_authorizations.state == ValueState.UNKNOWN
    assert parsed.compensation_expectation.state == ValueState.UNKNOWN
    assert parsed.demographics.state == ValueState.UNKNOWN


def test_generate_import_proposal() -> None:
    sample_md = """# ALEX RIVERA
**Senior Engineer**  
San Francisco, USA • alex@example.com • [alex.dev](https://alex.dev)
"""
    parsed = parse_markdown_resume(sample_md)

    # 1. Against empty/None profile -> all added
    prop1 = generate_import_proposal(None, "resume.md", parsed)
    assert len(prop1.diffs) > 0
    diff_map = {d.field_path: d for d in prop1.diffs}
    assert diff_map["first_name"].status == FieldDiffStatus.ADDED
    assert diff_map["email"].status == FieldDiffStatus.ADDED

    # 2. Against existing matching profile -> unchanged
    existing_matching = ApplicantProfile(
        id=uuid4(),
        version=1,
        created_at=prop1.generated_at,
        updated_at=prop1.generated_at,
        first_name=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="ALEX",
            source=FieldSource.OWNER,
            last_confirmed_at=prop1.generated_at,
        ),
        last_name=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="RIVERA",
            source=FieldSource.OWNER,
            last_confirmed_at=prop1.generated_at,
        ),
        email=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="alex@example.com",
            source=FieldSource.OWNER,
            last_confirmed_at=prop1.generated_at,
        ),
    )
    prop2 = generate_import_proposal(existing_matching, "resume.md", parsed)
    diff_map2 = {d.field_path: d for d in prop2.diffs}
    assert diff_map2["first_name"].status == FieldDiffStatus.UNCHANGED
    assert diff_map2["email"].status == FieldDiffStatus.UNCHANGED

    # 3. Against modified field -> modified
    existing_diff = ApplicantProfile(
        id=uuid4(),
        version=1,
        created_at=prop1.generated_at,
        updated_at=prop1.generated_at,
        email=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="different.alex@example.com",
            source=FieldSource.OWNER,
            last_confirmed_at=prop1.generated_at,
        ),
    )
    prop3 = generate_import_proposal(existing_diff, "resume.md", parsed)
    diff_map3 = {d.field_path: d for d in prop3.diffs}
    assert diff_map3["email"].status == FieldDiffStatus.MODIFIED
