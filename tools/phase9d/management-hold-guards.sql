-- Optional actual-row fencing in disposable schemas. No TTL or deletion API.
-- The controller remains trusted; this does not implement a global hold barrier.
CREATE TABLE retention9d.guarded_rows(
 scope text NOT NULL REFERENCES retention9d.resources(scope),
 relation_name text NOT NULL CHECK(relation_name IN('outbox9d.deliveries','broker9d.requests','shadow9d.work','custody.events')),
 identity text NOT NULL,PRIMARY KEY(scope,relation_name,identity));
CREATE FUNCTION retention9d.guard_retained_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE before_row jsonb=to_jsonb(OLD);after_row jsonb;selected_identity text;r retention9d.resources;
 changed boolean=false;restoring boolean=false;minimizing boolean=false;column_name text;protected text[];
BEGIN
 -- Same lock order as hold(): serialize the local hold decision and mutation.
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 selected_identity=before_row->>TG_ARGV[0];
 IF NOT EXISTS(SELECT FROM retention9d.guarded_rows WHERE relation_name=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME AND guarded_rows.identity=selected_identity) THEN
  IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RETAINED_IDENTITY_DELETE_DISABLED' USING ERRCODE='55000';END IF;
 after_row=to_jsonb(NEW);protected=string_to_array(TG_ARGV[1],',');
 IF after_row->>TG_ARGV[0] IS DISTINCT FROM selected_identity THEN RAISE EXCEPTION 'RETAINED_IDENTITY_CHANGED' USING ERRCODE='55000';END IF;
 FOREACH column_name IN ARRAY protected LOOP
  changed=changed OR (before_row->column_name IS DISTINCT FROM after_row->column_name);
  restoring=restoring OR (before_row->column_name='null'::jsonb AND after_row->column_name IS DISTINCT FROM 'null'::jsonb);
  minimizing=minimizing OR (before_row->column_name IS DISTINCT FROM 'null'::jsonb AND after_row->column_name='null'::jsonb);
 END LOOP;
 FOR r IN SELECT resource.* FROM retention9d.resources resource JOIN retention9d.guarded_rows g USING(scope)
  WHERE g.relation_name=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME AND g.identity=selected_identity ORDER BY resource.scope FOR UPDATE OF resource LOOP
  IF changed AND r.held THEN RAISE EXCEPTION 'RETAINED_RESOURCE_HELD' USING ERRCODE='55000';END IF;
  IF restoring AND r.tombstone THEN RAISE EXCEPTION 'RESTORED_PAYLOAD_QUARANTINED' USING ERRCODE='55000';END IF;
  IF r.terminal AND before_row ? 'status' AND before_row->'status' IS DISTINCT FROM after_row->'status' THEN
   RAISE EXCEPTION 'TERMINAL_RESOURCE_REOPEN_DISABLED' USING ERRCODE='55000';
  END IF;
  IF minimizing THEN
   -- This records an existing cleanup's outcome in the same transaction.
   -- It never changes the original record or authorizes a new deletion path.
   UPDATE retention9d.resources SET tombstone=true WHERE scope=r.scope;
   PERFORM retention9d.audit(NULL,r.scope,'ACTUAL_RECORD_CHANGE','RESTORE_QUARANTINE');
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE FUNCTION retention9d.guard_retained_truncate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
BEGIN
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 IF EXISTS(SELECT FROM retention9d.guarded_rows WHERE relation_name=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME) THEN
  RAISE EXCEPTION 'RETAINED_IDENTITY_TRUNCATE_DISABLED' USING ERRCODE='55000';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON retention9d.guarded_rows FROM PUBLIC;
REVOKE ALL ON FUNCTION retention9d.guard_retained_row(),retention9d.guard_retained_truncate() FROM PUBLIC;
