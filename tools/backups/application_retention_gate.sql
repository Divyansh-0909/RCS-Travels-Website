-- Optional synthetic installation, never a production migration or remote erase API.
-- Retention_registry remains the existing proprietor/copy authority.
CREATE SCHEMA retention_cleanup;
REVOKE ALL ON SCHEMA retention_cleanup FROM PUBLIC;
CREATE TABLE retention_cleanup.configuration(singleton boolean PRIMARY KEY CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,synthetic_only boolean NOT NULL DEFAULT true CHECK(synthetic_only),
 production_deletion boolean NOT NULL DEFAULT false CHECK(NOT production_deletion),
 executor_logins name[] NOT NULL,policy_hash text NOT NULL CHECK(policy_hash~'^[a-f0-9]{64}$'));
CREATE TABLE retention_cleanup.targets(scope text NOT NULL REFERENCES retention_registry.scopes,
 relation_name text NOT NULL CHECK(relation_name IN('public.users','public.saved_places','outbox9d.deliveries')),
 identity text NOT NULL,PRIMARY KEY(scope,relation_name,identity));
CREATE TABLE retention_cleanup.reviews(scope text NOT NULL REFERENCES retention_registry.scopes,
 action text NOT NULL CHECK(action IN('ACCOUNT_DELETE','SAVED_PLACE_DELETE','PIPELINE_MINIMIZE')),
 epoch bigint NOT NULL,inventory_hash text NOT NULL,policy_hash text NOT NULL,snapshot_hash text NOT NULL,
 operation uuid UNIQUE NOT NULL,approval text NOT NULL,document_hash text NOT NULL,actor name NOT NULL,
 PRIMARY KEY(scope,action));
CREATE TABLE retention_cleanup.permits(backend integer NOT NULL,transaction bigint NOT NULL,scope text NOT NULL,
 action text NOT NULL,epoch bigint NOT NULL,review uuid NOT NULL,PRIMARY KEY(backend,transaction,scope,action));
CREATE TABLE retention_cleanup.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 scope text NOT NULL,action text NOT NULL,actor name NOT NULL,review uuid,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE retention_cleanup.provider_actions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,scope text NOT NULL,
 kind text NOT NULL CHECK(kind='CLERK_ACCOUNT_DELETE'),target text NOT NULL,review uuid NOT NULL,
 state text NOT NULL DEFAULT 'WAITING_PROVIDER_REVIEW' CHECK(state='WAITING_PROVIDER_REVIEW'),
 UNIQUE(scope,kind,target));

CREATE FUNCTION retention_cleanup.scope_snapshot(n text,locking boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_cleanup,pg_temp AS $$
DECLARE t record;r jsonb;parts jsonb='[]'::jsonb;count_targets integer;
BEGIN
 SELECT count(*) INTO count_targets FROM retention_cleanup.targets WHERE scope=n;
 IF count_targets NOT BETWEEN 1 AND 256 THEN RETURN NULL;END IF;
 FOR t IN SELECT * FROM retention_cleanup.targets WHERE scope=n ORDER BY relation_name,identity LOOP
  IF locking THEN
   EXECUTE format('SELECT to_jsonb(x) FROM %I.%I x WHERE id::text=$1 FOR UPDATE',split_part(t.relation_name,'.',1),split_part(t.relation_name,'.',2)) INTO r USING t.identity;
  ELSE
   EXECUTE format('SELECT to_jsonb(x) FROM %I.%I x WHERE id::text=$1',split_part(t.relation_name,'.',1),split_part(t.relation_name,'.',2)) INTO r USING t.identity;
  END IF;
  IF r IS NULL THEN RETURN NULL;END IF;
  parts=parts||jsonb_build_array(jsonb_build_object('relation',t.relation_name,'identity',t.identity,'row',r));
 END LOOP;
 RETURN encode(sha256(convert_to(parts::text,'UTF8')),'hex');
END $$;

CREATE FUNCTION retention_cleanup.review_cleanup(op uuid,n text,a text,expected bigint,approval text,document text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_cleanup,retention_registry,pg_temp AS $$
DECLARE c retention_registry.configuration;s retention_registry.scopes;cfg retention_cleanup.configuration;h text;
BEGIN
 SELECT * INTO STRICT c FROM retention_registry.configuration FOR UPDATE;
 IF session_user<>c.proprietor_login THEN RAISE EXCEPTION 'PROPRIETOR_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT cfg FROM retention_cleanup.configuration;
 IF NOT cfg.enabled OR current_database() NOT LIKE 'retention_cleanup_lab_%' THEN RETURN jsonb_build_object('status','DISABLED');END IF;
 IF op IS NULL OR a IS NULL OR a NOT IN('ACCOUNT_DELETE','SAVED_PLACE_DELETE','PIPELINE_MINIMIZE') OR approval IS NULL OR length(approval) NOT BETWEEN 1 AND 200 OR document IS NULL OR document!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','INVALID');END IF;
 SELECT * INTO s FROM retention_registry.scopes WHERE scope=n FOR UPDATE;
 IF s.scope IS NULL OR expected IS DISTINCT FROM s.epoch THEN RETURN jsonb_build_object('status','STALE');END IF;
 IF EXISTS(SELECT FROM retention_registry.holds WHERE scope=n AND release IS NULL) THEN RETURN jsonb_build_object('status','HELD');END IF;
 IF s.manual_review THEN RETURN jsonb_build_object('status','MANUAL_REVIEW_REQUIRED');END IF;
 IF NOT s.inventory_complete OR s.inventory_hash IS NULL THEN RETURN jsonb_build_object('status','INCOMPLETE_INVENTORY');END IF;
 IF NOT EXISTS(SELECT FROM retention_registry.copies WHERE scope=n) OR EXISTS(SELECT FROM retention_registry.copies WHERE scope=n AND (state<>'PRESENT' OR observed_at<clock_timestamp()-interval '300 seconds')) THEN RETURN jsonb_build_object('status','COPY_OBSERVATION_REQUIRED');END IF;
 h=retention_cleanup.scope_snapshot(n,true);
 IF h IS NULL THEN RETURN jsonb_build_object('status','TARGET_INVENTORY_REQUIRED');END IF;
 INSERT INTO retention_cleanup.reviews VALUES(n,a,s.epoch,s.inventory_hash,cfg.policy_hash,h,op,approval,document,session_user)
 ON CONFLICT(scope,action) DO UPDATE SET epoch=excluded.epoch,inventory_hash=excluded.inventory_hash,policy_hash=excluded.policy_hash,
 snapshot_hash=excluded.snapshot_hash,operation=excluded.operation,approval=excluded.approval,document_hash=excluded.document_hash,actor=excluded.actor;
 INSERT INTO retention_cleanup.audit(scope,action,actor,review) VALUES(n,'CLEANUP_REVIEWED',session_user,op);
 RETURN jsonb_build_object('status','REVIEWED','epoch',s.epoch,'productionDeletion',false);
END $$;

CREATE FUNCTION retention_cleanup.begin_cleanup(n text,a text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_cleanup,retention_registry,pg_temp AS $$
DECLARE cfg retention_cleanup.configuration;s retention_registry.scopes;r retention_cleanup.reviews;h text;
BEGIN
 -- Same first lock as hold placement/release and copy registration/sealing.
 PERFORM 1 FROM retention_registry.configuration FOR UPDATE;
 SELECT * INTO STRICT cfg FROM retention_cleanup.configuration;
 IF NOT (session_user=ANY(cfg.executor_logins)) THEN RAISE EXCEPTION 'EXECUTOR_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT cfg.enabled OR current_database() NOT LIKE 'retention_cleanup_lab_%' THEN RETURN jsonb_build_object('status','DISABLED');END IF;
 SELECT * INTO s FROM retention_registry.scopes WHERE scope=n FOR UPDATE;
 IF s.scope IS NULL THEN RETURN jsonb_build_object('status','SCOPE_REQUIRED');END IF;
 IF EXISTS(SELECT FROM retention_registry.holds WHERE scope=n AND release IS NULL) THEN RETURN jsonb_build_object('status','HELD');END IF;
 IF s.manual_review THEN RETURN jsonb_build_object('status','MANUAL_REVIEW_REQUIRED');END IF;
 IF NOT s.inventory_complete OR s.inventory_hash IS NULL THEN RETURN jsonb_build_object('status','INCOMPLETE_INVENTORY');END IF;
 IF NOT EXISTS(SELECT FROM retention_registry.copies WHERE scope=n) OR EXISTS(SELECT FROM retention_registry.copies WHERE scope=n AND (state<>'PRESENT' OR observed_at<clock_timestamp()-interval '300 seconds')) THEN RETURN jsonb_build_object('status','COPY_OBSERVATION_REQUIRED');END IF;
 SELECT * INTO r FROM retention_cleanup.reviews WHERE scope=n AND action=a;
 IF r.scope IS NULL THEN RETURN jsonb_build_object('status','REVIEW_REQUIRED');END IF;
 IF r.epoch IS DISTINCT FROM s.epoch OR r.inventory_hash IS DISTINCT FROM s.inventory_hash OR r.policy_hash IS DISTINCT FROM cfg.policy_hash THEN RETURN jsonb_build_object('status','STALE_REVIEW');END IF;
 h=retention_cleanup.scope_snapshot(n,true);
 IF h IS NULL OR h IS DISTINCT FROM r.snapshot_hash THEN RETURN jsonb_build_object('status','ROW_MANIFEST_CHANGED');END IF;
 INSERT INTO retention_cleanup.permits VALUES(pg_backend_pid(),txid_current(),n,a,s.epoch,r.operation) ON CONFLICT DO NOTHING;
 INSERT INTO retention_cleanup.audit(scope,action,actor,review) VALUES(n,'LOCAL_CLEANUP_STARTED',session_user,r.operation);
 RETURN jsonb_build_object('status','ALLOWED_SYNTHETIC_LOCAL_ONLY','epoch',s.epoch,'review',r.operation,'productionDeletion',false);
END $$;

CREATE FUNCTION retention_cleanup.guard_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_cleanup,retention_registry,pg_temp AS $$
DECLARE t record;found_target boolean=false;identity_value text=to_jsonb(OLD)->>'id';permitted boolean;
BEGIN
 PERFORM 1 FROM retention_registry.configuration FOR UPDATE;
 FOR t IN SELECT * FROM retention_cleanup.targets WHERE relation_name=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME AND identity=identity_value ORDER BY scope LOOP
  found_target=true;
  IF EXISTS(SELECT FROM retention_registry.holds WHERE scope=t.scope AND release IS NULL) THEN RAISE EXCEPTION 'RETENTION_HELD' USING ERRCODE='55000';END IF;
  SELECT EXISTS(SELECT FROM retention_cleanup.permits p JOIN retention_registry.scopes s ON s.scope=p.scope
   WHERE p.backend=pg_backend_pid() AND p.transaction=txid_current() AND p.scope=t.scope AND p.epoch=s.epoch AND
    CASE WHEN TG_TABLE_SCHEMA='outbox9d' THEN p.action='PIPELINE_MINIMIZE'
     WHEN TG_TABLE_NAME='users' THEN p.action='ACCOUNT_DELETE' ELSE p.action IN('ACCOUNT_DELETE','SAVED_PLACE_DELETE') END) INTO permitted;
  IF NOT permitted THEN RAISE EXCEPTION 'CURRENT_CLEANUP_PERMIT_REQUIRED' USING ERRCODE='55000';END IF;
 END LOOP;
 IF NOT found_target THEN RAISE EXCEPTION 'CLEANUP_TARGET_INVENTORY_REQUIRED' USING ERRCODE='55000';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION retention_cleanup.queue_provider(n text,target_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_cleanup,pg_temp AS $$
DECLARE p retention_cleanup.permits;
BEGIN
 SELECT * INTO p FROM retention_cleanup.permits WHERE backend=pg_backend_pid() AND transaction=txid_current() AND scope=n AND action='ACCOUNT_DELETE';
 IF p.scope IS NULL OR target_id IS NULL OR length(target_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'CURRENT_CLEANUP_PERMIT_REQUIRED' USING ERRCODE='55000';END IF;
 INSERT INTO retention_cleanup.provider_actions(scope,kind,target,review) VALUES(n,'CLERK_ACCOUNT_DELETE',target_id,p.review) ON CONFLICT DO NOTHING;
 INSERT INTO retention_cleanup.audit(scope,action,actor,review) VALUES(n,'PROVIDER_CLEANUP_PENDING',session_user,p.review);
 RETURN jsonb_build_object('status','WAITING_PROVIDER_REVIEW','executed',false);
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_cleanup FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_cleanup FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_cleanup FROM PUBLIC;
-- Attach only in a reviewed fixture/bootstrap, with explicit row targets.
-- No table/trigger/grant is installed in the application automatically.
