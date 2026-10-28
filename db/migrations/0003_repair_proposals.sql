-- FlowMedic Phase 03: persist structured AI proposals and deterministic validation results.
-- Apply after migrations 0001 and 0002 on the disposable demo database.

CREATE TABLE IF NOT EXISTS repair_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  incident_version integer NOT NULL CHECK (incident_version > 0),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  proposal jsonb NOT NULL,
  validation jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('validated', 'validation_failed')),
  proposal_hash text NOT NULL,
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, incident_version)
);

CREATE INDEX IF NOT EXISTS repair_proposals_incident_created_idx
  ON repair_proposals (incident_id, created_at DESC);
