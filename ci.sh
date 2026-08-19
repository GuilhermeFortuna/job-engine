#!/usr/bin/env bash
set -euo pipefail

# Ensure we operate from the repository root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

# GitHub Actions sets CI=true. Local runs must do the same or Playwright will
# reuse leftover :3005/:8088 servers and follow the host color scheme / motion
# preferences instead of the ubuntu-latest runner environment.
export CI=true

assert_listen_port_free() {
  local port="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :${port}" | grep -q .; then
    echo "❌ Port ${port} is already in use. Stop that process so local CI starts fresh servers like GitHub Actions." >&2
    exit 1
  fi
}

echo "=========================================="
echo "🧪 Running Job Engine Local CI Pipeline"
echo "=========================================="

# 1. Dependency verification & sync
echo "📦 [1/5] Syncing workspace dependencies..."
if command -v corepack >/dev/null 2>&1; then
  corepack pnpm install --frozen-lockfile
else
  pnpm install --frozen-lockfile
fi

(cd apps/api && uv sync --frozen)
echo "✅ Dependencies are synchronized."

# 2. Backend code quality & static typing
echo "🔍 [2/5] Running backend linting and strict type checks..."
(cd apps/api && uv run ruff format --check .)
(cd apps/api && uv run ruff check .)
(cd apps/api && uv run mypy src tests)
echo "✅ Backend linting and type checks passed."

# 3. Database container startup & backend tests
echo "🐘 [3/5] Starting PostgreSQL container & running backend test suite..."
docker compose up -d postgres

DB_USER="${POSTGRES_USER:-job_engine}"
DB_NAME="${POSTGRES_DB:-job_engine}"
MAX_RETRIES=30
COUNT=0

until docker compose exec -T postgres pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; do
  COUNT=$((COUNT + 1))
  if [ "${COUNT}" -ge "${MAX_RETRIES}" ]; then
    echo "❌ Error: PostgreSQL failed to become ready in time." >&2
    exit 1
  fi
  sleep 1
done

(cd apps/api && uv run alembic upgrade head)
(cd apps/api && uv run pytest)
echo "✅ Backend database migrations and Pytest test suite passed."

# 4. Frontend quality checks & unit tests
echo "🎨 [4/5] Running frontend typegen, lint, and Vitest suite..."
if command -v corepack >/dev/null 2>&1; then
  corepack pnpm --filter @job-engine/web run check
  corepack pnpm --filter @job-engine/web run test
else
  pnpm --filter @job-engine/web run check
  pnpm --filter @job-engine/web run test
fi
echo "✅ Frontend type checks, ESLint, and Vitest suite passed."

# 5. Frontend production build & E2E tests
echo "🎭 [5/5] Building Next.js application & running Playwright E2E suite..."
assert_listen_port_free 3005
assert_listen_port_free 8088

E2E_API_BASE_URL="http://127.0.0.1:8088"
pnpm_web() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm --filter @job-engine/web "$@"
  else
    pnpm --filter @job-engine/web "$@"
  fi
}

NEXT_PUBLIC_API_BASE_URL="${E2E_API_BASE_URL}" pnpm_web run build

# GitHub Actions uses --with-deps on Ubuntu. On other distros install the same
# Chromium revision without attempting apt system packages.
if grep -qi ubuntu /etc/os-release 2>/dev/null; then
  (cd apps/web && pnpm exec playwright install --with-deps chromium)
else
  (cd apps/web && pnpm exec playwright install chromium)
fi

pnpm_web run test:e2e
echo "✅ Frontend Next.js build and Playwright E2E suite passed."

echo "=========================================="
echo "🎉 All local CI checks passed successfully!"
echo "=========================================="
