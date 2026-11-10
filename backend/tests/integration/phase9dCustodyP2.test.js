import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {p2Catalog,p2Native} from '../helpers/phase9dP2Profile.js';
const state=async stream=>(await stream.inspector.query('SELECT source::text,seq::text,head,deferred FROM custody_lineage.control')).rows[0];
const events=async stream=>(await stream.inspector.query('SELECT seq,event,hash,identity,status,receipt FROM custody_lineage.events ORDER BY seq')).rows;
const append=async(stream,action='P2_COMMITTED')=>(await stream.owner.query('SELECT audit9d.append($1,NULL,$2)',[action,{kind:'synthetic-p2'}]));
const status=async stream=>{
  await stream.inspector.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{return (await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state;}
  finally{await stream.inspector.query('ROLLBACK');}
};
const rollback=async(stream,fn)=>{
  await stream.owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try{return await fn(stream.owner);}finally{await stream.owner.query('ROLLBACK');}
};
const ownerStatus=async client=>(await client.query('SELECT custody_lineage.capture_status() state')).rows[0].state;
const trigger=stream=>stream.service==='source-lineage-v2'?'custody_source_audit':'custody_receiver_audit';
async function boundedAudits(client,count){
  await client.query("INSERT INTO audit9d.events(identity,action,detail) SELECT 'synthetic_p2_observer','P2_LIMIT',jsonb_build_object('ordinal',n) FROM generate_series(1,$1::int) n",[count]);
}
test('P2 committed capture, consistent snapshots and bounded retained-row inspection',async t=>{
  const f=await custodyLineageFixture(),profiling=process.env.CUSTODY_SQL_MODE==='p2-profile';
  const witness={schema:'phase9d-p2-committed-capture-v1',profiling,groups:[],installations:[],routineReplacementOperations:0};
  const check=async(name,fn)=>t.test(name,async()=>{await fn();witness.groups.push(name);});
  try{
    for(const stream of f.streams){
      await stream.owner.query('CREATE EXTENSION IF NOT EXISTS plpgsql_check');
      const settings=(await stream.owner.query("SELECT current_database() database,current_setting('server_version') postgres,current_setting('plpgsql_check.profiler') profiler,(SELECT extversion FROM pg_extension WHERE extname='plpgsql_check') extension")).rows[0];
      assert.equal(settings.profiler,profiling?'on':'off');assert.match(settings.postgres,/^17\.5 /);assert.equal(settings.extension,'2.10');
      if(profiling)await stream.owner.query('SELECT plpgsql_profiler_reset_all()');
    }
    for(const stream of f.streams){
      const entry={service:stream.service,catalogBefore:await p2Catalog(stream.owner),cases:[]};witness.installations.push(entry);
      const group=async(name,fn)=>check(stream.service+' '+name,async()=>{await fn();entry.cases.push(name);});
      await group('catalog and enabled trigger composition',async()=>{
        entry.triggers=(await stream.owner.query("SELECT n.nspname schema,c.relname relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgfoid='custody_lineage.capture()'::regprocedure ORDER BY t.tgname")).rows;
        assert.equal(entry.triggers.length,stream.service==='source-lineage-v2'?2:4);assert.ok(entry.triggers.every(r=>r.tgenabled==='O'));
        for(const row of entry.catalogBefore){assert.equal(row.owner,'shadow9d_owner');assert.equal(row.prosecdef,true);assert.ok(row.proconfig.includes('search_path=pg_catalog, custody_lineage, pg_temp'));}
        assert.equal((await status(stream)).status,'CAPTURE_CONSISTENT');
      });
      await group('INSERT capture commits atomically and rollback leaves no event',async()=>{
        const before=await state(stream);await stream.owner.query('BEGIN');
        try{await append(stream);assert.deepEqual(await state(stream),before);await stream.owner.query('COMMIT');}catch(error){await stream.owner.query('ROLLBACK');throw error;}
        const after=await state(stream);assert.equal(BigInt(after.seq),BigInt(before.seq)+1n);
        const last=(await events(stream)).at(-1);assert.equal(last.event.action,'LOCAL_AUDIT');assert.equal(last.event.actor,'application_transaction');assert.equal(last.hash,commitment(last.event));
        const original=(await stream.owner.query("SELECT encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex') hash FROM audit9d.events a WHERE action='P2_COMMITTED' ORDER BY id DESC LIMIT 1")).rows[0];assert.equal(last.event.sourceHash,original.hash);
        await rollback(stream,async()=>{await append(stream,'P2_ROLLED_BACK');});assert.deepEqual(await state(stream),after);assert.equal((await status(stream)).status,'CAPTURE_CONSISTENT');
      });
      await group('changed UPDATE captures while an unchanged UPDATE does not',async()=>{
        const source=stream.service==='source-lineage-v2',table=source?'outbox9d.deliveries':'shadow9d.work';
        const before=await state(stream);
        await stream.owner.query(source?"UPDATE outbox9d.deliveries SET failure='P2_CHANGED' WHERE id=(SELECT min(id) FROM outbox9d.deliveries)":"UPDATE shadow9d.work SET attempts=attempts+1 WHERE id=(SELECT min(id) FROM shadow9d.work)");
        const after=await state(stream);assert.equal(BigInt(after.seq),BigInt(before.seq)+1n);
        const last=(await events(stream)).at(-1);assert.equal(last.event.action,source?'OUTBOX_CHANGED':'WORK_CHANGED');
        const original=(await stream.owner.query("SELECT encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex') hash FROM "+table+' a ORDER BY id LIMIT 1')).rows[0];assert.equal(last.event.sourceHash,original.hash);
        await stream.owner.query('UPDATE '+table+' SET attempts=attempts WHERE id=(SELECT min(id) FROM '+table+')');assert.deepEqual(await state(stream),after);
      });
      if(stream.service==='receiver-lineage-v2')await group('receiver receipt and recovery INSERT trigger arms retain exact rows',async()=>{
        const before=await state(stream),id=randomUUID(),receipt=randomUUID();
        await stream.owner.query("INSERT INTO transport9d.receipts(logical_key,payload_binding,receipt,work_id) VALUES($1,$2,$3,987654321)",['p2-'+id,'a'.repeat(64),receipt]);
        const accepted=(await events(stream)).at(-1);assert.equal(accepted.event.action,'RECEIPT_ACCEPTED');assert.equal(accepted.event.receipt,receipt);
        const receiptHash=(await stream.owner.query("SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') hash FROM transport9d.receipts r WHERE receipt=$1",[receipt])).rows[0].hash;assert.equal(accepted.event.sourceHash,receiptHash);
        await stream.owner.query("INSERT INTO custody_export.retries(id,seq,actor,expected) VALUES($1,1,'synthetic_p2_operator',3)",[id]);
        const last=(await events(stream)).at(-1);assert.equal(last.event.action,'RECOVERY_AUTHORIZED');
        const original=(await stream.owner.query("SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') hash FROM custody_export.retries r WHERE id=$1",[id])).rows[0];assert.equal(last.event.sourceHash,original.hash);assert.equal(BigInt((await state(stream)).seq),BigInt(before.seq)+2n);
      });
      await group('repeatable-read snapshot survives a concurrent committed capture',async()=>{
        assert.equal((await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state.status,'CONSISTENCY_SNAPSHOT_REQUIRED');
        await stream.inspector.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        let before;try{before=(await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state;await append(stream,'P2_CONCURRENT_COMMIT');assert.deepEqual((await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state,before);}finally{await stream.inspector.query('ROLLBACK');}
        const after=await status(stream);assert.equal(after.status,'CAPTURE_CONSISTENT');assert.equal(after.inspectedRows,before.inspectedRows+1);
        await stream.inspector.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY');try{assert.equal((await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state.status,'CAPTURE_CONSISTENT');}finally{await stream.inspector.query('ROLLBACK');}
      });
      await group('committed omission is detected and later backfill is idempotent observation',async()=>{
        const before=await events(stream);await stream.owner.query('BEGIN');
        try{await stream.owner.query('ALTER TABLE audit9d.events DISABLE TRIGGER '+trigger(stream));await append(stream,'P2_MISSING_CAPTURE');await stream.owner.query('ALTER TABLE audit9d.events ENABLE TRIGGER '+trigger(stream));await stream.owner.query('COMMIT');}catch(error){await stream.owner.query('ROLLBACK');throw error;}
        assert.deepEqual(await events(stream),before);const missing=await status(stream);assert.equal(missing.status,'UNCAPTURED_COMMITTED_SOURCE');assert.equal(missing.missingCommittedRows,1);
        const count=(await stream.owner.query('SELECT custody_lineage.capture_existing() n')).rows[0].n;assert.ok(count>0);
        const backfilled=await events(stream),last=backfilled.at(-1);assert.equal(last.event.actor,'trusted_observer');assert.equal(last.event.action,'LOCAL_AUDIT');assert.equal(backfilled.length,before.length+1);
        assert.equal((await status(stream)).status,'CAPTURE_CONSISTENT');assert.equal((await stream.owner.query('SELECT custody_lineage.capture_existing() n')).rows[0].n,count);assert.deepEqual(await events(stream),backfilled);
      });
      await group('sequence, event source, previous hash and control head mismatches are distinguished',async()=>{
        entry.corruptions=[];
        for(const kind of ['missing-sequence','sequence','source','previous','hash','control-sequence','control-head'])await rollback(stream,async client=>{
          const row=(await events(stream))[0];
          if(kind==='missing-sequence')await client.query('DELETE FROM custody_lineage.events WHERE seq=$1',[row.seq]);
          else if(kind==='hash')await client.query("UPDATE custody_lineage.events SET hash=repeat('f',64) WHERE seq=$1",[row.seq]);
          else if(kind.startsWith('control-'))await client.query(kind==='control-sequence'?'UPDATE custody_lineage.control SET seq=seq+1':"UPDATE custody_lineage.control SET head=repeat('f',64)");
          else{const event={...row.event,[kind]:kind==='sequence'?'999':kind==='source'?randomUUID():'f'.repeat(64)};await client.query('UPDATE custody_lineage.events SET event=$2,hash=$3 WHERE seq=$1',[row.seq,event,commitment(event)]);}
          const result=await ownerStatus(client);assert.equal(result.status,'CAPTURE_GAP');if(kind.startsWith('control-'))assert.equal(result.headMismatch,true);else assert.equal(result.sequence,'1');entry.corruptions.push({kind,result});
        });
        assert.equal((await status(stream)).status,'CAPTURE_CONSISTENT');
      });
      if(stream.service==='source-lineage-v2')await group('source expectation detects an omitted source observation even with a consistent capture chain',async()=>{
        await rollback(stream,async client=>{
          const original=await events(stream),retained=original.filter(r=>r.event.action!=='SOURCE_LINEAGE');assert.ok(retained.length<original.length);
          await client.query('TRUNCATE custody_lineage.events');let previous='0'.repeat(64),sequence=0;
          for(const row of retained){const event={...row.event,sequence:String(++sequence),previous},hash=commitment(event);await client.query('INSERT INTO custody_lineage.events(seq,identity,event,hash) VALUES($1,$2,$3,$4)',[sequence,row.identity,event,hash]);previous=hash;}
          await client.query('UPDATE custody_lineage.control SET seq=$1,head=$2',[sequence,previous]);
          const result=await ownerStatus(client);assert.equal(result.status,'UNCAPTURED_COMMITTED_SOURCE');assert.equal(result.missingCommittedRows,original.length-retained.length);
        });
      });
      await group('emit deduplicates, rejects conflicting identity and records deferred control observations',async()=>{
        await rollback(stream,async client=>{
          const id='p2-'+randomUUID(),original={id,action:'P2_EMIT'},args=['LOCAL_AUDIT',id,'synthetic_owner',original,'trusted_observer'];
          const emit=async values=>(await client.query('SELECT custody_lineage.emit($1,$2,$3,$4,$5) n',values)).rows[0].n;
          const first=await emit(args);assert.equal(await emit(args),first);await client.query('SAVEPOINT conflict');await assert.rejects(emit([...args.slice(0,3),{...original,action:'CONFLICT'},args[4]]),{code:'23514'});await client.query('ROLLBACK TO conflict');
          await client.query('UPDATE custody_lineage.control SET max_events=(SELECT count(*) FROM custody_lineage.events)');await client.query('SAVEPOINT capacity');await assert.rejects(emit(['LOCAL_AUDIT','over-cap',null,{},'trusted_observer']),{code:'54000'});await client.query('ROLLBACK TO capacity');
          const before=(await client.query('SELECT seq::text,head FROM custody_lineage.control')).rows[0];assert.equal(await emit(['LOCAL_AUDIT','control',null,{action:'CONTROL'},'trusted_observer']),null);
          const deferred=(await client.query('SELECT seq::text,head,deferred,last_deferred_hash FROM custody_lineage.control')).rows[0];assert.equal(deferred.seq,before.seq);assert.equal(deferred.head,before.head);assert.equal(deferred.deferred,'1');assert.match(deferred.last_deferred_hash,/^[a-f0-9]{64}$/);assert.equal((await ownerStatus(client)).status,'DEFERRED_CAPTURE');
          await client.query('UPDATE custody_lineage.control SET max_events=10000');await client.query('SAVEPOINT deferred');await assert.rejects(emit(['LOCAL_AUDIT','after-deferred',null,{},'trusted_observer']),{code:'54000'});await client.query('ROLLBACK TO deferred');
        });
        const original=(await stream.owner.query('SELECT max_events,deferred,last_deferred_hash FROM custody_lineage.control')).rows[0],before=await state(stream);
        try{
          await stream.owner.query('UPDATE custody_lineage.control SET max_events=(SELECT count(*) FROM custody_lineage.events)');
          await stream.owner.query("SELECT custody_lineage.emit('LOCAL_AUDIT',$1,NULL,$2,'trusted_observer')",['p2-committed-control-'+randomUUID(),{action:'CONTROL'}]);
          const persisted=await state(stream);assert.equal(persisted.seq,before.seq);assert.equal(persisted.head,before.head);assert.equal(BigInt(persisted.deferred),BigInt(before.deferred)+1n);
          entry.committedDeferredStatus=await status(stream);assert.equal(entry.committedDeferredStatus.status,'DEFERRED_CAPTURE');
        }finally{
          // Restore owned fixture state; this is not a new operator recovery API.
          await stream.owner.query('UPDATE custody_lineage.control SET max_events=$1,deferred=$2,last_deferred_hash=$3',[original.max_events,original.deferred,original.last_deferred_hash]);
        }
      });
      await group('retained committed-row and source expectation limits are explicit',async()=>{
        await rollback(stream,async client=>{
          await client.query('ALTER TABLE audit9d.events DISABLE TRIGGER '+trigger(stream));
          const count=(await client.query('SELECT count(*)::int n FROM custody_lineage.committed_rows()')).rows[0].n;assert.ok(count<1000);await boundedAudits(client,1000-count);
          const exact=await ownerStatus(client);assert.equal(exact.status,stream.service==='source-lineage-v2'?'INSPECTION_LIMIT':'UNCAPTURED_COMMITTED_SOURCE');
          await boundedAudits(client,1);assert.equal((await ownerStatus(client)).status,'INSPECTION_LIMIT');
          await client.query('UPDATE custody_lineage.control SET max_events=10000');await client.query('SAVEPOINT backfill');await assert.rejects(client.query('SELECT custody_lineage.capture_existing()'),{code:'54000'});await client.query('ROLLBACK TO backfill');
        });
      });
      await group('captured-event limit is checked independently of original-row inspection',async()=>{
        await rollback(stream,async client=>{
          const count=(await client.query('SELECT count(*)::int n FROM custody_lineage.events')).rows[0].n;assert.ok(count<1001);await client.query('UPDATE custody_lineage.control SET max_events=10000');
          await client.query("SELECT custody_lineage.emit('LOCAL_AUDIT','p2-limit:'||n,NULL,jsonb_build_object('ordinal',n),'trusted_observer') FROM generate_series(1,$1::int) n",[1001-count]);
          assert.equal((await ownerStatus(client)).status,'INSPECTION_LIMIT');
        });
      });
      entry.catalogAfter=await p2Catalog(stream.owner);assert.deepEqual(entry.catalogAfter,entry.catalogBefore);
      entry.triggersAfter=(await stream.owner.query("SELECT n.nspname schema,c.relname relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgfoid='custody_lineage.capture()'::regprocedure ORDER BY t.tgname")).rows;assert.deepEqual(entry.triggersAfter,entry.triggers);
      if(profiling)entry.native=await p2Native(stream.owner,entry.catalogAfter);
      assert.equal((await status(stream)).status,'CAPTURE_CONSISTENT');
    }
    await check('application financial state and accepted ACK remain unchanged',async()=>{await f.unchanged();});
    assert.equal(witness.groups.length,21);witness.status='PASS';
    await writeFile(join(process.env.CUSTODY_OUTPUT,'p2-'+(profiling?'native-':'behavior-')+'witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{await f.close();}
});
