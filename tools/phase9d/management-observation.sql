-- Optional disposable management extension. No product routine is replaced.
CREATE TABLE capacity9d.observation_policy(
 singleton boolean PRIMARY KEY CHECK(singleton),
 warning_bytes bigint NOT NULL CHECK(warning_bytes>0), critical_bytes bigint NOT NULL CHECK(critical_bytes>=warning_bytes),
 warning_pending bigint NOT NULL CHECK(warning_pending>0), critical_pending bigint NOT NULL CHECK(critical_pending>=warning_pending),
 max_external_sources int NOT NULL CHECK(max_external_sources BETWEEN 1 AND 100),
 max_reservation_age_seconds int NOT NULL CHECK(max_reservation_age_seconds>0));
CREATE TABLE capacity9d.external_sources(
 name text PRIMARY KEY CHECK(length(name) BETWEEN 1 AND 100),
 kind text NOT NULL CHECK(kind IN('LOG','ARTIFACT','BACKUP','OTHER_ALLOCATED')),
 location_reference text NOT NULL CHECK(length(location_reference)>0),
 required boolean NOT NULL DEFAULT true, max_age_seconds int NOT NULL CHECK(max_age_seconds BETWEEN 1 AND 300),
 bytes bigint CHECK(bytes>=0), observed_at timestamptz,
 coverage text NOT NULL CHECK(coverage='DECLARED_NON_OVERLAPPING_BYTES_NOT_GLOBAL_QUOTA'));
CREATE TABLE capacity9d.reconciliation(
 singleton boolean PRIMARY KEY CHECK(singleton),at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN('DISABLED','UNKNOWN','NORMAL','WARNING','CRITICAL')),
 measured_bytes bigint NOT NULL,reserved_bytes bigint NOT NULL,conservative_bytes numeric NOT NULL,
 pending bigint NOT NULL,old_reservations bigint NOT NULL,missing_external jsonb NOT NULL,
 physical_quota_verified boolean NOT NULL);
CREATE FUNCTION capacity9d.record_external(n text,b bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
BEGIN
 IF n IS NULL OR b IS NULL OR b<0 THEN RETURN false;END IF;
 UPDATE capacity9d.external_sources SET bytes=b,observed_at=clock_timestamp() WHERE name=n;
 RETURN FOUND;
END $$;
CREATE FUNCTION capacity9d.reconcile() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE c capacity9d.configuration;p capacity9d.observation_policy;m capacity9d.measurement;
 missing jsonb;external numeric;reserved bigint;old_count bigint;state text;
BEGIN
 SELECT * INTO STRICT c FROM capacity9d.configuration FOR UPDATE;
 SELECT * INTO STRICT p FROM capacity9d.observation_policy;
 SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb) INTO missing FROM capacity9d.external_sources
 WHERE required AND (bytes IS NULL OR observed_at IS NULL OR observed_at>clock_timestamp()
 OR observed_at<clock_timestamp()-make_interval(secs=>max_age_seconds));
 IF (SELECT count(*) FROM capacity9d.external_sources)>p.max_external_sources
 OR NOT EXISTS(SELECT FROM capacity9d.external_sources WHERE required) THEN missing=missing||'"INVENTORY_UNESTABLISHED"'::jsonb;END IF;
 SELECT COALESCE(sum(bytes),0) INTO external FROM capacity9d.external_sources;
 IF external>9223372036854775807 THEN RAISE EXCEPTION 'EXTERNAL_ACCOUNTING_OVERFLOW' USING ERRCODE='22003';END IF;
 UPDATE capacity9d.configuration SET external_complete=missing='[]'::jsonb,external_bytes=external::bigint;
 PERFORM capacity9d.observe();SELECT * INTO STRICT m FROM capacity9d.measurement;
 SELECT COALESCE(sum(bytes),0),count(*) FILTER(WHERE created<clock_timestamp()-make_interval(secs=>p.max_reservation_age_seconds))
 INTO reserved,old_count FROM capacity9d.reservations WHERE status='RESERVED';
 state=CASE WHEN NOT c.enabled THEN 'DISABLED'
 WHEN missing<>'[]'::jsonb OR (c.require_quota AND NOT c.quota_verified) THEN 'UNKNOWN'
 WHEN m.measured_bytes::numeric+reserved>=LEAST(p.critical_bytes,c.budget-c.emergency_reserve) OR m.pending>=p.critical_pending THEN 'CRITICAL'
 WHEN m.measured_bytes::numeric+reserved>=p.warning_bytes OR m.pending>=p.warning_pending OR old_count>0 THEN 'WARNING' ELSE 'NORMAL' END;
 INSERT INTO capacity9d.reconciliation VALUES(true,clock_timestamp(),state,m.measured_bytes,reserved,m.measured_bytes::numeric+reserved,m.pending,old_count,missing,c.quota_verified)
 ON CONFLICT(singleton) DO UPDATE SET at=excluded.at,state=excluded.state,measured_bytes=excluded.measured_bytes,
 reserved_bytes=excluded.reserved_bytes,conservative_bytes=excluded.conservative_bytes,pending=excluded.pending,
 old_reservations=excluded.old_reservations,missing_external=excluded.missing_external,physical_quota_verified=excluded.physical_quota_verified;
 IF state IN('UNKNOWN','WARNING','CRITICAL') THEN PERFORM capacity9d.signal('RECONCILIATION_'||state,CASE WHEN state='WARNING' THEN 'WARNING' ELSE 'CRITICAL' END);END IF;
 RETURN to_jsonb((SELECT r FROM capacity9d.reconciliation r));
END $$;
CREATE FUNCTION capacity9d.admit_observed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE observation jsonb;c capacity9d.configuration;r jsonb;
BEGIN
 SELECT * INTO STRICT c FROM capacity9d.configuration;
 IF NOT c.enabled THEN RETURN NEW;END IF;
 observation=capacity9d.reconcile();
 IF observation->>'state' IN('UNKNOWN','CRITICAL') THEN RAISE EXCEPTION 'OBSERVED_CAPACITY_REFUSED' USING ERRCODE='54000';END IF;
 r=capacity9d.reserve(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME||':'||(to_jsonb(NEW)->>COALESCE(TG_ARGV[0],'id')),c.admission_bytes,'NORMAL');
 IF r->>'status'<>'RESERVED' THEN RAISE EXCEPTION 'OBSERVED_CAPACITY_REFUSED' USING ERRCODE='54000';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON capacity9d.observation_policy,capacity9d.external_sources,capacity9d.reconciliation FROM PUBLIC;
REVOKE ALL ON FUNCTION capacity9d.record_external(text,bigint),capacity9d.reconcile(),capacity9d.admit_observed() FROM PUBLIC;
