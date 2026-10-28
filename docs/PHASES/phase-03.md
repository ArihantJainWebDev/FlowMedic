# Phase 03 — AI proposal and deterministic validation

**Planned time:** 50 minutes · **Status:** IN PROGRESS

## Objective

Generate a schema-constrained repair proposal from minimal incident evidence, then validate it with code-owned allowlists and non-mutating checks.

## Checklist

- [x] Define versioned strict JSON schema for diagnosis and source/target field mappings.
- [x] Implement a server-only LLM Responses client with a 15-second timeout, 400-token output cap, no automatic retries, and provider/model metadata.
- [x] Bound prompt evidence to code-owned incident fields and destination column metadata; issue bodies and raw DB error text are excluded.
- [x] Treat prompt evidence as untrusted and instruct the model to ignore embedded instructions and never produce SQL/code.
- [x] Implement deterministic allowlist/type/required-field/duplicate-target validation.
- [x] Reject unknown source-target pairs, unsafe identifiers, incompatible/missing targets, and uncovered required columns.
- [x] Implement read-only schema and required-column dry-run validation.
- [x] Persist proposal JSON, prompt/schema versions, validation result, hash, latency, usage, and audit event.
- [ ] Demonstrate `issue_title → title` accepted and an unsafe mapping rejected against a live incident after migration 0003 is applied.

## Entrance criteria

- Phase 02 code and Neon tables are in place. Configure `LLM_API_KEY` and `LLM_MODEL` for an HTTPS Responses-compatible endpoint; live incident evidence is still awaiting the source sync and controlled schema failure.

## Exit criteria

- Valid structured proposal shown with validation result and evidence.
- Known case is accepted; adversarial/unknown target is rejected deterministically.
- No proposal can write or mutate schema in this phase.

## Completion record

- Status: IN PROGRESS
- Actual start/end/duration: Started 2026-10-28; elapsed time not recorded.
- Implemented: Migration `db/migrations/0003_repair_proposals.sql`; strict proposal contract and deterministic validator in `src/lib/repair-validation.ts`; bounded server-side LLM client in `src/lib/llm.ts`; authenticated `POST /api/incidents/:incidentId/diagnose`; proposal persistence and incident details include proposal history.
- Deviations and decisions: Uses the OpenAI Responses API by default, with `LLM_API_URL` configurable for an operator-selected HTTPS endpoint compatible with the Responses structured-output contract. Requires explicit `LLM_MODEL`; it does not guess a model. No issue body is sent to the model. The database schema inspection and validation are read-only.
- Verification: No tests or live model/database calls were run in this pass, per the user's preference to keep checks lightweight. Migration 0003 is not applied; no live incident exists yet.
- Evidence: Source files/migration above. OpenAI Structured Outputs accepts strict JSON Schema via the Responses `text.format` field; see [official OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
- Blockers / owner / next action: Owner: project operator. Apply migration 0003 after 0001/0002, complete a normal sync, reproduce the controlled drift, then call the protected diagnosis endpoint and inspect the saved proposal and validation result.
- Known gaps carried forward: The live accepted/rejected proposal cases remain unverified; no repair action, approval, or replay is implemented here. LLM provider calls cost money and are only triggered by the authenticated diagnosis endpoint.
