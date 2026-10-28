# Phase 01 — Real source-to-destination integration

**Planned time:** 55 minutes · **Status:** COMPLETE

## Objective

Connect a least-privilege GitHub token and managed Postgres; fetch a bounded page of real issues, normalize them, and upsert them with stable keys.

## Checklist

- [x] Provision the dedicated demo repository/database and configure local secrets. GitHub read access and Neon writes are verified; Vercel deployment settings remain Phase 06 work.
- [x] Add versioned migration for `github_issues` and run/step tables; `issue_title` is the intentionally driftable target field. User screenshot confirms the expected tables exist in Neon; the full column definitions have not been inspected.
- [x] Implement server-only GitHub REST client with an 8-second request timeout, maximum two pages of 50 items, and safe authorization/rate-limit errors.
- [x] Exclude pull requests; normalize stable issue fields and cap issue body length at 4,000 characters.
- [x] Implement parameterized Neon Postgres upsert with unique source/repository/external ID.
- [x] Add token-protected manual `POST /api/runs`, durable run/step checkpoints, idempotency key handling, and post-write count verification.
- [x] Add Recovery Studio control for configured service flags, manual sync, safe request status, and actual sync counts after completion.

## Entrance criteria

- Phase 00 complete; Neon is available and its expected tables are present. The public demo repository and GitHub token are configured; live normal and repeat syncs succeeded.

## Local setup for the live sync

1. The demo repository is now identified as [t4zn/flowmedic-demo-source](https://github.com/t4zn/flowmedic-demo-source). Confirm it contains the six synthetic issues from the [handoff kit](../../demo-repo-kit/README.md), then create a fine-grained token scoped to this repository with **Issues: read** permission.
2. Create a Neon Postgres project/database. Apply `db/migrations/0001_phase_01_source_sync.sql` to the intended demo branch using the Neon SQL Editor.
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_OWNER=t4zn`, `GITHUB_REPOSITORY=flowmedic-demo-source`, and a long random `FLOWMEDIC_RUN_TOKEN`. Keep every value server-side and never paste secrets into chat or commit them. The public repository URL is safe to record; the GitHub token is still required by the current application code.
4. Start the app locally. In Recovery Studio, choose **Run workflow**, enter the operator token into the masked field, and start the sync. The field is cleared when the request finishes.
5. Confirm the returned run ID/counts and verify the rows in Neon. Repeat with a new run and confirm the unique repository/issue key keeps row count stable.

The current token field is a prototype operator gate, not multi-user authentication. It sends the token only in the authorization header over the same-origin request and does not persist it in browser storage. Replace it with a proper authenticated session before broad or public use.

## Exit criteria

- Manual sync fetches actual issues and verifies rows in Neon.
- Repeating same sync updates existing records rather than duplicating.
- Errors are surfaced safely and run state persists.

## Completion record

- Status: COMPLETE
- Actual start/end/duration: Started and completed 2026-10-28; elapsed time not recorded.
- Implemented: Bounded GitHub issue fetch, parameterized Neon upsert, protected manual sync, durable run/step/audit records, configuration feedback, and migration 0001 (plus migration 0002 for current audit fields).
- Verification: Two user-provided screenshots show distinct successful runs for `t4zn/flowmedic-demo-source`, each with 6 fetched, 6 upserted, and 6 stored. The second run confirms the destination count remains stable without duplicate issues. A read-only GitHub request returned HTTP 200. A read-only Neon probe reproduced audit SQLSTATE `42P18`; explicit text casts corrected it and the corrected expression passed before the successful live syncs.
- Evidence: Two successful manual-sync screenshots supplied in this conversation; source in `src/lib/github.ts`, `src/lib/database.ts`, and `src/app/api/runs/route.ts`. No broad automated test suite was run, per the user's preference.
- Decisions: Shared `FLOWMEDIC_RUN_TOKEN` gates prototype operator actions; maximum 100 source items per run. Caller run-key idempotency and unique destination issue keys are separate protections. Dashboard configuration flags indicate settings are present; successful sync counts provide actual integration evidence.
- Blockers / next action: No remaining Phase 01 blocker. Continue Phase 02 by using the controlled schema-drift runbook in `db/demo/README.md` against the disposable demo database.
- Known gaps carried forward: Full operator sessions, deployed configuration, run-history UI, and live canvas progress are later-phase work. Same-run-key reuse and concurrency were not independently exercised. Earlier failed runs may retain running steps from before the audit fix; this completion does not claim they were repaired.
