# Phase 04 — Human approval and safe replay

**Status: IN PROGRESS — implementation delivered; live acceptance pending.**

## Checklist
- [x] Original issue snapshot, approval and replay records in migration 0004.
- [x] Authenticated action endpoint, origin check, strict proposal parsing, canonical hash and current-schema validation.
- [x] Approval binds actor, proposal ID/hash and incident version. Row locks serialize actions; stale approvals and repeated attempts are refused.
- [x] Fixed allowlisted SQL replays the original snapshot with unique destination keys, verifies imported fields and records terminal status/audit in one transaction.
- [x] Failure rolls back destination writes, records replay_failed and prevents further attempts for that incident.
- [ ] Live approval/rejection, stale/concurrent request, recovery and duplicate replay acceptance.

## Entrance / exit criteria
Apply migrations 0001–0004. Create a fresh controlled-drift incident with an original source snapshot and a validated Phase 03 proposal. Exit requires proving rejection and missing/stale approval block replay, approved replay verifies destination rows, and repeat/concurrent requests cannot duplicate replay.

## Decisions
Prototype identity is shared-operator via the existing bearer secret; individual sessions are deferred. Browser token is memory-only. Approval records have no update/delete application API. The invoker function has PUBLIC execute revoked; separate runtime roles need explicit grants. Phase 06 handles database role hardening.

Replay supports only issue_title → title, using fixed SQL without model-generated identifiers. Original failed runs remain historical after recovery. One attempt per incident; failures need investigation and a fresh incident. Snapshot bodies stay in the private database and are excluded from UI, audit and model prompts. Clear disposable data after the hackathon.

## Verification and handoff
TypeScript and focused ESLint checks passed. Production build was attempted but could not create `.next/types/app/api` (`EPERM`), consistent with another process holding the development build directory; the running server was left undisturbed. User logs show SQLSTATE `42703` during fetch, likely because migration 0004's source_snapshot column is not yet applied. No migration was applied or live approval/replay performed. Existing incidents without snapshots cannot replay. See `docs/TEAMMATE_HANDOFF.md`. Update this record, PHASE_LOG and CHANGELOG after acceptance.
