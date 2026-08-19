#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-lib.sh
source "${SCRIPT_DIR}/ci-lib.sh"

ci_stage "backend-test"

export DATABASE_URL="${DATABASE_URL:-${DOCUMENTED_DATABASE_URL}}"

cd "${ROOT_DIR}/apps/api"
uv sync --frozen
uv run alembic upgrade head
uv run pytest
