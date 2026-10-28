# Phase 01 — Real source-to-destination integration

**Planned time:** 55 minutes · **Status:** IN PROGRESS

## Objective

Connect a least-privilege GitHub token and managed Postgres; fetch a bounded page of real issues, normalize them, and upsert them with stable keys.

## Checklist

- [ ] Provision a dedicated demo repository/database and configure local/Vercel secrets. Use a GitHub fine-grained token with Issues: read permission for only the demo repository.
- [x] Add versioned migration for `github_issues` and run/step tables; `issue_title` is the intentionally driftable target field. User screenshot confirms the expected tables exist in Neon; the full column definitions have not been inspected.
- [x] Implement server-only GitHub REST client with an 8-second request timeout, maximum two pages of 50 items, and safe authorization/rate-limit errors.
- [x] Exclude pull requests; normalize stable issue fields and cap issue body length at 4,000 characters.
- [x] Implement parameterized Neon Postgres upsert with unique source/repository/external ID.
- [x] Add token-protected manual `POST /api/runs`, durable run/step checkpoints, idempotency key handling, and post-write count verification.
- [x] Add Recovery Studio control for configured service flags, manual sync, safe request status, and actual sync counts after completion.

## Entrance criteria

- Phase 00 complete; Neon is available and its expected tables are present. The dedicated demo GitHub repository and read-only GitHub token are still needed for live sync verification.

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

- Status: IN PROGRESS
- Actual start/end/duration: Started 2026-10-28; elapsed time not recorded.
- Implemented: Server-only GitHub client in `src/lib/github.ts`; Neon persistence in `src/lib/database.ts`; protected manual sync endpoint in `src/app/api/runs/route.ts`; Phase 01 schema in `db/migrations/0001_phase_01_source_sync.sql`; phase setup notes in `db/migrations/README.md`.
- Deviations and decisions: Manual endpoint uses a dedicated `FLOWMEDIC_RUN_TOKEN` bearer secret until full operator-session authentication is implemented. Each run is bounded to at most 100 GitHub issues; idempotency applies to the caller-provided run key, while issue upserts are independently unique.
- Verification: Not run in this implementation pass, per the user's request to keep checks lightweight. No GitHub or Neon credentials were supplied, so no external sync or deployed row verification is claimed.
- Evidence: Code and migration listed above. GitHub fine-grained tokens need Issues: read permission to list repository issues: https://docs.github.com/en/rest/issues/issues. Next.js Route Handlers support the `POST` endpoint pattern: https://nextjs.org/docs/app/getting-started/route-handlers.
- Blockers / owner / next action: Owner: project operator. Add the GitHub read token after the demo repository is created; then perform a manual sync and confirm repeat sync does not duplicate rows.
- Known gaps carried forward: Neon connectivity is confirmed and the user’s Neon SQL Editor screenshot shows all five expected tables. GitHub token and live sync verification remain pending; authentication is a shared operator bearer token rather than a user session. UI reports environment configuration, not verified GitHub sync connectivity.
