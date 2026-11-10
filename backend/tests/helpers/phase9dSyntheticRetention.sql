-- TEST ONLY. Applied exclusively in fresh disposable synthetic fixtures.
-- This schema is not an application migration or an approved retention policy.
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='retention_test_delete') THEN
    CREATE ROLE retention_test_delete LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE retention_test_hold LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE retention_test_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
CREATE SCHEMA retention_test;
REVOKE ALL ON SCHEMA retention_test FROM PUBLIC;
CREATE TABLE retention_test.policy(singleton boolean PRIMARY KEY CHECK(singleton),synthetic_only boolean NOT NULL CHECK(synthetic_only),approved_test_policy boolean NOT NULL DEFAULT false,version int NOT NULL CHECK(version>0),ttl_seconds int NOT NULL CHECK(ttl_seconds BETWEEN 1 AND 3600),now_at timestamptz NOT NULL);
INSERT INTO retention_test.policy VALUES(true,true,false,1,60,'2026-10-18T00:00:00Z');
CREATE TABLE retention_test.records(id uuid PRIMARY KEY,state text NOT NULL CHECK(state IN('ACTIVE','TERMINAL')),expires_at timestamptz NOT NULL,payload text,commitment text NOT NULL CHECK(commitment~'^[a-f0-9]{64}$'),revision int NOT NULL DEFAULT 1,held boolean NOT NULL DEFAULT false,hold_id uuid,hold_reason text,tombstone boolean NOT NULL DEFAULT false,policy_version int NOT NULL DEFAULT 1);
CREATE TABLE retention_test.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,record_id uuid NOT NULL,actor text NOT NULL,action text NOT NULL,result text NOT NULL,at timestamptz NOT NULL,revision int NOT NULL);
CREATE FUNCTION retention_test.hold(n uuid,operation uuid,reason text,release boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_test,pg_temp AS $$
DECLARE r retention_test.records; result text;
BEGIN
  SELECT * INTO r FROM retention_test.records WHERE id=n FOR UPDATE;
  IF r.id IS NULL OR operation IS NULL OR reason IS DISTINCT FROM 'SYNTHETIC_DISPUTE' THEN RETURN 'INVALID'; END IF;
  IF release THEN
    IF NOT r.held OR r.hold_id IS DISTINCT FROM operation THEN result='RELEASE_DENIED';
    ELSE UPDATE retention_test.records SET held=false,hold_id=NULL,hold_reason=NULL,revision=revision+1 WHERE id=n;result='RELEASED';END IF;
  ELSE
    IF r.tombstone THEN result='ALREADY_PURGED_HOLD_INCOMPLETE';
    ELSIF r.held THEN result=CASE WHEN r.hold_id=operation THEN 'HELD' ELSE 'CONFLICT' END;
    ELSE UPDATE retention_test.records SET held=true,hold_id=operation,hold_reason=reason,revision=revision+1 WHERE id=n;result='HELD';END IF;
  END IF;
  INSERT INTO retention_test.audit(record_id,actor,action,result,at,revision) SELECT n,session_user,CASE WHEN release THEN 'RELEASE' ELSE 'HOLD' END,result,now_at,r.revision FROM retention_test.policy;
  RETURN result;
END $$;
CREATE FUNCTION retention_test.purge(n uuid,expected int,policy_expected int) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_test,pg_temp AS $$
DECLARE r retention_test.records;p retention_test.policy;result text;
BEGIN
  SELECT * INTO p FROM retention_test.policy FOR SHARE;
  SELECT * INTO r FROM retention_test.records WHERE id=n FOR UPDATE;
  IF r.id IS NULL THEN RETURN 'MISSING'; END IF;
  IF NOT p.approved_test_policy OR policy_expected IS DISTINCT FROM p.version OR r.policy_version<>p.version THEN result='POLICY_DENIED';
  ELSIF r.tombstone THEN result='ALREADY_PURGED';
  ELSIF r.revision IS DISTINCT FROM expected THEN result='STALE';
  ELSIF r.held THEN result='HELD';
  ELSIF r.state<>'TERMINAL' THEN result='ACTIVE';
  ELSIF r.expires_at>p.now_at THEN result='NOT_EXPIRED';
  ELSE UPDATE retention_test.records SET payload=NULL,tombstone=true,revision=revision+1 WHERE id=n;result='PURGED';END IF;
  INSERT INTO retention_test.audit(record_id,actor,action,result,at,revision) VALUES(n,session_user,'PURGE',result,p.now_at,r.revision);
  RETURN result;
END $$;
CREATE FUNCTION retention_test.restore_payload(n uuid,v text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,retention_test,pg_temp AS $$
BEGIN
  -- Restore a backup only after authoritative deletion tombstones are reapplied.
  UPDATE retention_test.records SET payload=v WHERE id=n AND NOT tombstone AND commitment=encode(sha256(convert_to(v,'UTF8')),'hex');
  RETURN FOUND;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_test FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_test FROM PUBLIC;
GRANT USAGE ON SCHEMA retention_test TO retention_test_delete,retention_test_hold,retention_test_reader;
GRANT SELECT ON retention_test.records,retention_test.audit,retention_test.policy TO retention_test_reader;
GRANT EXECUTE ON FUNCTION retention_test.purge(uuid,int,int),retention_test.restore_payload(uuid,text) TO retention_test_delete;
GRANT EXECUTE ON FUNCTION retention_test.hold(uuid,uuid,text,boolean) TO retention_test_hold;
