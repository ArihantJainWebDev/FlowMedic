# Phase 04–05 teammate handoff

## Setup
1. Install dependencies with npm install; React Flow is now included.
2. Keep credentials in .env.local. Rotate values previously exposed in screenshots. Diagnosis needs LLM_API_KEY and an explicit LLM_MODEL; optional LLM_API_URL must support the Responses structured-output contract.
3. Apply unapplied migrations 0001–0004 in order in the disposable Neon demo database. **0004 is required before further syncs** because runs now save source snapshots. If runtime role differs from migration owner, grant EXECUTE on flowmedic_repair_action(uuid,text,uuid,text,integer,text,text) and required table privileges to that runtime role. PUBLIC execute is revoked.
4. Start npm run dev. Connect the workspace using FLOWMEDIC_RUN_TOKEN. Credentials remain in browser memory until disconnect/reload.

## Focused acceptance
- Run normal sync twice; expect 6 fetched/upserted/stored each time.
- Follow db/demo/README.md for the controlled rename in the isolated demo database, then run a fresh sync. This fresh run supplies the snapshot needed for replay.
- Select the failed run; inspect fetch success, write failure, incident and SQLSTATE 42703.
- Generate a proposal; inspect issue_title → title and passing validation.
- Replay before approval must fail. Review, check confirmation and approve. Replay separately; expect recovered, verified count 6 and timeline events.
- Resend approval/replay with the old version: expect rejection and no extra destination rows. Two simultaneous actions must produce at most one accepted action.
- Reject another fresh proposal and confirm replay is blocked.
- Check mobile layout, keyboard access, stale/error and unauthorized states. Disconnect must clear token and private displayed data.

## Remaining work
Phases 02/03 need live controlled-failure/model evidence. Phases 04/05 are implemented but remain IN PROGRESS until acceptance. No Vercel deployment or live migration was performed. Original failed runs stay historical. Normal sync still uses issue_title; the approved mapping applies to replay only. Restoring the demo schema is an explicit operator rehearsal task. Terminal failed replay cannot silently retry.

Phase 06 covers deployment, runtime limits and database permissions. Phase 07 covers rehearsal/contingency. After every phase update its record, PHASE_LOG and CHANGELOG with evidence. Suggested commits: feat(recovery): add approved replay; feat(studio): add live canvas; docs: record acceptance evidence.
