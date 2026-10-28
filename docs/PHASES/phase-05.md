# Phase 05 — Live light Recovery Studio

**Status: IN PROGRESS — implementation delivered; browser/live acceptance pending.**

## Checklist
- [x] Responsive LIGHT shell, React Flow topology with pan/zoom, history and inspector.
- [x] Protected recent-run API, persisted step statuses, completed duration and factual execution rail.
- [x] Incident evidence, mapping diff, validation checks, approval confirmation, rejection, separate replay and audit timeline.
- [x] Memory-only operator session; disconnect clears private data.
- [x] Poll active work every two seconds, back off on errors, stop after three failures or 60 active polls, stop on terminal/idle state.
- [x] Empty/loading/error/stale states, manual refresh, keyboard controls and reduced-motion styling.
- [ ] Browser/mobile and live recovery acceptance.

## Entrance / exit criteria
Backend migrations and provider settings must be ready. Exit requires normal sync, controlled failure, proposal, approval/rejection and verified replay visible in browser using actual saved state.

## Decisions / deviations
The user-selected light theme supersedes the original dark-shell checklist. Existing bounded sync still processes fetch and upsert in one request with durable checkpoints; diagnosis and approve/reject/replay each use separate requests. Splitting fetch/upsert into separate requests is deferred to preserve the working sync contract. Normalize completes with the fetch/normalization checkpoint; it is not a separately measured step. No fake timer progress is used. Fast stages may finish between polls.

An approved incident retains awaiting_approval until replay; the UI displays Approved / replay ready. Failed original write nodes stay failed after recovery. No unsupported cancellation controls are presented. Historical stuck runs remain visible, with bounded polling.

## Verification / handoff

Sidebar correction: a follow-up source check found that the prior text replacement had left the rendered navigation as anchors. Replaced the exact elements with real view buttons. History selection opens its run on the canvas; inspector view lists captured incidents. Successful sync now shows 3/3 sync complete and recovery not needed, with recovery topology available via an explicit toggle. Default healthy canvas fits the three active nodes. Presenter enters the private operator token once before the demo; audience viewers need no token when watching. Interactive visitor access still needs session/authentication work in Phase 06. TypeScript passed; browser acceptance remains pending.
TypeScript and focused ESLint checks passed. Production build was attempted but could not create `.next/types/app/api` (`EPERM`), consistent with another process holding the development build directory; the running server was left undisturbed. User screenshot showed a failed fetch step and blank inspector. Server logs reported SQLSTATE `42703` at `fetch_issues`; the new source snapshot write depends on migration 0004, so that is the likely missing migration. The intended incident is captured after sync reaches the upsert step. The UI now surfaces safe failed-step details and migration guidance and lays out recovery as a separate lane. No browser retest or live replay was performed. See `docs/TEAMMATE_HANDOFF.md`; record actual results before marking complete and update PHASE_LOG and CHANGELOG.

- UI/setup follow-up: sidebar now switches canvas/history/inspector views, React Flow controls have explicit icon colors, and node handles have correct connection directions. Sync preflight checks source_snapshot before starting a run and reports missing migration 0004 explicitly. TypeScript passed; browser retest and live migration remain pending.
