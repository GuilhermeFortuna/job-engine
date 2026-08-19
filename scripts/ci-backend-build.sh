#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-lib.sh
source "${SCRIPT_DIR}/ci-lib.sh"

ci_stage "backend-build"

# Deliberately runs with no JOB_ENGINE_RUNNER_SECRET in the environment: the
# documented `pnpm run build` must succeed on a clean checkout. CROSS-009
# defect D-2 was exactly this command failing for a first-time operator.
cd "${ROOT_DIR}/apps/api"
uv sync --frozen
env -u JOB_ENGINE_RUNNER_SECRET uv run python scripts/build_smoke.py
