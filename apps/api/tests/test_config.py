import shutil
from pathlib import Path

from pytest import MonkeyPatch

from job_engine.config import REPO_ROOT, Settings


def test_resolved_evidence_root_expands_tilde(
    tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    home = tmp_path / "owner-home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))

    literal_tilde_root = REPO_ROOT / "~"
    existed_before = literal_tilde_root.exists()

    try:
        settings = Settings(evidence_root=Path("~/.job-engine/evidence"))
        resolved = settings.resolved_evidence_root
    finally:
        if not existed_before and literal_tilde_root.exists():
            shutil.rmtree(literal_tilde_root)

    expected = (home / ".job-engine" / "evidence").resolve()
    assert resolved == expected
    assert expected.is_dir()
    assert "~" not in resolved.parts
