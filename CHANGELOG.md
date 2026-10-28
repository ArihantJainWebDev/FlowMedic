# Changelog

All notable implementation and documentation changes are recorded here. Keep entries factual and tied to phase/evidence. Dates use ISO format.

## Unreleased

- Created the initial implementation-ready architecture, model-routing guidance, phased plan, and UI design documentation.
- Recorded the public demo source repository `t4zn/flowmedic-demo-source` in the Phase 01 setup guide. No credentials were added to the repository or docs.

### 2026-10-28 — Phase 03: Proposal and validation foundation started

- **Added:** Strict structured proposal contract, bounded server-only Responses API client, deterministic `issue_title → title` allowlist/type/required-column checks, proposal persistence migration, and protected incident diagnosis endpoint.
- **Changed:** Incident detail now returns stored proposal history; health reports whether LLM key/model configuration is present without returning values.
- **Verified:** No tests or live model/database calls were run in this implementation pass. Migration 0003 and a real schema-drift incident are still pending.
- **Known issues:** Provider call behavior and accepted/rejected examples remain unverified. No automated repair, approval, or replay is possible in this phase.
- **Phase record:** [Phase 03](docs/PHASES/phase-03.md).

### 2026-10-28 — Neon connectivity probe

- **Verified:** A read-only `SELECT 1` reached Neon, but database authentication was rejected. The connection string and raw error details were kept private.
- **Next action:** Check that `DATABASE_URL` came from the correct Neon project, branch, database, and role, then retry the same read-only query.

### 2026-10-28 — Neon connectivity confirmed

- **Verified:** After the user updated `DATABASE_URL`, the read-only `SELECT 1` probe succeeded. No database writes or schema changes were made.
- **Next action:** Verify the source sync after the GitHub token and demo repository are ready.

### 2026-10-28 — Demo database schema confirmed

- **Verified:** User-provided Neon SQL Editor screenshot shows all five expected tables: `audit_events`, `github_issues`, `incidents`, `workflow_runs`, and `workflow_steps`.
- **Known gaps:** The screenshot confirms table presence, not column definitions, sync behavior, or incident capture. GitHub token and live sync remain pending.

### 2026-10-28 — Phase 02: Incident capture foundation started

- **Added:** Correlation and duration fields, incident/audit schema, schema-drift evidence capture for PostgreSQL `42703`, version-checked incident transition helper, protected incident list/detail APIs, and an isolated demo-only column-rename script.
- **Changed:** Manual run handling now records run/step audit checkpoints and marks the affected step/run failed when the controlled drift is detected.
- **Verified:** No tests or live database checks were run in this pass, per the user's request. The migration and expected failure remain to be exercised in the disposable Neon environment.
- **Known issues:** Phase 02 remains in progress until migrations 0001/0002 are applied and the real SQL error/incident path is confirmed.
- **Phase record:** [Phase 02](docs/PHASES/phase-02.md).

### 2026-10-28 — Phase 01: Source-to-destination path started

- **Added:** Bounded GitHub Issues fetch/normalization, Neon serverless database access, idempotent issue upserts, run/step persistence, a token-protected `POST /api/runs` endpoint, and a Recovery Studio control that displays configuration and returned sync counts. Added migration `0001_phase_01_source_sync.sql` and `FLOWMEDIC_RUN_TOKEN` to `.env.example`.
- **Changed:** Health readiness now reports Phase 01 service-configuration flags and no longer waits for the later LLM integration.
- **Verified:** No checks or live service sync were run in this implementation pass, per the user's request to avoid extra testing. The GitHub issue endpoint's fine-grained token permission is documented as Issues: read: [GitHub REST issue docs](https://docs.github.com/en/rest/issues/issues).
- **Known issues:** Neon migration and GitHub/Neon credentials are not configured; the UI shows configured environment variables, not verified connectivity. Phase 01 remains in progress.
- **Phase record:** [Phase 01](docs/PHASES/phase-01.md).

### 2026-10-28 — Phase 00: Foundation completed

- **Added:** Next.js App Router foundation, light Recovery Studio shell, loading/error UI states, safe health Route Handler, environment example, and database migration conventions.
- **Changed:** UI plan now records the implemented light shell while keeping the graph, persisted live progress, and full inspector as planned work.
- **Verified:** Formatting, lint, TypeScript, and Webpack production build passed in the implementation session. The user confirmed that the local app and health endpoint check work.
- **Known issues:** GitHub, Postgres, LLM, authentication, and live run orchestration are not implemented; these belong to subsequent phases.
- **Phase record:** [Phase 00](docs/PHASES/phase-00.md).

## Entry format

Use `### YYYY-MM-DD — Phase NN: short title`, then `Added`, `Changed`, `Fixed`, `Verified`, and `Known issues` bullets as applicable. Link the matching phase record. Do not describe planned work as shipped.
