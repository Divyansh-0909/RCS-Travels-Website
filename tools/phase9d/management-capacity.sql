-- Optional management plane. Not an application migration or production activation.
-- Install only through an explicitly owned controller. No evidence is deleted.
CREATE SCHEMA capacity9d;
REVOKE ALL ON SCHEMA capacity9d FROM PUBLIC;
CREATE TABLE capacity9d.configuration(
 singleton boolean PRIMARY KEY CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 node text NOT NULL CHECK(node IN('source','receiver','custodian')),
 cluster_owner boolean NOT NULL, peer_databases text[] NOT NULL DEFAULT '{}',
 budget bigint NOT NULL CHECK(budget>0), emergency_reserve bigint NOT NULL CHECK(emergency_reserve>=0 AND emergency_reserve<budget),
 admission_bytes bigint NOT NULL CHECK(admission_bytes>0), max_operations int NOT NULL CHECK(max_operations BETWEEN 1 AND 10000),
 stale_seconds int NOT NULL CHECK(stale_seconds BETWEEN 1 AND 300), require_quota boolean NOT NULL DEFAULT true,
 quota_verified boolean NOT NULL DEFAULT false, physical_limit bigint CHECK(physical_limit>0),
 physical_location text NOT NULL,max_pending bigint NOT NULL DEFAULT 1000 CHECK(max_pending>0), external_complete boolean NOT NULL DEFAULT false,
 external_bytes bigint NOT NULL DEFAULT 0 CHECK(external_bytes>=0), max_wal_growth bigint NOT NULL CHECK(max_wal_growth>0));
CREATE TABLE capacity9d.measurement(singleton boolean PRIMARY KEY CHECK(singleton),at timestamptz NOT NULL,
 database_bytes bigint NOT NULL,wal_bytes bigint NOT NULL,temp_bytes bigint NOT NULL,index_bytes bigint NOT NULL,toast_bytes bigint NOT NULL,
 catalog_total bigint NOT NULL,external_bytes bigint NOT NULL,measured_bytes bigint NOT NULL,insert_lsn pg_lsn NOT NULL,wal_generated bigint NOT NULL,pending bigint NOT NULL,
 categories jsonb NOT NULL,coverage text NOT NULL CHECK(coverage='CATALOG_PLUS_DECLARED_EXTERNAL_NOT_VOLUME_QUOTA'));
CREATE TABLE capacity9d.reservations(operation text PRIMARY KEY,actor text NOT NULL,bytes bigint NOT NULL CHECK(bytes>0),
 class text NOT NULL CHECK(class IN('NORMAL','STOP')),status text NOT NULL CHECK(status IN('RESERVED','RELEASED')),created timestamptz NOT NULL);
CREATE TABLE capacity9d.signals(reason text PRIMARY KEY,severity text NOT NULL,first_at timestamptz NOT NULL,last_at timestamptz NOT NULL,
 occurrences bigint NOT NULL,ack_actor text,ack_at timestamptz);
CREATE TABLE capacity9d.global_configuration(singleton boolean PRIMARY KEY CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 budget bigint NOT NULL CHECK(budget>0),reserve_bytes bigint NOT NULL CHECK(reserve_bytes>=0 AND reserve_bytes<budget),max_operations int NOT NULL CHECK(max_operations BETWEEN 1 AND 10000),require_quota boolean NOT NULL DEFAULT true);
CREATE TABLE capacity9d.global_measurement(singleton boolean PRIMARY KEY CHECK(singleton),at timestamptz NOT NULL,measured_bytes bigint NOT NULL CHECK(measured_bytes>=0),quota_verified boolean NOT NULL,nodes jsonb NOT NULL);
CREATE TABLE capacity9d.global_reservations(operation text PRIMARY KEY,actor text NOT NULL,bytes bigint NOT NULL,costs jsonb NOT NULL,status text NOT NULL CHECK(status IN('RESERVED','RELEASED')));
CREATE FUNCTION capacity9d.signal(reason text,severity text) RETURNS void LANGUAGE sql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
 INSERT INTO capacity9d.signals VALUES(reason,severity,clock_timestamp(),clock_timestamp(),1,NULL,NULL)
 ON CONFLICT(reason) DO UPDATE SET last_at=excluded.last_at,occurrences=capacity9d.signals.occurrences+1,ack_actor=NULL,ack_at=NULL
$$;
CREATE FUNCTION capacity9d.observe() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE c capacity9d.configuration;old capacity9d.measurement;db bigint;wal bigint;tmp bigint;idx bigint;toast bigint;tot bigint;lsn pg_lsn;generated bigint;cats jsonb;measured bigint;pending bigint;lineage_pending bigint;
BEGIN
 SELECT * INTO STRICT c FROM capacity9d.configuration FOR UPDATE;
 SELECT * INTO old FROM capacity9d.measurement;
 SELECT COALESCE(sum(pg_database_size(oid)),0) INTO db FROM pg_database
   WHERE CASE WHEN c.cluster_owner THEN datname<>ALL(c.peer_databases) ELSE datname=current_database() END;
 SELECT CASE WHEN c.cluster_owner THEN COALESCE(sum(size),0) ELSE 0 END INTO wal FROM pg_ls_waldir();
 SELECT CASE WHEN c.cluster_owner THEN COALESCE(sum(size),0) ELSE 0 END INTO tmp FROM pg_ls_tmpdir();
 SELECT COALESCE(sum(pg_indexes_size(p.oid)),0),COALESCE(sum(CASE WHEN p.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(p.reltoastrelid) END),0),
   COALESCE(sum(pg_total_relation_size(p.oid)),0),COALESCE(jsonb_object_agg(n.nspname||'.'||p.relname,pg_total_relation_size(p.oid)),'{}')
 INTO idx,toast,tot,cats FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace
 WHERE p.relkind='r' AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%';
 lsn=pg_current_wal_insert_lsn();generated=CASE WHEN old.insert_lsn IS NULL THEN 0 ELSE GREATEST(0,pg_wal_lsn_diff(lsn,old.insert_lsn)) END;
 measured=db+wal+tmp+c.external_bytes;
 IF c.node='source' THEN SELECT count(*) INTO pending FROM outbox9d.deliveries WHERE status IN('PENDING','PROCESSING','RETRYABLE');
 ELSIF c.node='receiver' THEN SELECT (SELECT count(*) FROM broker9d.requests WHERE status='PENDING')+(SELECT count(*) FROM custody_export.events WHERE status<>'ACKED') INTO pending;
 ELSE SELECT count(*) INTO pending FROM custody.events e LEFT JOIN custody.signatures s USING(receipt) WHERE s.receipt IS NULL;END IF;
 IF to_regclass('custody_lineage.events') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM custody_lineage.events WHERE status<>''ACKED''' INTO lineage_pending;pending=pending+lineage_pending;END IF;
 INSERT INTO capacity9d.measurement VALUES(true,clock_timestamp(),db,wal,tmp,idx,toast,tot,c.external_bytes,measured,lsn,generated,pending,cats,'CATALOG_PLUS_DECLARED_EXTERNAL_NOT_VOLUME_QUOTA')
 ON CONFLICT(singleton) DO UPDATE SET at=excluded.at,database_bytes=excluded.database_bytes,wal_bytes=excluded.wal_bytes,temp_bytes=excluded.temp_bytes,
 index_bytes=excluded.index_bytes,toast_bytes=excluded.toast_bytes,catalog_total=excluded.catalog_total,external_bytes=excluded.external_bytes,
 measured_bytes=excluded.measured_bytes,insert_lsn=excluded.insert_lsn,wal_generated=excluded.wal_generated,pending=excluded.pending,categories=excluded.categories;
 IF generated>c.max_wal_growth THEN PERFORM capacity9d.signal('WAL_GROWTH','CRITICAL'); END IF;
 IF tmp>0 THEN PERFORM capacity9d.signal('TEMP_STORAGE','WARNING'); END IF;
 IF old.index_bytes IS NOT NULL AND idx>old.index_bytes THEN PERFORM capacity9d.signal('INDEX_GROWTH','WARNING'); END IF;
 IF old.external_bytes IS NOT NULL AND c.external_bytes>old.external_bytes THEN PERFORM capacity9d.signal('EXTERNAL_GROWTH','WARNING'); END IF;
 IF NOT c.external_complete OR (c.require_quota AND NOT c.quota_verified) THEN PERFORM capacity9d.signal('INFRASTRUCTURE_UNVERIFIED','CRITICAL'); END IF;
 IF measured>=c.budget THEN PERFORM capacity9d.signal('STORAGE_PRESSURE','CRITICAL'); END IF;
 IF pending>=c.max_pending THEN PERFORM capacity9d.signal('BACKLOG_PRESSURE','CRITICAL');END IF;
 RETURN to_jsonb((SELECT m FROM capacity9d.measurement m));
END $$;
CREATE FUNCTION capacity9d.ack_signal(n text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,capacity9d,pg_temp AS $$
BEGIN
 UPDATE capacity9d.signals SET ack_actor=session_user,ack_at=clock_timestamp() WHERE reason=n;
 RETURN FOUND;
END $$;
CREATE FUNCTION capacity9d.global_reserve(op text,costs jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE c capacity9d.global_configuration;m capacity9d.global_measurement;r capacity9d.global_reservations;cost bigint;used bigint;reason text;
BEGIN
 SELECT * INTO STRICT c FROM capacity9d.global_configuration FOR UPDATE;
 IF NOT c.enabled THEN RETURN jsonb_build_object('status','DISABLED');END IF;
 IF jsonb_typeof(costs) IS DISTINCT FROM 'object' OR op IS NULL OR length(op)>150 THEN RETURN jsonb_build_object('status','INVALID');END IF;
 IF costs-ARRAY['source','receiver','custodian']<>'{}' OR (SELECT count(*) FROM jsonb_object_keys(costs))<>3 OR
 EXISTS(SELECT FROM jsonb_each(costs) WHERE jsonb_typeof(value)<>'number' OR value::text!~'^[1-9][0-9]{0,11}$') THEN RETURN jsonb_build_object('status','INVALID');END IF;
 SELECT sum(value::text::bigint) INTO cost FROM jsonb_each(costs);
 SELECT * INTO r FROM capacity9d.global_reservations WHERE operation=op;
 IF FOUND THEN RETURN jsonb_build_object('status',CASE WHEN r.actor=session_user AND r.costs=global_reserve.costs AND r.status='RESERVED' THEN 'RESERVED' ELSE 'CONFLICT' END);END IF;
 SELECT * INTO m FROM capacity9d.global_measurement;
 SELECT COALESCE(sum(bytes),0) INTO used FROM capacity9d.global_reservations WHERE status='RESERVED';
 reason=CASE WHEN m.at IS NULL OR m.at<clock_timestamp()-interval '300 seconds' THEN 'GLOBAL_STALE_MEASUREMENT'
 WHEN c.require_quota AND NOT m.quota_verified THEN 'GLOBAL_INFRASTRUCTURE_UNVERIFIED'
 WHEN (SELECT count(*) FROM capacity9d.global_reservations)>=c.max_operations THEN 'GLOBAL_LEDGER_LIMIT'
 WHEN m.measured_bytes+used+cost>c.budget-c.reserve_bytes THEN 'GLOBAL_CAPACITY_REFUSED' END;
 IF reason IS NOT NULL THEN PERFORM capacity9d.signal(reason,'CRITICAL');RETURN jsonb_build_object('status',reason);END IF;
 INSERT INTO capacity9d.global_reservations VALUES(op,session_user,cost,costs,'RESERVED');RETURN jsonb_build_object('status','RESERVED');
END $$;
CREATE FUNCTION capacity9d.global_release(op text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,capacity9d,pg_temp AS $$
BEGIN
 PERFORM 1 FROM capacity9d.global_configuration FOR UPDATE;
 UPDATE capacity9d.global_reservations SET status='RELEASED' WHERE operation=op AND status='RESERVED';RETURN FOUND;
END $$;
CREATE FUNCTION capacity9d.reserve(op text,cost bigint,kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE c capacity9d.configuration;m capacity9d.measurement;r capacity9d.reservations;used bigint;reason text;
BEGIN
 SELECT * INTO STRICT c FROM capacity9d.configuration FOR UPDATE;
 IF kind NOT IN('NORMAL','STOP') OR kind IS NULL OR cost IS NULL OR cost<=0 OR op IS NULL OR length(op)>200 THEN RETURN jsonb_build_object('status','INVALID'); END IF;
 IF NOT c.enabled THEN RETURN jsonb_build_object('status','DISABLED'); END IF;
 SELECT * INTO r FROM capacity9d.reservations WHERE operation=op;
 IF r.operation IS NOT NULL THEN RETURN jsonb_build_object('status',CASE WHEN r.actor=session_user AND r.bytes=cost AND r.class=kind AND r.status='RESERVED' THEN 'RESERVED' ELSE 'CONFLICT' END); END IF;
 SELECT * INTO m FROM capacity9d.measurement;
 SELECT COALESCE(sum(bytes),0) INTO used FROM capacity9d.reservations WHERE status='RESERVED';
 reason=CASE WHEN m.at IS NULL OR m.at<clock_timestamp()-make_interval(secs=>c.stale_seconds) THEN 'STALE_MEASUREMENT'
 WHEN NOT c.external_complete OR (c.require_quota AND NOT c.quota_verified) THEN 'INFRASTRUCTURE_UNVERIFIED'
 WHEN m.pending>=c.max_pending AND kind='NORMAL' THEN 'BACKLOG_REFUSED'
 WHEN (SELECT count(*) FROM capacity9d.reservations)>=c.max_operations THEN 'LEDGER_LIMIT'
 WHEN m.measured_bytes+used+cost>c.budget-CASE WHEN kind='NORMAL' THEN c.emergency_reserve ELSE 0 END THEN 'CAPACITY_REFUSED' END;
 IF reason IS NOT NULL THEN PERFORM capacity9d.signal(reason,'CRITICAL');RETURN jsonb_build_object('status',reason); END IF;
 INSERT INTO capacity9d.reservations VALUES(op,session_user,cost,kind,'RESERVED',clock_timestamp());
 RETURN jsonb_build_object('status','RESERVED','operation',op,'measured',m.measured_bytes,'reserved',used+cost);
END $$;
CREATE FUNCTION capacity9d.release(op text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,capacity9d,pg_temp AS $$
BEGIN
 PERFORM 1 FROM capacity9d.configuration FOR UPDATE;
 UPDATE capacity9d.reservations SET status='RELEASED' WHERE operation=op AND status='RESERVED';
 RETURN FOUND;
END $$;
CREATE FUNCTION capacity9d.admit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE c capacity9d.configuration;r jsonb;
BEGIN
 SELECT * INTO STRICT c FROM capacity9d.configuration;
 IF NOT c.enabled THEN RETURN NEW;END IF;
 r=capacity9d.reserve(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME||':'||(to_jsonb(NEW)->>'id'),c.admission_bytes,'NORMAL');
 IF r->>'status'<>'RESERVED' THEN RAISE EXCEPTION 'MANAGEMENT_CAPACITY_REFUSED' USING ERRCODE='54000'; END IF;
 RETURN NEW;
END $$;
-- STOP is not attached to the normal admission trigger. Operators can record a
-- STOP reservation separately; exhausting even its reserve is an alert, never
-- permission to erase history or veto the application's existing STOP routine.
REVOKE ALL ON ALL TABLES IN SCHEMA capacity9d FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA capacity9d FROM PUBLIC;
