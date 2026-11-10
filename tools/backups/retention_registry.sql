-- Optional management metadata, not an application migration or deletion API.
-- Bootstrap assigns exact authenticated SQL logins; no Clerk role is inferred.
CREATE SCHEMA retention_registry;
REVOKE ALL ON SCHEMA retention_registry FROM PUBLIC;
CREATE TABLE retention_registry.configuration(singleton bool PRIMARY KEY CHECK(singleton),
 proprietor_login name NOT NULL,operator_login name NOT NULL,
 production_deletion bool NOT NULL DEFAULT false CHECK(NOT production_deletion));
CREATE TABLE retention_registry.scopes(scope text PRIMARY KEY,epoch bigint NOT NULL DEFAULT 0,
 inventory_complete bool NOT NULL DEFAULT false,inventory_hash text,manual_review bool NOT NULL DEFAULT false);
CREATE TABLE retention_registry.copies(scope text REFERENCES retention_registry.scopes,copy_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('SQL_ROWS','GCS_GENERATION','ENCRYPTED_BACKUP','PROVIDER_COPY')),
 binding text NOT NULL CHECK(binding ~ '^[a-f0-9]{64}$'),state text NOT NULL CHECK(state IN('PRESENT','PROVIDER_HELD','UNKNOWN','PURGED')),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),actor name NOT NULL,PRIMARY KEY(scope,copy_id));
CREATE TABLE retention_registry.holds(hold_id uuid PRIMARY KEY,scope text NOT NULL REFERENCES retention_registry.scopes,
 placement uuid UNIQUE NOT NULL,release uuid UNIQUE,placed_by name NOT NULL,released_by name);
CREATE TABLE retention_registry.decisions(operation uuid PRIMARY KEY,arguments jsonb NOT NULL,receipt jsonb NOT NULL,actor name NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE retention_registry.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,scope text NOT NULL,action text NOT NULL,
 actor name NOT NULL,details jsonb NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp());

CREATE FUNCTION retention_registry.register_copy(n text,id text,k text,h text,state_name text,expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_registry,pg_temp AS $$
DECLARE c retention_registry.configuration;s retention_registry.scopes;old retention_registry.copies;
BEGIN
 SELECT * INTO STRICT c FROM retention_registry.configuration FOR UPDATE;
 IF session_user<>c.operator_login THEN RAISE EXCEPTION 'OPERATOR_REQUIRED' USING ERRCODE='42501';END IF;
 IF n IS NULL OR length(n) NOT BETWEEN 1 AND 200 OR id IS NULL OR length(id) NOT BETWEEN 1 AND 300 OR
 h IS NULL OR h!~'^[a-f0-9]{64}$' OR k IS NULL OR k NOT IN('SQL_ROWS','GCS_GENERATION','ENCRYPTED_BACKUP','PROVIDER_COPY') OR
 state_name IS NULL OR state_name NOT IN('PRESENT','PROVIDER_HELD','UNKNOWN','PURGED') THEN RETURN jsonb_build_object('status','INVALID');END IF;
 INSERT INTO retention_registry.scopes(scope) VALUES(n) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT s FROM retention_registry.scopes WHERE scope=n FOR UPDATE;
 IF expected IS DISTINCT FROM s.epoch THEN RETURN jsonb_build_object('status','STALE','epoch',s.epoch);END IF;
 SELECT * INTO old FROM retention_registry.copies WHERE scope=n AND copy_id=id;
 IF FOUND AND (old.binding<>h OR old.kind<>k) THEN RETURN jsonb_build_object('status','COPY_ID_CONFLICT');END IF;
 IF old.copy_id IS NULL THEN UPDATE retention_registry.scopes SET epoch=epoch+1,inventory_complete=false,inventory_hash=NULL WHERE scope=n;END IF;
 INSERT INTO retention_registry.copies(scope,copy_id,kind,binding,state,actor) VALUES(n,id,k,h,state_name,session_user)
 ON CONFLICT(scope,copy_id) DO UPDATE SET state=excluded.state,observed_at=clock_timestamp(),actor=session_user;
 IF state_name='PURGED' THEN UPDATE retention_registry.scopes SET manual_review=true WHERE scope=n;END IF;
 INSERT INTO retention_registry.audit(scope,action,actor,details) VALUES(n,'COPY_OBSERVED',session_user,jsonb_build_object('copy',id,'state',state_name));
 RETURN jsonb_build_object('status','RECORDED','epoch',(SELECT epoch FROM retention_registry.scopes WHERE scope=n));
END $$;

CREATE FUNCTION retention_registry.seal_inventory(n text,expected bigint,ids text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_registry,pg_temp AS $$
DECLARE c retention_registry.configuration;s retention_registry.scopes;actual text[];commitment text;
BEGIN
 SELECT * INTO STRICT c FROM retention_registry.configuration FOR UPDATE;
 IF session_user<>c.operator_login THEN RAISE EXCEPTION 'OPERATOR_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM retention_registry.scopes WHERE scope=n FOR UPDATE;
 IF s.scope IS NULL OR expected IS DISTINCT FROM s.epoch THEN RETURN jsonb_build_object('status','STALE');END IF;
 SELECT array_agg(copy_id ORDER BY copy_id),encode(sha256(convert_to(jsonb_agg(jsonb_build_object('id',copy_id,'kind',kind,'binding',binding) ORDER BY copy_id)::text,'UTF8')),'hex') INTO actual,commitment FROM retention_registry.copies WHERE scope=n;
 IF ids IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 256 OR actual IS NULL OR actual IS DISTINCT FROM ARRAY(SELECT x FROM unnest(ids) x ORDER BY x) THEN RETURN jsonb_build_object('status','INCOMPLETE_COPY_SET');END IF;
 UPDATE retention_registry.scopes SET inventory_complete=true,inventory_hash=commitment WHERE scope=n;
 INSERT INTO retention_registry.audit(scope,action,actor,details) VALUES(n,'INVENTORY_DECLARED',session_user,jsonb_build_object('hash',commitment));
 RETURN jsonb_build_object('status','DECLARED','hash',commitment,'independentCompletenessProof',false);
END $$;

CREATE FUNCTION retention_registry.decide_hold(op uuid,n text,id uuid,releasing bool,expected bigint,approval text,document_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_registry,pg_temp AS $$
DECLARE c retention_registry.configuration;s retention_registry.scopes;prior retention_registry.decisions;args jsonb;result jsonb;active int;
BEGIN
 SELECT * INTO STRICT c FROM retention_registry.configuration FOR UPDATE;
 IF session_user<>c.proprietor_login THEN RAISE EXCEPTION 'PROPRIETOR_REQUIRED' USING ERRCODE='42501';END IF;
 IF op IS NULL OR id IS NULL OR releasing IS NULL OR approval IS NULL OR length(approval) NOT BETWEEN 1 AND 200 OR
 document_hash IS NULL OR document_hash!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','INVALID');END IF;
 args=jsonb_build_object('scope',n,'hold',id,'release',releasing,'expected',expected,'approval',approval,'document',document_hash);
 SELECT * INTO prior FROM retention_registry.decisions WHERE operation=op;
 IF FOUND THEN
   IF prior.arguments=args AND prior.actor=session_user THEN RETURN prior.receipt;END IF;
   RETURN jsonb_build_object('status','OPERATION_CONFLICT');
 END IF;
 SELECT * INTO s FROM retention_registry.scopes WHERE scope=n FOR UPDATE;
 IF s.scope IS NULL OR expected IS DISTINCT FROM s.epoch THEN RETURN jsonb_build_object('status','STALE');END IF;
 IF releasing THEN
   UPDATE retention_registry.holds SET release=op,released_by=session_user WHERE hold_id=id AND scope=n AND release IS NULL;
   IF NOT FOUND THEN RETURN jsonb_build_object('status','RELEASE_MISMATCH');END IF;
 ELSE
   IF EXISTS(SELECT FROM retention_registry.holds WHERE hold_id=id) THEN RETURN jsonb_build_object('status','HOLD_ID_CONFLICT');END IF;
   INSERT INTO retention_registry.holds VALUES(id,n,op,NULL,session_user,NULL);
 END IF;
 SELECT count(*) INTO active FROM retention_registry.holds WHERE scope=n AND release IS NULL;
 UPDATE retention_registry.scopes SET epoch=epoch+1,manual_review=manual_review OR EXISTS(SELECT FROM retention_registry.copies WHERE scope=n AND state='PURGED') WHERE scope=n;
 -- Optional bridge to already-enrolled local resources, atomically fencing
 -- the existing row guard/cleanup path. No enrollment or production install.
 IF to_regclass('retention9d.resources') IS NOT NULL THEN
   UPDATE retention9d.resources SET held=active>0,epoch=epoch+1 WHERE scope=n;
   UPDATE retention9d.operations SET state='HELD' WHERE scope=n AND state IN('PREPARING','COMMITTING');
 END IF;
 result=jsonb_build_object('status',CASE WHEN active>0 THEN 'HELD' ELSE 'RELEASED_REVIEW_REQUIRED' END,
   'scope',n,'hold',id,'epoch',s.epoch+1,'activeHolds',active,'manualReview',(SELECT manual_review FROM retention_registry.scopes WHERE scope=n),'productionDeletion',false);
 INSERT INTO retention_registry.decisions(operation,arguments,receipt,actor) VALUES(op,args,result,session_user);
 INSERT INTO retention_registry.audit(scope,action,actor,details) VALUES(n,CASE WHEN releasing THEN 'HOLD_RELEASED' ELSE 'HOLD_PLACED' END,session_user,result);
 RETURN result;
END $$;

CREATE FUNCTION retention_registry.restore_decision(n text,snapshot_epoch bigint) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,retention_registry,pg_temp AS $$
 SELECT jsonb_build_object('status','QUARANTINE','scope',n,'authorityAvailable',s.scope IS NOT NULL,'epoch',s.epoch,
 'snapshotStale',s.epoch IS DISTINCT FROM snapshot_epoch,'inventoryDeclared',COALESCE(s.inventory_complete,false),
 'held',EXISTS(SELECT FROM retention_registry.holds WHERE scope=n AND release IS NULL),'manualReview',COALESCE(s.manual_review,true),
 'copyObservationPending',EXISTS(SELECT FROM retention_registry.copies WHERE scope=n AND (state IN('UNKNOWN','PURGED') OR observed_at<clock_timestamp()-interval '300 seconds')),
 'trafficReleaseAuthorized',false,'productionDeletion',false)
 FROM (SELECT n AS requested) q LEFT JOIN retention_registry.scopes s ON s.scope=q.requested
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_registry FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_registry FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_registry FROM PUBLIC;
