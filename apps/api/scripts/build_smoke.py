"""Build-time smoke check for the API application graph.

Constructs the full FastAPI app so a broken import, router, or middleware
registration fails the build. Configuration is supplied explicitly rather than
read from the environment: `pnpm run build` must work on a clean checkout, and
the operator-facing requirement that `JOB_ENGINE_RUNNER_SECRET` be a real 32+
character secret is a *server startup* guard, enforced by `create_app()` and
covered by `tests/test_health.py`.
"""

from job_engine.config import Settings
from job_engine.main import create_app

BUILD_ONLY_RUNNER_SECRET = "build-smoke-check-not-a-real-secret-0000"


def main() -> None:
    settings = Settings(runner_secret=BUILD_ONLY_RUNNER_SECRET)
    app = create_app(settings)
    if not app.routes:
        raise SystemExit("API built with no routes registered")
    print(f"API build smoke check passed ({len(app.routes)} routes).")


if __name__ == "__main__":
    main()
