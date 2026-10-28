# Architecture Decision Records

Accepted decisions for the initial blueprint. Revisit by adding a dated decision; do not silently rewrite history.

## D-001 — One Vercel-deployable full-stack app

**Status:** Accepted · **Date:** 2026-10-28  
Use Next.js App Router and TypeScript for UI and server Route Handlers in one Vercel project. This fits the six-hour hackathon and the user's single-service constraint. Managed Postgres, GitHub, and LLM remain external providers. Trade-off: serverless work must be bounded and durable state must be in Postgres.

## D-002 — Real GitHub source and Neon/Postgres destination

**Status:** Accepted · **Date:** 2026-10-28  
Read real GitHub issues and persist them in managed Postgres provisioned through the Vercel integration. Postgres is also the run, incident, approval, audit, and repair-memory store. The database is managed by Neon, not physically hosted by Vercel.

## D-003 — Real controlled schema drift

**Status:** Accepted · **Date:** 2026-10-28  
Demonstrate one authentic undefined-column failure by renaming the demo target field after initial success. Restrict this to an isolated disposable schema/database and explicit operator action. Never have AI or normal runtime code execute DDL.

## D-004 — AI proposes; deterministic policy and human approve

**Status:** Accepted · **Date:** 2026-10-28  
LLM output is a structured, untrusted proposal. Code-owned allowlists and type checks decide whether it can be offered. A dry-run validation and authenticated human approval bound to the proposal hash/version are mandatory before replay. The model cannot emit executable SQL or apply a change.

## D-005 — Manual trigger is the MVP trigger

**Status:** Accepted · **Date:** 2026-10-28  
Manual authenticated sync is the dependable demo path. Signed GitHub webhook is an optional improvement. Polling is optional and plan-aware because Vercel Hobby cron only supports daily schedules with hourly timing precision; do not assume frequent polling is available.

## D-006 — Persistent state, idempotent retry, polling UI

**Status:** Accepted · **Date:** 2026-10-28  
Postgres is the source of truth for runs/incidents/approvals. Use unique keys, version checks, and bounded retries; use browser polling for status. This handles serverless instance turnover and avoids relying on WebSocket support or process-local memory.

## D-007 — Six-hour plan reserves deployment and rehearsal time

**Status:** Accepted · **Date:** 2026-10-28  
Follow the 8-phase timebox in `DEVELOPMENT_PLAN.md`; preserve 85 minutes for hardening, deployment, and rehearsal. Manual trigger and safe recovery take precedence over multi-tenant features or ornamental visuals.

## D-008 — Persisted short-step execution drives visible progress

**Status:** Accepted · **Date:** 2026-10-28  
Create a durable run, then advance one bounded step per authenticated Route Handler invocation. Persist the step's running and terminal states before the UI advances. The browser polls persisted run/events and requests the next step; server-side state and lease checks—not browser input—control ordering and eligibility. This exposes actual progress while fitting Vercel function limits and lets an interrupted tab resume. The demo may pause if the operator closes the browser; the UI must show resume state and never imply detached processing.

## D-009 — Structured diagnosis is proposal-only

**Status:** Accepted · **Date:** 2026-10-28  
Use a strict structured-output response contract and deterministic code-owned validation for Phase 03. Default to the OpenAI Responses endpoint, allow an operator-configured HTTPS compatible endpoint, and require an explicit `LLM_MODEL`. The model receives bounded incident/schema evidence without issue bodies, has no tools, and cannot execute SQL. Only `issue_title → title` is in the initial allowlist; actual schema metadata and required columns are checked before a proposal can be marked validated. A provider/API failure returns the incident to `detected` when the version-checked transition succeeds.
