-- Optional synthetic management safeguards. Not a production migration.
-- No retention duration, payload deletion or operational authority is enabled.
CREATE TABLE retention9d.preservation_barriers(
 scope text PRIMARY KEY REFERENCES retention9d.resources(scope),reference text NOT NULL,
 actor text NOT NULL,epoch bigint NOT NULL,response jsonb NOT NULL,created timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION retention9d.preservation_node() RETURNS text LANGUAGE sql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$ SELECT node FROM retention9d.configuration $$;
CREATE FUNCTION retention9d.preserve_remaining(n text,approval text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
DECLARE r retention9d.resources;prior retention9d.preservation_barriers;result jsonb;
BEGIN
 PERFORM 1 FROM retention9d.configuration FOR UPDATE;
 SELECT * INTO r FROM retention9d.resources WHERE scope=n FOR UPDATE;
 IF r.scope IS NULL OR approval IS NULL THEN RETURN jsonb_build_object('status','INVALID');END IF;
 IF NOT EXISTS(SELECT FROM retention9d.hold_approvals WHERE reference=approval AND scope=n AND NOT release) THEN
  RETURN jsonb_build_object('status','APPROVAL_REQUIRED');END IF;
 SELECT * INTO prior FROM retention9d.preservation_barriers WHERE scope=n;
 IF FOUND THEN RETURN CASE WHEN prior.reference=approval AND prior.actor=session_user THEN prior.response ELSE jsonb_build_object('status','REVIEW_REQUIRED') END;END IF;
 IF (SELECT count(*) FROM retention9d.preservation_barriers)>=(SELECT max_operations FROM retention9d.configuration) THEN
  RETURN jsonb_build_object('status','OPERATION_LIMIT');END IF;
 UPDATE retention9d.resources SET held=true,epoch=epoch+1 WHERE scope=n RETURNING * INTO r;
 UPDATE retention9d.operations SET state='HELD' WHERE scope=n AND state IN('PREPARING','COMMITTING');
 result=jsonb_build_object('status',CASE WHEN r.tombstone THEN 'ERASED_COPY_CONFLICT' ELSE 'PRESERVED' END,
  'scope',n,'node',(SELECT node FROM retention9d.configuration),'reference',approval,'epoch',r.epoch::text,'manualReviewRequired',true);
 INSERT INTO retention9d.preservation_barriers(scope,reference,actor,epoch,response) VALUES(n,approval,session_user,r.epoch,result);
 PERFORM retention9d.audit(NULL,n,'PRESERVE_REMAINING',result->>'status');RETURN result;
END $$;
CREATE FUNCTION retention9d.enforce_preservation_barrier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,retention9d,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT FROM retention9d.preservation_barriers WHERE scope=OLD.scope) AND
  (NOT NEW.held OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.identity IS DISTINCT FROM OLD.identity
   OR NEW.commitment IS DISTINCT FROM OLD.commitment OR NEW.tombstone IS DISTINCT FROM OLD.tombstone) THEN
  RAISE EXCEPTION 'PRESERVATION_MANUAL_REVIEW_REQUIRED' USING ERRCODE='55000';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preservation_barrier BEFORE UPDATE ON retention9d.resources
 FOR EACH ROW EXECUTE FUNCTION retention9d.enforce_preservation_barrier();

CREATE TABLE capacity9d.alert_delivery(
 id uuid PRIMARY KEY,reason text NOT NULL,last_occurrence bigint NOT NULL,
 state text NOT NULL CHECK(state IN('PENDING','IN_FLIGHT','DELIVERED','REVIEW')),
 attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),token uuid,lease_until timestamptz,
 destination text,receipt text,actor text NOT NULL,UNIQUE(reason,last_occurrence));
CREATE FUNCTION capacity9d.queue_alerts() RETURNS int LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE signal capacity9d.signals;added int=0;
BEGIN
 PERFORM 1 FROM capacity9d.configuration FOR UPDATE;
 FOR signal IN SELECT * FROM capacity9d.signals s WHERE s.ack_at IS NULL ORDER BY reason LOOP
  IF NOT EXISTS(SELECT FROM capacity9d.alert_delivery WHERE reason=signal.reason AND last_occurrence=signal.occurrences) THEN
   IF (SELECT count(*) FROM capacity9d.alert_delivery)>=(SELECT max_operations FROM capacity9d.configuration) THEN
    PERFORM capacity9d.signal('ALERT_LEDGER_LIMIT','CRITICAL');EXIT;END IF;
   INSERT INTO capacity9d.alert_delivery(id,reason,last_occurrence,state,actor)
    VALUES(gen_random_uuid(),signal.reason,signal.occurrences,'PENDING',session_user);added=added+1;
  END IF;
 END LOOP;RETURN added;
END $$;
CREATE FUNCTION capacity9d.claim_alert(target text,claim uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
DECLARE r capacity9d.alert_delivery;
BEGIN
 IF target IS NULL OR length(target) NOT BETWEEN 1 AND 100 OR claim IS NULL THEN RETURN NULL;END IF;
 UPDATE capacity9d.alert_delivery SET state='REVIEW' WHERE state='IN_FLIGHT' AND lease_until<clock_timestamp() AND attempts>=3;
 SELECT * INTO r FROM capacity9d.alert_delivery WHERE attempts<3 AND (state='PENDING' OR state='IN_FLIGHT' AND lease_until<clock_timestamp())
  ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE capacity9d.alert_delivery SET state='IN_FLIGHT',attempts=attempts+1,token=claim,
  lease_until=clock_timestamp()+interval '30 seconds',destination=target,actor=session_user WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'reason',r.reason,'occurrence',r.last_occurrence,'attempt',r.attempts,'destination',target);
END $$;
CREATE FUNCTION capacity9d.finish_alert(n uuid,claim uuid,target text,ack text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
BEGIN
 IF ack IS NULL OR length(ack) NOT BETWEEN 1 AND 200 THEN RETURN false;END IF;
 UPDATE capacity9d.alert_delivery SET state='DELIVERED',receipt=ack,lease_until=NULL
 WHERE id=n AND token=claim AND destination=target AND actor=session_user AND state='IN_FLIGHT' AND lease_until>=clock_timestamp();
 RETURN FOUND;
END $$;
CREATE FUNCTION capacity9d.alert_backlog() RETURNS jsonb LANGUAGE sql SECURITY DEFINER
 SET search_path=pg_catalog,capacity9d,pg_temp AS $$
 SELECT jsonb_build_object('unrepresented',(SELECT count(*) FROM capacity9d.signals s WHERE ack_at IS NULL AND NOT EXISTS(
  SELECT FROM capacity9d.alert_delivery d WHERE d.reason=s.reason AND d.last_occurrence=s.occurrences)),
  'review',(SELECT count(*) FROM capacity9d.alert_delivery WHERE state='REVIEW'))
$$;
REVOKE ALL ON retention9d.preservation_barriers,capacity9d.alert_delivery FROM PUBLIC;
REVOKE ALL ON FUNCTION retention9d.preservation_node(),retention9d.preserve_remaining(text,text),retention9d.enforce_preservation_barrier(),
 capacity9d.queue_alerts(),capacity9d.claim_alert(text,uuid),capacity9d.finish_alert(uuid,uuid,text,text),capacity9d.alert_backlog() FROM PUBLIC;
