import "server-only";

import { neon } from "@neondatabase/serverless";
import type { NormalizedIssue } from "@/lib/github";
import type { RepairProposal, RepairValidation, TargetColumn } from "@/lib/repair-validation";

function getSql() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Database is not configured.");
  return neon(connectionString);
}

export async function createRun(idempotencyKey: string, repository: string, correlationId: string) {
  const sql = getSql();
  const created = await sql`
    WITH inserted AS (
      INSERT INTO workflow_runs (idempotency_key, trigger, repository, status, correlation_id)
      VALUES (${idempotencyKey}, 'manual', ${repository}, 'running', ${correlationId})
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, status, correlation_id
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, run_id, correlation_id, action, actor_type, details)
      SELECT 'run', id, id, correlation_id, 'run_created', 'system', jsonb_build_object('trigger', 'manual')
      FROM inserted
      RETURNING id
    )
    SELECT id, status FROM inserted
  `;

  if (created.length > 0) {
    return { id: created[0].id as string, status: "running" as const, created: true };
  }

  const existing = await sql`
    SELECT id, status FROM workflow_runs WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `;
  if (!existing[0]) throw new Error("Could not read the idempotent run record.");
  return {
    id: existing[0].id as string,
    status: existing[0].status as string,
    created: false,
  };
}

export async function startStep(
  runId: string,
  sequence: number,
  stepKey: string,
  correlationId: string,
) {
  const sql = getSql();
  await sql`
    WITH changed AS (
      INSERT INTO workflow_steps (run_id, sequence, step_key, status, started_at, correlation_id)
      VALUES (${runId}, ${sequence}, ${stepKey}, 'running', now(), ${correlationId})
      ON CONFLICT (run_id, step_key) DO UPDATE
        SET status = 'running', started_at = now(), finished_at = NULL, safe_output = NULL,
            error_code = NULL, error_class = NULL, duration_ms = NULL, correlation_id = EXCLUDED.correlation_id
      RETURNING id, run_id, step_key, correlation_id
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, run_id, correlation_id, action, actor_type, details)
      SELECT 'step', id, run_id, correlation_id, 'step_started', 'system', jsonb_build_object('stepKey', step_key)
      FROM changed
      RETURNING id
    )
    SELECT id FROM changed
  `;
}

export async function finishStep(
  runId: string,
  stepKey: string,
  status: "succeeded" | "failed",
  safeOutput: Record<string, unknown>,
  correlationId: string,
  errorCode?: string,
  errorClass?: string,
) {
  const sql = getSql();
  await sql`
    WITH changed AS (
      UPDATE workflow_steps
      SET status = ${status}, finished_at = now(),
          duration_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::integer),
          safe_output = ${JSON.stringify(safeOutput)}::jsonb,
          error_code = ${errorCode ?? null}, error_class = ${errorClass ?? null}
      WHERE run_id = ${runId} AND step_key = ${stepKey}
      RETURNING id, run_id, step_key, correlation_id
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, run_id, correlation_id, action, actor_type, details)
      SELECT 'step', id, run_id, ${correlationId}, ${`step_${status}`}, 'system',
        jsonb_build_object('stepKey', step_key, 'errorCode', ${errorCode ?? null}::text, 'errorClass', ${errorClass ?? null}::text)
      FROM changed
      RETURNING id
    )
    SELECT id FROM changed
  `;
}

export async function finishRun(
  runId: string,
  status: "succeeded" | "failed",
  summary: string,
  correlationId: string,
) {
  const sql = getSql();
  await sql`
    WITH changed AS (
      UPDATE workflow_runs
      SET status = ${status}, finished_at = now(), summary = ${summary}
      WHERE id = ${runId}
      RETURNING id, correlation_id
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, run_id, correlation_id, action, actor_type, details)
      SELECT 'run', id, id, ${correlationId}, ${`run_${status}`}, 'system', jsonb_build_object('summary', ${summary}::text)
      FROM changed
      RETURNING id
    )
    SELECT id FROM changed
  `;
}

export async function upsertIssues(repository: string, issues: NormalizedIssue[]) {
  if (issues.length === 0) return 0;

  const sql = getSql();
  const records = issues.map((issue) => ({
    external_id: issue.externalId,
    issue_number: issue.number,
    issue_title: issue.title,
    body: issue.body,
    state: issue.state,
    html_url: issue.htmlUrl,
    source_updated_at: issue.updatedAt,
  }));
  const result = await sql`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS issue(
        external_id text, issue_number integer, issue_title text, body text, state text,
        html_url text, source_updated_at timestamptz
      )
    ), written AS (
      INSERT INTO github_issues (
        source, repository, external_id, issue_number, issue_title, body, state, html_url,
        source_updated_at, synced_at
      )
      SELECT 'github', ${repository}, external_id, issue_number, issue_title, body, state,
        html_url, source_updated_at, now() FROM incoming
      ON CONFLICT (source, repository, external_id) DO UPDATE SET
        issue_number = EXCLUDED.issue_number,
        issue_title = EXCLUDED.issue_title,
        body = EXCLUDED.body,
        state = EXCLUDED.state,
        html_url = EXCLUDED.html_url,
        source_updated_at = EXCLUDED.source_updated_at,
        synced_at = now()
      RETURNING 1
    ) SELECT count(*)::integer AS written_count FROM written
  `;
  return Number(result[0]?.written_count ?? 0);
}

export async function getIssueCount(repository: string) {
  const sql = getSql();
  const result = await sql`
    SELECT count(*)::integer AS issue_count FROM github_issues
    WHERE source = 'github' AND repository = ${repository}
  `;
  return Number(result[0]?.issue_count ?? 0);
}

export async function captureSchemaDriftIncident(input: {
  runId: string;
  stepKey: string;
  repository: string;
  correlationId: string;
  fingerprint: string;
  safeSummary: string;
  evidence: Record<string, unknown>;
}) {
  const sql = getSql();
  const result = await sql`
    WITH incident_step AS (
      SELECT id FROM workflow_steps WHERE run_id = ${input.runId} AND step_key = ${input.stepKey} LIMIT 1
    ), changed AS (
      INSERT INTO incidents (
        run_id, step_id, repository, operation, correlation_id, status, error_code, error_class,
        fingerprint, safe_summary, evidence
      )
      SELECT ${input.runId}, id, ${input.repository}, 'github_issue_upsert', ${input.correlationId}, 'detected',
        '42703', 'schema_drift', ${input.fingerprint}, ${input.safeSummary},
        ${JSON.stringify(input.evidence)}::jsonb
      FROM incident_step
      ON CONFLICT (run_id, step_id, fingerprint) DO UPDATE
        SET occurrence_count = incidents.occurrence_count + 1,
            last_seen_at = now(), updated_at = now()
      RETURNING id, run_id, correlation_id, version, occurrence_count, (xmax = 0) AS is_new
    ), linked AS (
      UPDATE workflow_steps s
      SET error_class = 'schema_drift', error_code = '42703',
          safe_output = ${JSON.stringify(input.evidence)}::jsonb
      FROM changed c
      WHERE s.run_id = c.run_id AND s.step_key = ${input.stepKey}
      RETURNING s.id
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, run_id, correlation_id, action, actor_type, details)
      SELECT 'incident', id, run_id, ${input.correlationId},
        CASE WHEN is_new THEN 'incident_detected' ELSE 'incident_repeated' END,
        'system', jsonb_build_object('errorCode', '42703', 'fingerprint', ${input.fingerprint}::text, 'occurrenceCount', occurrence_count)
      FROM changed
      RETURNING id
    )
    SELECT id, occurrence_count, is_new FROM changed
  `;
  if (!result[0]) throw new Error("Could not persist the schema drift incident.");
  return {
    id: result[0].id as string,
    occurrenceCount: Number(result[0].occurrence_count),
    isNew: Boolean(result[0].is_new),
  };
}

export type IncidentStatus =
  | "detected"
  | "diagnosing"
  | "proposal_ready"
  | "validating"
  | "awaiting_approval"
  | "replaying"
  | "recovered"
  | "rejected"
  | "validation_failed"
  | "replay_failed"
  | "cancelled";

const allowedTransitions: Record<IncidentStatus, IncidentStatus[]> = {
  detected: ["diagnosing", "cancelled"],
  diagnosing: ["detected", "proposal_ready", "validation_failed", "cancelled"],
  proposal_ready: ["validating", "cancelled"],
  validating: ["awaiting_approval", "validation_failed", "cancelled"],
  awaiting_approval: ["replaying", "rejected", "cancelled"],
  replaying: ["recovered", "replay_failed"],
  recovered: [],
  rejected: [],
  validation_failed: [],
  replay_failed: ["replaying", "cancelled"],
  cancelled: [],
};

export async function transitionIncident(input: {
  incidentId: string;
  expectedStatus: IncidentStatus;
  expectedVersion: number;
  nextStatus: IncidentStatus;
  correlationId: string;
  actorType?: "system" | "operator";
}) {
  if (!allowedTransitions[input.expectedStatus].includes(input.nextStatus)) {
    throw new Error(`Illegal incident transition: ${input.expectedStatus} → ${input.nextStatus}.`);
  }

  const sql = getSql();
  const result = await sql`
    WITH changed AS (
      UPDATE incidents SET status = ${input.nextStatus}, version = version + 1, updated_at = now()
      WHERE id = ${input.incidentId} AND status = ${input.expectedStatus} AND version = ${input.expectedVersion}
      RETURNING id, run_id, status, version
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, run_id, correlation_id, action, actor_type, details)
      SELECT 'incident', id, run_id, ${input.correlationId}, 'incident_transition',
        ${input.actorType ?? "system"},
        jsonb_build_object('from', ${input.expectedStatus}::text, 'to', status, 'version', version)
      FROM changed
      RETURNING id
    )
    SELECT id, status, version FROM changed
  `;
  return result[0]
    ? { updated: true, id: result[0].id as string, status: result[0].status as IncidentStatus, version: Number(result[0].version) }
    : { updated: false as const };
}

export async function listIncidents(repository: string, limit: number) {
  const sql = getSql();
  return sql`
    SELECT id, run_id, repository, operation, status, error_code, error_class, fingerprint,
      safe_summary, occurrence_count, version, first_seen_at, last_seen_at
    FROM incidents WHERE repository = ${repository}
    ORDER BY last_seen_at DESC LIMIT ${limit}
  `;
}

export async function getIncident(incidentId: string, repository: string) {
  const sql = getSql();
  const incidents = await sql`
    SELECT id, run_id, step_id, repository, operation, status, error_code, error_class,
      fingerprint, safe_summary, evidence, occurrence_count, version, first_seen_at, last_seen_at
    FROM incidents WHERE id = ${incidentId} AND repository = ${repository} LIMIT 1
  `;
  if (!incidents[0]) return null;
  const timeline = await sql`
    SELECT id, correlation_id, action, actor_type, details, created_at
    FROM audit_events WHERE entity_type = 'incident' AND entity_id = ${incidentId}
    ORDER BY created_at ASC
  `;
  const proposals = await sql`
    SELECT id, incident_version, provider, model, prompt_version, schema_version,
      proposal, validation, status, proposal_hash, latency_ms, input_tokens, output_tokens, created_at
    FROM repair_proposals WHERE incident_id = ${incidentId}
    ORDER BY created_at DESC LIMIT 5
  `;
  return { ...incidents[0], timeline, proposals };
}

export async function getTargetColumns(): Promise<TargetColumn[]> {
  const sql = getSql();
  const result = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'github_issues'
    ORDER BY ordinal_position
  `;
  return result.map((column) => ({
    columnName: String(column.column_name),
    dataType: String(column.data_type),
    nullable: column.is_nullable === "YES",
    hasDefault: column.column_default !== null,
  }));
}

export async function saveRepairProposal(input: {
  incidentId: string;
  incidentVersion: number;
  correlationId: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  proposal: RepairProposal;
  validation: RepairValidation;
  status: "validated" | "validation_failed";
  proposalHash: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}) {
  const sql = getSql();
  const result = await sql`
    WITH inserted AS (
      INSERT INTO repair_proposals (
        incident_id, incident_version, provider, model, prompt_version, schema_version,
        proposal, validation, status, proposal_hash, latency_ms, input_tokens, output_tokens
      ) VALUES (
        ${input.incidentId}, ${input.incidentVersion}, ${input.provider}, ${input.model},
        ${input.promptVersion}, ${input.schemaVersion}, ${JSON.stringify(input.proposal)}::jsonb,
        ${JSON.stringify(input.validation)}::jsonb, ${input.status}, ${input.proposalHash},
        ${input.latencyMs}, ${input.inputTokens}, ${input.outputTokens}
      )
      RETURNING id, incident_id, status
    ), audited AS (
      INSERT INTO audit_events (entity_type, entity_id, correlation_id, action, actor_type, details)
      SELECT 'incident', incident_id, ${input.correlationId}, 'repair_proposal_created', 'system',
        jsonb_build_object('proposalId', id, 'validationStatus', status, 'schemaVersion', ${input.schemaVersion}::text)
      FROM inserted
      RETURNING id
    )
    SELECT id FROM inserted
  `;
  if (!result[0]) throw new Error("Could not persist the repair proposal.");
  return result[0].id as string;
}
