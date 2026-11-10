-- Policy-neutral coordination. No function here deletes application records.
-- The installed mode cannot enable production execution; provider deletion
-- requires a separately reviewed implementation and recorded category policy.
CREATE SCHEMA retention9d;
REVOKE ALL ON SCHEMA retention9d FROM PUBLIC;
CREATE TABLE retention9d.configuration(singleton boolean PRIMARY KEY CHECK(singleton),node text NOT NULL CHECK(node IN('source','receiver','custodian')),
 production_execution boolean NOT NULL DEFAULT false CHECK(NOT production_execution),max_operations int NOT NULL CHECK(max_operations BETWEEN 1 AND 10000));
CREATE TABLE retention9d.policies(category text NOT NULL,version int NOT NULL CHECK(version>0),trigger_name text NOT NULL,
 duration_seconds int CHECK(duration_seconds>0),approved boolean NOT NULL DEFAULT false,enabled boolean NOT NULL DEFAULT false,
 approval_reference text,synthetic_only boolean NOT NULL DEFAULT true CHECK(synthetic_only),PRIMARY KEY(category,version));
CREATE TABLE retention9d.resources(scope text PRIMARY KEY,category text NOT NULL,identity text NOT NULL,commitment text NOT NULL,
 terminal boolean NOT NULL,payload_present boolean NOT NULL,disposition text NOT NULL CHECK(disposition IN('MINIMIZE_PAYLOAD','RETAIN_COMMITMENTS')),
 observed_at timestamptz NOT NULL,epoch bigint NOT NULL DEFAULT 0,held boolean NOT NULL DEFAULT false,tombstone boolean NOT NULL DEFAULT false);
CREATE TABLE retention9d.operations(id uuid PRIMARY KEY,scope text NOT NULL,epoch bigint NOT NULL,policy_version int NOT NULL,
 state text NOT NULL CHECK(state IN('PREPARING','COMMITTING','COMPLETE','HELD')),actor text NOT NULL,approval_reference text NOT NULL,
 synthetic_only boolean NOT NULL CHECK(synthetic_only),created timestamptz NOT NULL);
CREATE UNIQUE INDEX retention9d_one_active_scope ON retention9d.operations(scope) WHERE state IN('PREPARING','COMMITTING');
CREATE TABLE retention9d.targets(operation uuid REFERENCES retention9d.operations, node text CHECK(node IN('source','receiver','custodian')),
 phase text NOT NULL CHECK(phase IN('WAITING','PREPARED','ACKED')),receipt jsonb,PRIMARY KEY(operation,node));
CREATE TABLE retention9d.receipts(operation uuid PRIMARY KEY,scope text NOT NULL,epoch bigint NOT NULL,policy_version int NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('PREPARED','SIMULATED_PAYLOAD_PURGE','RETAINED_COMMITMENTS')),body jsonb NOT NULL);
CREATE TABLE retention9d.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,operation uuid,scope text NOT NULL,actor text NOT NULL,action text NOT NULL,result text NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE retention9d.hold_approvals(reference text PRIMARY KEY,scope text NOT NULL,release boolean NOT NULL,synthetic_only boolean NOT NULL CHECK(synthetic_only));
CREATE TABLE retention9d.hold_commands(reference text PRIMARY KEY,scope text NOT NULL,release boolean NOT NULL,actor text NOT NULL,response jsonb NOT NULL);
CREATE TABLE retention9d.hold_targets(reference text REFERENCES retention9d.hold_commands,node text CHECK(node IN('source','receiver','custodian')),
 status text NOT NULL CHECK(status IN('PENDING','HELD','RELEASED','LATE_HOLD_CONFLICT')),PRIMARY KEY(reference,node));
CREATE FUNCTION retention9d.valid_receipt(r jsonb) RETURNS boolean LANGUAGE sql SET search_path=pg_catalog,retention9d,pg_temp AS $$
 SELECT CASE WHEN jsonb_typeof(r) IS DISTINCT FROM 'object' THEN false ELSE
 r-ARRAY['schema','operation','status','scope','epoch','policyVersion','node','commitment']='{}'::jsonb
 AND (SELECT count(*) FROM jsonb_object_keys(r))=8
 AND NOT EXISTS(SELECT FROM jsonb_each(r) WHERE jsonb_typeof(value)<>'string')
 AND r->>'schema'='management-receipt-v1' AND r->>'operation'~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'
 AND r->>'epoch'~'^[1-9][0-9]{0,14}$' AND r->>'policyVersion'~'^[1-9][0-9]{0,8}$'
 AND r->>'node' IN('source','receiver','custodian') AND r->>'commitment'~'^[a-f0-9]{64}$'
 AND r->>'status' IN('PREPARED','SIMULATED_PAYLOAD_PURGE','RETAINED_COMMITMENTS') END
$$;
CREATE FUNCTION retention9d.audit(op uuid,scope text,action text,result text) RETURNS void LANGUAGE sql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
 INSERT INTO retention9d.audit(operation,scope,actor,action,result) VALUES(op,scope,session_user,action,result)
$$;
CREATE FUNCTION retention9d.begin_delete(op uuid,n text,version int,approval text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE r retention9d.resources;o retention9d.operations;p retention9d.policies;
BEGIN
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 SELECT * INTO r FROM retention9d.resources WHERE scope=n FOR UPDATE;
 IF op IS NULL OR r.scope IS NULL OR version IS NULL OR approval IS NULL THEN RETURN jsonb_build_object('status','INVALID'); END IF;
 SELECT * INTO o FROM retention9d.operations WHERE id=op;
 IF o.id IS NOT NULL THEN RETURN jsonb_build_object('status',CASE WHEN o.scope=n AND o.policy_version=version AND o.actor=session_user AND o.approval_reference=approval THEN o.state ELSE 'CONFLICT' END,'epoch',o.epoch); END IF;
 IF r.held THEN RETURN jsonb_build_object('status','HELD'); END IF;
 IF r.tombstone THEN RETURN jsonb_build_object('status','ALREADY_TOMBSTONED'); END IF;
 SELECT * INTO p FROM retention9d.policies WHERE category=r.category AND policies.version=begin_delete.version;
 IF NOT FOUND OR NOT p.approved OR NOT p.enabled OR p.approval_reference IS DISTINCT FROM approval THEN RETURN jsonb_build_object('status','POLICY_DISABLED'); END IF;
 IF (SELECT count(*) FROM retention9d.operations)>=(SELECT max_operations FROM retention9d.configuration) THEN RETURN jsonb_build_object('status','OPERATION_LIMIT'); END IF;
 IF EXISTS(SELECT FROM retention9d.operations WHERE scope=n AND state IN('PREPARING','COMMITTING')) THEN RETURN jsonb_build_object('status','BUSY'); END IF;
 UPDATE retention9d.resources SET epoch=epoch+1 WHERE scope=n RETURNING * INTO r;
 INSERT INTO retention9d.operations VALUES(op,n,r.epoch,version,'PREPARING',session_user,approval,true,clock_timestamp());
 INSERT INTO retention9d.targets SELECT op,node,'WAITING',NULL FROM unnest(ARRAY['source','receiver','custodian']) node;
 PERFORM retention9d.audit(op,n,'BEGIN','PREPARING');RETURN jsonb_build_object('status','PREPARING','epoch',r.epoch);
END $$;
CREATE FUNCTION retention9d.hold(n text,release boolean,approval text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE r retention9d.resources;result text;prior retention9d.hold_commands;response jsonb;
BEGIN
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 SELECT * INTO r FROM retention9d.resources WHERE scope=n FOR UPDATE;
 IF r.scope IS NULL OR approval IS NULL OR length(approval)=0 THEN RETURN jsonb_build_object('status','INVALID');END IF;
 SELECT * INTO prior FROM retention9d.hold_commands WHERE reference=approval;
 IF FOUND THEN RETURN CASE WHEN prior.scope=n AND prior.release=hold.release AND prior.actor=session_user THEN prior.response ELSE jsonb_build_object('status','CONFLICT') END;END IF;
 IF NOT EXISTS(SELECT FROM retention9d.hold_approvals a WHERE a.reference=approval AND a.scope=n AND a.release=hold.release) THEN RETURN jsonb_build_object('status','APPROVAL_REQUIRED');END IF;
 IF (SELECT count(*) FROM retention9d.hold_commands)>=(SELECT max_operations FROM retention9d.configuration) THEN RETURN jsonb_build_object('status','OPERATION_LIMIT');END IF;
 IF EXISTS(SELECT FROM retention9d.operations WHERE scope=n AND state IN('COMMITTING','COMPLETE')) OR r.tombstone THEN result='LATE_HOLD_CONFLICT';
 ELSE
  UPDATE retention9d.resources SET held=NOT release,epoch=epoch+1 WHERE scope=n RETURNING * INTO r;
  IF NOT release THEN UPDATE retention9d.operations SET state='HELD' WHERE scope=n AND state='PREPARING';END IF;
  result=CASE WHEN release THEN 'RELEASED' ELSE 'HELD' END;
 END IF;
 PERFORM retention9d.audit(NULL,n,CASE WHEN release THEN 'RELEASE_HOLD' ELSE 'HOLD' END,result);
 response=jsonb_build_object('status',result,'epoch',r.epoch,'approvalReference',approval);
 INSERT INTO retention9d.hold_commands VALUES(approval,n,release,session_user,response);
 INSERT INTO retention9d.hold_targets SELECT approval,node,'PENDING' FROM unnest(ARRAY['source','receiver','custodian']) node;
 RETURN response;
END $$;
CREATE FUNCTION retention9d.ack_hold(approval text,node_name text,response jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE command retention9d.hold_commands;
BEGIN
 SELECT * INTO command FROM retention9d.hold_commands WHERE reference=approval FOR UPDATE;
 IF command.reference IS NULL OR response->>'approvalReference' IS DISTINCT FROM approval OR response->>'status' IS DISTINCT FROM command.response->>'status' THEN RETURN false;END IF;
 UPDATE retention9d.hold_targets SET status=response->>'status' WHERE reference=approval AND node=node_name;
 RETURN FOUND;
END $$;
CREATE FUNCTION retention9d.local_prepare(op uuid,n text,expected bigint,version int,approval text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE r retention9d.resources;p retention9d.policies;receipt jsonb;prior retention9d.receipts;
BEGIN
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 SELECT * INTO r FROM retention9d.resources WHERE scope=n FOR UPDATE;
 IF r.scope IS NULL OR expected IS NULL OR op IS NULL THEN RETURN jsonb_build_object('status','INVALID'); END IF;
 IF r.held OR r.epoch>expected THEN RETURN jsonb_build_object('status','HELD_OR_STALE');END IF;
 SELECT * INTO prior FROM retention9d.receipts WHERE operation=op;
 IF prior.operation IS NOT NULL THEN RETURN CASE WHEN prior.scope=n AND prior.epoch=expected AND prior.policy_version=version THEN prior.body ELSE jsonb_build_object('status','CONFLICT') END; END IF;
 SELECT * INTO p FROM retention9d.policies WHERE category=r.category AND policies.version=local_prepare.version;
 IF NOT FOUND OR NOT p.enabled OR NOT p.approved OR p.approval_reference IS DISTINCT FROM approval THEN RETURN jsonb_build_object('status','POLICY_DISABLED');END IF;
 IF p.duration_seconds IS NULL THEN RETURN jsonb_build_object('status','POLICY_DISABLED');END IF;
 IF (SELECT count(*) FROM retention9d.receipts)>=(SELECT max_operations FROM retention9d.configuration) THEN RETURN jsonb_build_object('status','OPERATION_LIMIT');END IF;
 IF r.held OR r.epoch>expected THEN RETURN jsonb_build_object('status','HELD_OR_STALE');END IF;
 IF NOT r.terminal THEN RETURN jsonb_build_object('status','ACTIVE');END IF;
 IF r.observed_at+make_interval(secs=>p.duration_seconds)>clock_timestamp() THEN RETURN jsonb_build_object('status','NOT_EXPIRED');END IF;
 UPDATE retention9d.resources SET epoch=expected WHERE scope=n;
 receipt=jsonb_build_object('schema','management-receipt-v1','operation',op::text,'status','PREPARED','scope',n,'epoch',expected::text,'policyVersion',version::text,'commitment',r.commitment,'node',(SELECT node FROM retention9d.configuration));
 INSERT INTO retention9d.receipts VALUES(op,n,expected,version,'PREPARED',receipt);
 PERFORM retention9d.audit(op,n,'LOCAL_PREPARE','PREPARED');RETURN receipt;
END $$;
CREATE FUNCTION retention9d.ack_prepare(op uuid,node_name text,receipt jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE o retention9d.operations;
BEGIN
 SELECT * INTO o FROM retention9d.operations WHERE id=op FOR UPDATE;
 IF o.state IS DISTINCT FROM 'PREPARING' OR retention9d.valid_receipt(receipt) IS NOT TRUE OR receipt->>'operation' IS DISTINCT FROM op::text OR receipt->>'status' IS DISTINCT FROM 'PREPARED' OR receipt->>'scope' IS DISTINCT FROM o.scope OR receipt->>'node' IS DISTINCT FROM node_name OR receipt->>'epoch' IS DISTINCT FROM o.epoch::text OR receipt->>'policyVersion' IS DISTINCT FROM o.policy_version::text THEN RETURN false;END IF;
 UPDATE retention9d.targets SET phase='PREPARED',receipt=ack_prepare.receipt WHERE operation=op AND node=node_name AND phase IN('WAITING','PREPARED') AND (targets.receipt IS NULL OR targets.receipt=ack_prepare.receipt);
 RETURN FOUND;
END $$;
CREATE FUNCTION retention9d.authorize(op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE o retention9d.operations;r retention9d.resources;
BEGIN
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 SELECT * INTO o FROM retention9d.operations WHERE id=op FOR UPDATE;
 IF o.id IS NULL THEN RETURN jsonb_build_object('status','MISSING');END IF;
 SELECT * INTO r FROM retention9d.resources WHERE scope=o.scope FOR UPDATE;
 IF o.state='COMMITTING' THEN RETURN jsonb_build_object('status','COMMITTING','epoch',o.epoch);END IF;
 IF o.state<>'PREPARING' OR r.held OR r.epoch<>o.epoch THEN RETURN jsonb_build_object('status','HELD_OR_STALE');END IF;
 IF (SELECT count(*) FROM retention9d.targets WHERE operation=op AND phase='PREPARED')<>3 THEN RETURN jsonb_build_object('status','PENDING_ACKS');END IF;
 UPDATE retention9d.operations SET state='COMMITTING' WHERE id=op;
 PERFORM retention9d.audit(op,o.scope,'AUTHORIZE','SIMULATION_ONLY');RETURN jsonb_build_object('status','COMMITTING','epoch',o.epoch);
END $$;
CREATE FUNCTION retention9d.local_commit(op uuid,n text,expected bigint,version int,production boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE r retention9d.resources;p retention9d.receipts;receipt jsonb;result text;
BEGIN
 IF production IS DISTINCT FROM false THEN RETURN jsonb_build_object('status','PRODUCTION_DELETION_DISABLED');END IF;
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 SELECT * INTO r FROM retention9d.resources WHERE scope=n FOR UPDATE;
 SELECT * INTO p FROM retention9d.receipts WHERE operation=op;
 IF r.scope IS NULL OR p.scope IS DISTINCT FROM n OR p.epoch IS DISTINCT FROM expected OR p.policy_version IS DISTINCT FROM version OR r.held OR r.epoch<>expected THEN RETURN jsonb_build_object('status','HELD_OR_STALE');END IF;
 IF NOT EXISTS(SELECT FROM retention9d.policies WHERE category=r.category AND policies.version=local_commit.version AND enabled AND approved) THEN RETURN jsonb_build_object('status','POLICY_DISABLED');END IF;
 IF p.outcome<>'PREPARED' THEN RETURN p.body;END IF;
 -- A trusted coordinator submits this only after durable authorize(). This is
 -- not cryptographic/distributed authorization against a compromised controller.
 result=CASE WHEN r.disposition='RETAIN_COMMITMENTS' THEN 'RETAINED_COMMITMENTS' ELSE 'SIMULATED_PAYLOAD_PURGE' END;
 IF result='SIMULATED_PAYLOAD_PURGE' THEN UPDATE retention9d.resources SET tombstone=true WHERE scope=n;END IF;
 receipt=jsonb_build_object('schema','management-receipt-v1','status',result,'operation',op::text,'scope',n,'epoch',expected::text,'policyVersion',version::text,'node',(SELECT node FROM retention9d.configuration),'commitment',r.commitment);
 UPDATE retention9d.receipts SET outcome=result,body=receipt WHERE operation=op;
 PERFORM retention9d.audit(op,n,'LOCAL_COMMIT',result);RETURN receipt;
END $$;
CREATE FUNCTION retention9d.ack_commit(op uuid,node_name text,r jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE o retention9d.operations;
BEGIN
 SELECT * INTO o FROM retention9d.operations WHERE id=op FOR UPDATE;
 IF o.id IS NULL OR o.state NOT IN('COMMITTING','COMPLETE') OR retention9d.valid_receipt(r) IS NOT TRUE OR r->>'status' NOT IN('SIMULATED_PAYLOAD_PURGE','RETAINED_COMMITMENTS') OR r->>'scope' IS DISTINCT FROM o.scope OR r->>'operation' IS DISTINCT FROM op::text OR r->>'node' IS DISTINCT FROM node_name OR r->>'epoch' IS DISTINCT FROM o.epoch::text OR r->>'policyVersion' IS DISTINCT FROM o.policy_version::text THEN RETURN false;END IF;
 IF r->>'commitment' IS DISTINCT FROM (SELECT receipt->>'commitment' FROM retention9d.targets WHERE operation=op AND node=node_name) THEN RETURN false;END IF;
 UPDATE retention9d.targets SET phase='ACKED',receipt=r WHERE operation=op AND node=node_name AND (phase='PREPARED' OR phase='ACKED' AND receipt=r);
 IF NOT FOUND THEN RETURN false;END IF;
 IF (SELECT count(*) FROM retention9d.targets WHERE operation=op AND phase='ACKED')=3 THEN UPDATE retention9d.operations SET state='COMPLETE' WHERE id=op;END IF;
 RETURN true;
END $$;
CREATE FUNCTION retention9d.restore_allowed(n text) RETURNS boolean LANGUAGE sql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$ SELECT EXISTS(SELECT FROM retention9d.resources WHERE scope=n AND NOT tombstone AND NOT held) $$;
REVOKE ALL ON ALL TABLES IN SCHEMA retention9d FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention9d FROM PUBLIC;
