# FlowMedic Live

**When automations break, ours help them recover.**

FlowMedic Live is a Vercel-deployable Next.js application for showing real workflow execution and safely recovering from supported integration failures. The first demo path reads GitHub issues, stores them in managed Postgres, detects a controlled schema mismatch, proposes an allowlisted repair, waits for human approval, and verifies an idempotent replay.

## Current status

Phase 00 foundation is **complete** and recorded in [`docs/PHASES/phase-00.md`](docs/PHASES/phase-00.md). Phases 01–03 are **in progress**: the GitHub-to-Neon sync path, run/step records, incident/audit capture, protected incident APIs, deterministic proposal validation, and Recovery Studio sync control are implemented. Neon tables exist, but no live GitHub sync, controlled failure, or model proposal has been verified; migration 0003 and GitHub access are still pending.

## Run locally

Requirements: Node.js 20.9 or newer and npm 11.19.0 (or compatible npm 11).

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The starter environment file contains variable names with blank values. Add real values only to `.env.local` or the deployment provider’s server-side environment settings; never commit credentials. Phase 01 uses `DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPOSITORY`, and a strong `FLOWMEDIC_RUN_TOKEN`. Phase 03 also requires `LLM_API_KEY` and `LLM_MODEL`; `LLM_API_URL` is optional and defaults to the OpenAI Responses API endpoint. The health endpoint is available at `/api/health` and returns liveness, coarse configuration flags, a correlation ID, and a timestamp without returning secret values.

## Useful commands

```text
npm run dev        Start the local development server
npm run lint       Run ESLint
npm run typecheck  Check TypeScript types
npm run build      Create a production build
npm start          Run the production build locally
```

## Project map

```text
src/app/                 Next.js App Router pages and Route Handlers
src/app/api/health/       Safe liveness/configuration endpoint
src/app/api/runs/         Protected manual sync endpoint
src/app/api/incidents/    Protected incident and proposal endpoints
src/components/           Recovery Studio sync control
src/lib/                  Server-only GitHub and Neon integration
db/migrations/            Forward-only SQL migrations for source sync and incident capture
db/demo/                  Explicit demo-only schema-drift procedure
docs/                     Architecture, phase plan, decisions, and evidence log
```

## Project documents

- [Architecture](docs/ARCHITECTURE.md)
- [Six-hour development plan](docs/DEVELOPMENT_PLAN.md)
- [Model routing and token plan](docs/MODEL_ROUTING_PLAN.md)
- [Light Recovery Studio UI plan](docs/UI_DESIGN.md)
- [Phase log](docs/PHASE_LOG.md)
- [Phase 00 implementation record](docs/PHASES/phase-00.md)
- [Phase 01 implementation record](docs/PHASES/phase-01.md)
- [Phase 02 implementation record](docs/PHASES/phase-02.md)
- [Phase 03 implementation record](docs/PHASES/phase-03.md)
- [Demo GitHub repository handoff kit](demo-repo-kit/README.md)
- [Demo repository setup steps](demo-repo-kit/setup-steps/README.md)
- [Changelog](CHANGELOG.md)

At the end of every phase, update its phase record, `docs/PHASE_LOG.md`, and `CHANGELOG.md` before beginning the next phase. Record only checks actually run and results actually observed.
