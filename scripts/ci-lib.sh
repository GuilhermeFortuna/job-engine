# Shared helpers for local and GitHub Actions CI scripts.
# Source this file; do not execute it.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "scripts/ci-lib.sh must be sourced, not executed." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# GitHub Actions sets CI=true. Local runs must do the same or Playwright will
# reuse leftover :3005/:8088 servers and follow the host color scheme / motion
# preferences instead of the ubuntu-latest runner environment.
export CI=true

DOCUMENTED_DATABASE_URL="postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine"
CI_COMPOSE_FILE="${ROOT_DIR}/compose.ci.yml"
CI_COMPOSE_PROJECT="job-engine-ci"

run_pnpm() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    pnpm "$@"
  fi
}

ensure_frontend_deps() {
  if [[ "${CI_SKIP_PNPM_INSTALL:-}" == "1" ]]; then
    return 0
  fi
  run_pnpm install --frozen-lockfile
}

assert_listen_port_free() {
  local port="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :${port}" | grep -q .; then
    echo "Port ${port} is already in use. Stop that process so CI starts fresh listeners like GitHub Actions." >&2
    exit 1
  fi
}

ci_stage() {
  echo
  echo "========== ${1} =========="
}
