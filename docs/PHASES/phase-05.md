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
TypeScript passed. No browser walkthrough or live replay was performed. See `docs/TEAMMATE_HANDOFF.md`; record actual results before marking complete and update PHASE_LOG and CHANGELOG.
