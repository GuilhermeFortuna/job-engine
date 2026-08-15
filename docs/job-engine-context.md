# Job Engine

`job-engine` is a personal job-search intelligence project.

The goal is to build a system that helps me discover, analyze, filter, and rank software-development job opportunities that are realistically suitable for me.

Instead of manually searching through job boards, Job Engine will eventually gather open job postings from multiple sources/APIs, normalize their data, analyze the requirements, and identify the opportunities with the highest expected value for me.

## My profile

I am a software developer based in Brazil.

My strongest areas are:

- Python
- TypeScript / JavaScript
- React / Next.js
- Backend development and APIs
- PostgreSQL / SQL
- Docker
- Git / GitHub / CI/CD
- AWS / GCP
- AI / LLM integrations
- Data processing
- Automation
- Analytics

I am mainly interested in:

- Software Developer
- Full-Stack Developer
- Backend Developer
- Python Developer
- TypeScript / React Developer
- AI Application Developer
- Applied AI roles that do not require deep ML research experience

I am primarily looking for fully remote international positions with US or European companies that allow me to remain living in Brazil.

A rough compensation target is at least US$4,000/month or US$48,000/year.

## Core idea

The long-term pipeline will look roughly like:

```text
Job sources
    ↓
Data ingestion
    ↓
Normalization
    ↓
Deduplication
    ↓
Job requirement analysis
    ↓
Eligibility analysis
    ↓
Fit scoring
    ↓
Ranking / filtering
    ↓
Analytics
```

The system should eventually be able to determine things such as:

- How well a job matches my technical skills
- Whether I can legally/practically work the job while living in Brazil
- Whether compensation meets my target
- Whether the seniority is realistic
- Which required skills I am missing
- Why a particular job received its score
- Which jobs are worth applying to first

It should also support broader analysis of the job market, such as identifying frequently requested technologies, salary distributions, companies that hire internationally, and skills that would most improve my job opportunities.

## Technical direction

The project will be a monorepo.

Backend:

- Python
- FastAPI
- PostgreSQL
- Strongly typed/validated data models

Frontend:

- TypeScript
- React / Next.js

Python will handle job ingestion, processing, scoring, analysis, and eventual AI/LLM-based extraction.

The frontend will eventually provide a dashboard for exploring opportunities and analytics.

## Development philosophy

This project will be built incrementally.

Do **not** assume the entire system needs to be implemented at once.

When working on Job Engine:

- Focus only on the specific task I give you.
- Keep future architecture in mind without prematurely implementing it.
- Avoid unnecessary abstractions and infrastructure.
- Prefer simple, extensible designs.
- Preserve clear boundaries between ingestion, domain logic, persistence, scoring, and presentation.
- Ask yourself whether a design decision will make future job sources or analysis features easier to add.
- Do not build speculative features unless they are necessary for the current task.

Treat this document as background context for understanding what Job Engine is and where it is intended to go.