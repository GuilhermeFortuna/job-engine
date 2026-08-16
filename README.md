# Job Engine

Job Engine V1 is a personal job-search engine. It collects software-development job offers from multiple sources and presents matching opportunities in one consistent interface.

V1 is an aggregator and search tool. It is not an AI career adviser, an application tracker, or an autonomous recommendation system.

The intended user is a software developer living in Brazil who is primarily looking for fully remote international roles with US or European companies.

## Documentation

- [Project context](docs/job-engine-context.md)
- [V1 product specification](docs/v1-product-spec.md)
- [Work Order registry](docs/work-orders/README.md)
- [Work Order status](docs/work-orders/STATUS.md)
- [Local development](docs/development.md)

## Local startup

This repository provides the monorepo root, a local PostgreSQL service, and the Next.js web foundation in `apps/web`. The foundation page is not a live job catalog; search UI belongs to later Work Orders. The backend API package is added by `BACK-001`.

```bash
cp .env.example .env
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
docker compose exec -T postgres pg_isready -U job_engine -d job_engine
corepack pnpm --filter @job-engine/web run dev
```

`corepack pnpm run check` typechecks, lints, and tests workspace packages that define those scripts. Stop the database with `docker compose down`. That command keeps the named volume. See [local development](docs/development.md) for prerequisites, exact versions, frontend commands, health checks, and the separately documented destructive volume reset.
