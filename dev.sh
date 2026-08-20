#!/usr/bin/env bash
set -euo pipefail

# Ensure we operate from the repository root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

echo "=========================================="
echo "🚀 Starting Job Engine Development Stack"
echo "=========================================="

# 1. Environment configuration
if [ ! -f .env ]; then
  echo "📝 .env file not found. Creating from .env.example..."
  cp .env.example .env

  # The API refuses to start with a runner secret under 32 characters, and the
  # shipped placeholder must never become a real deployment secret. Mint one.
  if command -v openssl >/dev/null 2>&1; then
    GENERATED_RUNNER_SECRET="$(openssl rand -hex 32)"
  else
    GENERATED_RUNNER_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  sed -i.bak "s|^JOB_ENGINE_RUNNER_SECRET=.*|JOB_ENGINE_RUNNER_SECRET=${GENERATED_RUNNER_SECRET}|" .env
  rm -f .env.bak
  echo "🔐 Generated a unique JOB_ENGINE_RUNNER_SECRET in .env."
fi

# Export environment variables for the current session
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# 2. Dependency verification & sync
echo "📦 Verifying Node workspace dependencies..."
if command -v corepack >/dev/null 2>&1; then
  corepack pnpm install --frozen-lockfile
else
  pnpm install --frozen-lockfile
fi

echo "🐍 Syncing Python dependencies in apps/api..."
(cd apps/api && uv sync --frozen)

# 3. Database container startup & readiness check
echo "🐘 Starting PostgreSQL container..."
docker compose up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
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
echo "✅ PostgreSQL is ready."

# 4. Run database migrations
echo "🔄 Running database schema migrations..."
(cd apps/api && uv run alembic upgrade head)
echo "✅ Database migrations are up to date."

# 5. Launch development servers
echo "=========================================="
echo "✨ Starting backend API and web frontend..."
echo "   - API: http://127.0.0.1:8001 (Health: http://127.0.0.1:8001/api/v1/health)"
echo "   - Web: http://localhost:3000"
echo "=========================================="

if command -v corepack >/dev/null 2>&1; then
  exec corepack pnpm run dev
else
  exec pnpm run dev
fi
