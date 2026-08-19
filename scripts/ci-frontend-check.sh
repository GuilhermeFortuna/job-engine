#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-lib.sh
source "${SCRIPT_DIR}/ci-lib.sh"

ci_stage "frontend-check"

ensure_frontend_deps
run_pnpm --filter @job-engine/web run check
