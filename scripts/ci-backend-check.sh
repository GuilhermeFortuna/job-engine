#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-lib.sh
source "${SCRIPT_DIR}/ci-lib.sh"

ci_stage "backend-check"

cd "${ROOT_DIR}/apps/api"
uv sync --frozen
uv run ruff format --check .
uv run ruff check .
uv run mypy src tests
