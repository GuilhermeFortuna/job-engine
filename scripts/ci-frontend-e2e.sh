#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-lib.sh
source "${SCRIPT_DIR}/ci-lib.sh"

ci_stage "frontend-e2e"

ensure_frontend_deps
assert_listen_port_free 3005
assert_listen_port_free 8088

export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:8088}"
run_pnpm --filter @job-engine/web run build

# GitHub-hosted Ubuntu runners install OS packages. Local machines (including
# Fedora) install only the Chromium revision Playwright already vendors.
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  (cd "${ROOT_DIR}/apps/web" && run_pnpm exec playwright install --with-deps chromium)
else
  (cd "${ROOT_DIR}/apps/web" && run_pnpm exec playwright install chromium)
fi

run_pnpm --filter @job-engine/web run test:e2e
