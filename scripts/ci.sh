#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-lib.sh
source "${SCRIPT_DIR}/ci-lib.sh"

cleanup_ci_postgres() {
  if [[ "${CI_KEEP_POSTGRES:-}" == "1" ]]; then
    echo "CI_KEEP_POSTGRES=1 set; leaving ${CI_COMPOSE_PROJECT} running."
    return 0
  fi
  docker compose -f "${CI_COMPOSE_FILE}" -p "${CI_COMPOSE_PROJECT}" down -v
}

echo "=========================================="
echo "Job Engine local CI (mirrors GitHub Actions)"
echo "=========================================="

ci_stage "install frontend dependencies"
ensure_frontend_deps
export CI_SKIP_PNPM_INSTALL=1

ci_stage "start CI PostgreSQL 17.11"
assert_listen_port_free 5432
trap cleanup_ci_postgres EXIT
docker compose -f "${CI_COMPOSE_FILE}" -p "${CI_COMPOSE_PROJECT}" up -d --wait

"${SCRIPT_DIR}/ci-backend-check.sh"
"${SCRIPT_DIR}/ci-backend-build.sh"
"${SCRIPT_DIR}/ci-backend-test.sh"
"${SCRIPT_DIR}/ci-frontend-check.sh"
"${SCRIPT_DIR}/ci-frontend-test.sh"
"${SCRIPT_DIR}/ci-frontend-e2e.sh"

echo
echo "=========================================="
echo "All local CI checks passed."
echo "=========================================="
