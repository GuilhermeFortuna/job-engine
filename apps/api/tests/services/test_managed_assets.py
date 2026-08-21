import io
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import docx
import pytest

from job_engine.domain.applicant import ManagedAssetType
from job_engine.services.managed_assets import (
    InvalidAssetTypeError,
    ManagedAssetService,
    OversizeAssetError,
    detect_file_type,
    sanitize_filename,
)


def _make_pdf(text: str = "Candidate Profile Bio Text") -> bytes:
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


def _make_docx(text: str = "Docx Candidate Experience") -> bytes:
    doc = docx.Document()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_png() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _make_jpeg() -> bytes:
    return (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
        b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
        b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342"
        b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00"
        b"\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01"
        b"\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00"
        b"\xbf\x00\xff\xd9"
    )


async def _stream_bytes(data: bytes, chunk_size: int = 1024) -> AsyncIterator[bytes]:
    for i in range(0, len(data), chunk_size):
        yield data[i : i + chunk_size]


@pytest.mark.asyncio
async def test_managed_assets_save_and_extract_pdf(tmp_path: Path) -> None:
    service = ManagedAssetService(tmp_path)
    profile_id = uuid4()
    pdf_bytes = _make_pdf("Engineering Leadership and Distributed Systems")

    asset = await service.store_asset_stream(
        profile_id=profile_id,
        asset_type=ManagedAssetType.DOCUMENT,
        filename="resume.pdf",
        declared_content_type="application/pdf",
        content_stream=_stream_bytes(pdf_bytes),
    )

    assert asset.profile_id == profile_id
    assert asset.file_name == "resume.pdf"
    assert asset.content_type == "application/pdf"
    assert asset.byte_size == len(pdf_bytes)
    assert len(asset.sha256) == 64
    assert asset.extracted_text is not None
    assert "Engineering Leadership" in asset.extracted_text

    # Verify physical file existence
    physical_path, size = service.get_asset_file(asset.relative_path)
    assert physical_path.is_file()
    assert size == len(pdf_bytes)
    assert physical_path.read_bytes() == pdf_bytes


@pytest.mark.asyncio
async def test_managed_assets_save_and_extract_docx(tmp_path: Path) -> None:
    service = ManagedAssetService(tmp_path)
    profile_id = uuid4()
    docx_bytes = _make_docx("Full-Stack Senior Developer Experience")

    asset = await service.store_asset_stream(
        profile_id=profile_id,
        asset_type=ManagedAssetType.DOCUMENT,
        filename="portfolio_doc.docx",
        declared_content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content_stream=_stream_bytes(docx_bytes),
    )

    assert asset.content_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert asset.extracted_text is not None
    assert "Full-Stack Senior Developer Experience" in asset.extracted_text


@pytest.mark.asyncio
async def test_managed_assets_save_avatar_image(tmp_path: Path) -> None:
    service = ManagedAssetService(tmp_path)
    profile_id = uuid4()
    png_bytes = _make_png()

    asset = await service.store_asset_stream(
        profile_id=profile_id,
        asset_type=ManagedAssetType.AVATAR,
        filename="avatar.png",
        declared_content_type="image/png",
        content_stream=_stream_bytes(png_bytes),
    )

    assert asset.content_type == "image/png"
    assert asset.extracted_text is None
    assert asset.byte_size == len(png_bytes)


@pytest.mark.asyncio
async def test_managed_assets_rejects_magic_byte_mismatch(tmp_path: Path) -> None:
    service = ManagedAssetService(tmp_path)
    profile_id = uuid4()
    fake_pdf = b"This is plain text pretending to be a PDF"

    with pytest.raises(InvalidAssetTypeError):
        await service.store_asset_stream(
            profile_id=profile_id,
            asset_type=ManagedAssetType.DOCUMENT,
            filename="fake.pdf",
            declared_content_type="application/pdf",
            content_stream=_stream_bytes(fake_pdf),
        )


@pytest.mark.asyncio
async def test_managed_assets_rejects_oversized_file(tmp_path: Path) -> None:
    service = ManagedAssetService(tmp_path)
    profile_id = uuid4()
    # 20 MiB limit for documents
    oversized = b"%PDF-1.4\n" + (b"X" * (20 * 1024 * 1024 + 1024))

    with pytest.raises(OversizeAssetError):
        await service.store_asset_stream(
            profile_id=profile_id,
            asset_type=ManagedAssetType.DOCUMENT,
            filename="huge.pdf",
            declared_content_type="application/pdf",
            content_stream=_stream_bytes(oversized),
        )


def test_sanitize_filename_prevents_traversal() -> None:
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("safe_file.pdf") == "safe_file.pdf"
    assert sanitize_filename("", fallback_ext=".pdf") == "asset.pdf"


def test_detect_file_type() -> None:
    mime, ext = detect_file_type(b"%PDF-1.4...")
    assert mime == "application/pdf"
    assert ext == ".pdf"

    mime_png, ext_png = detect_file_type(b"\x89PNG\r\n\x1a\n...")
    assert mime_png == "image/png"
    assert ext_png == ".png"

    mime_jpg, ext_jpg = detect_file_type(b"\xff\xd8\xff...")
    assert mime_jpg == "image/jpeg"
    assert ext_jpg == ".jpg"
