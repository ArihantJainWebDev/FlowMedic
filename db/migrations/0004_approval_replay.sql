-- Apply after 0003. Runtime uses invoker privileges; no security-definer functions.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS source_snapshot jsonb;
CREATE TABLE IF NOT EXISTS repair_approvals (
 incident_id uuid PRIMARY KEY REFERENCES incidents(id),
 proposal_id uuid NOT NULL REFERENCES repair_proposals(id),
 proposal_hash text NOT NULL, incident_version integer NOT NULL,
 actor text NOT NULL, decision text NOT NULL CHECK(decision IN ('approve','reject')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS replay_attempts (
 incident_id uuid PRIMARY KEY REFERENCES incidents(id),
 status text NOT NULL CHECK(status IN ('succeeded','failed')),
 verified_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION flowmedic_repair_action(
 target_id uuid, target_repo text, proposal_id_input uuid, hash_input text,
 version_input integer, action_input text, correlation_input text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE i incidents%ROWTYPE; p repair_proposals%ROWTYPE; a repair_approvals%ROWTYPE;
 payload jsonb; expected_count integer; actual_count integer; failure_code text;
BEGIN
 SELECT * INTO i FROM incidents WHERE id=target_id AND repository=target_repo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Incident unavailable' USING ERRCODE='P0001'; END IF;
 IF i.version<>version_input THEN RAISE EXCEPTION 'Stale incident' USING ERRCODE='P0001'; END IF;
 SELECT * INTO p FROM repair_proposals WHERE id=proposal_id_input AND incident_id=i.id FOR UPDATE;
 IF NOT FOUND OR p.proposal_hash<>hash_input OR p.status<>'validated' OR
 p.validation->>'passed'<>'true' OR jsonb_array_length(p.proposal->'mappings')<>1 OR
 p.proposal->'mappings'->0->>'sourceField'<>'issue_title' OR
 p.proposal->'mappings'->0->>'targetField'<>'title' THEN
 RAISE EXCEPTION 'Proposal unavailable' USING ERRCODE='P0001'; END IF;
 IF action_input IN ('approve','reject') THEN
  IF i.status<>'proposal_ready' OR p.incident_version<>i.version THEN
   RAISE EXCEPTION 'Proposal is stale' USING ERRCODE='P0001'; END IF;
  INSERT INTO repair_approvals VALUES(i.id,p.id,p.proposal_hash,i.version,'shared-operator',action_input,now());
  UPDATE incidents SET status=CASE WHEN action_input='approve' THEN 'awaiting_approval' ELSE 'rejected' END,
   version=version+1,updated_at=now() WHERE id=i.id;
  INSERT INTO audit_events(entity_type,entity_id,run_id,correlation_id,action,actor_type,details)
   VALUES('incident',i.id,i.run_id,correlation_input,action_input,'operator',jsonb_build_object('proposalId',p.id,'proposalHash',p.proposal_hash,'actor','shared-operator'));
  RETURN jsonb_build_object('status',CASE WHEN action_input='approve' THEN 'approved' ELSE 'rejected' END);
 END IF;
 IF action_input<>'replay' OR i.status<>'awaiting_approval' THEN RAISE EXCEPTION 'Replay not eligible' USING ERRCODE='P0001'; END IF;
 SELECT * INTO a FROM repair_approvals WHERE incident_id=i.id;
 IF NOT FOUND OR a.decision<>'approve' OR a.proposal_id<>p.id OR a.proposal_hash<>p.proposal_hash OR a.incident_version+1<>i.version THEN
 RAISE EXCEPTION 'Approval is stale' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM replay_attempts WHERE incident_id=i.id) THEN RAISE EXCEPTION 'Replay already attempted' USING ERRCODE='P0001'; END IF;
 SELECT source_snapshot INTO payload FROM workflow_runs WHERE id=i.run_id AND repository=target_repo;
 IF payload IS NULL OR jsonb_typeof(payload)<>'array' OR jsonb_array_length(payload)=0 OR jsonb_array_length(payload)>100 THEN
 RAISE EXCEPTION 'Original payload unavailable; create a fresh incident' USING ERRCODE='P0001'; END IF;
 INSERT INTO audit_events(entity_type,entity_id,run_id,correlation_id,action,actor_type,details)
 VALUES('incident',i.id,i.run_id,correlation_input,'replay_started','operator',jsonb_build_object('proposalId',p.id));
 BEGIN
  LOCK TABLE github_issues IN ROW EXCLUSIVE MODE;
  expected_count:=jsonb_array_length(payload);
  INSERT INTO github_issues(source,repository,external_id,issue_number,title,body,state,html_url,source_updated_at)
   SELECT 'github',target_repo,x."externalId",x.number,x.title,x.body,x.state,x."htmlUrl",x."updatedAt"::timestamptz
   FROM jsonb_to_recordset(payload) AS x("externalId" text,number integer,title text,body text,state text,"htmlUrl" text,"updatedAt" text)
   ON CONFLICT(source,repository,external_id) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,
   state=EXCLUDED.state,html_url=EXCLUDED.html_url,issue_number=EXCLUDED.issue_number,source_updated_at=EXCLUDED.source_updated_at,synced_at=now();
  SELECT count(*) INTO actual_count FROM jsonb_to_recordset(payload) AS x("externalId" text,number integer,title text,body text,state text,"htmlUrl" text,"updatedAt" text)
   JOIN github_issues g ON g.source='github' AND g.repository=target_repo AND g.external_id=x."externalId"
   AND g.title=x.title AND g.body=x.body AND g.state=x.state
   AND g.issue_number=x.number AND g.html_url=x."htmlUrl" AND g.source_updated_at=x."updatedAt"::timestamptz;
  IF actual_count<>expected_count THEN RAISE EXCEPTION 'Verification failed'; END IF;
  INSERT INTO replay_attempts VALUES(i.id,'succeeded',actual_count,now());
  UPDATE incidents SET status='recovered',version=version+1,updated_at=now() WHERE id=i.id;
  INSERT INTO audit_events(entity_type,entity_id,run_id,correlation_id,action,actor_type,details)
   VALUES('incident',i.id,i.run_id,correlation_input,'replay_verified','system',jsonb_build_object('verifiedCount',actual_count));
  RETURN jsonb_build_object('status','recovered','verifiedCount',actual_count);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS failure_code=RETURNED_SQLSTATE;
  INSERT INTO replay_attempts VALUES(i.id,'failed',0,now());
  UPDATE incidents SET status='replay_failed',version=version+1,updated_at=now() WHERE id=i.id;
  INSERT INTO audit_events(entity_type,entity_id,run_id,correlation_id,action,actor_type,details)
   VALUES('incident',i.id,i.run_id,correlation_input,'replay_failed','system',jsonb_build_object('sqlState',failure_code));
  RETURN jsonb_build_object('status','replay_failed');
 END;
END $$;
REVOKE ALL ON FUNCTION flowmedic_repair_action(uuid,text,uuid,text,integer,text,text) FROM PUBLIC;
-- Grant EXECUTE explicitly to a separate runtime role if it is not the migration owner.
