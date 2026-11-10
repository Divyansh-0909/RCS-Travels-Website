import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {custodyClosureFixture} from '../helpers/phase9dCustodyClosureFixture.js';
import {p7Native} from '../helpers/phase9dP7Profile.js';
import {p7Catalog} from '../helpers/phase9dP7Catalog.js';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
import {durableReceipt} from '../../../tools/phase9d/closure-keys.mjs';
import {commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {verifyAndAcknowledge} from '../../../tools/phase9d/custody-delivery.mjs';
import {custodyStatus} from '../../../tools/phase9d/closure-status.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const scalar=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0].value;
test('P7 unprofiled cleanup pressure and installed database metadata',async t=>{
  const profiling=process.env.CUSTODY_SQL_MODE==='p7-profile-safe';
  const f=await custodyClosureFixture(),clients=[],witness={schema:'phase9d-p7-behavior-v1',groups:[],pressure:[],installations:[],denials:[],futurePublic:[],constraintWitnesses:[],liveCalls:0,fakeAnalystCalls:0,routineReplacementOperations:0};let saved=false,request,attempt,probeId=100000;
  const call=(name,args=[],c=f.exec)=>brokerCall(c,name,args);
  const pressure=()=>scalar(f.b,'SELECT custody_export.pressure() value');
  const retained=async()=>(await f.b.query('SELECT seq,local_id,event,hash,status,receipt FROM custody_export.events ORDER BY seq')).rows;
  const group=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();await f.unchanged();witness.groups.push(name);}catch(e){failure=e;throw e;}});if(failure)throw failure;};
  const admission=async(denied)=>{
    await f.b.query('SAVEPOINT p7_admission');
    try{// The positive reserve contract binds session_user as well as effective grants.
      await f.b.query('SET SESSION AUTHORIZATION broker9d_exec');witness.pressureCaller=(await f.b.query('SELECT session_user actor,current_user effective')).rows[0];assert.deepEqual(witness.pressureCaller,{actor:'broker9d_exec',effective:'broker9d_exec'});
      const query=f.b.query('SELECT broker9d.reserve($1) value',[request]);
      if(denied)await assert.rejects(query,e=>e.code==='54000'&&e.message==='AUDIT_BACKPRESSURE');else assert.ok((await query).rows[0].value);
    }finally{await f.b.query('ROLLBACK TO SAVEPOINT p7_admission');}
  };
  const recovered=async()=>{await f.exec.query('BEGIN');try{assert.ok(await call('reserve',[request]));}finally{await f.exec.query('ROLLBACK');}};
  const insert=async({status='PENDING',padding='',observed,plain}={})=>{
    const id=++probeId,event={observed:observed??(await f.b.query('SELECT now_at FROM broker9d.control')).rows[0].now_at.toISOString(),padding};
    await f.b.query('INSERT INTO custody_export.events(seq,local_id,event,hash,status,receipt'+(plain?',p7_capacity':'')+') VALUES($1,$1,$2,$3,$4,$5'+(plain?',$6':'')+')',[id,event,hash(String(id)),status,status==='ACKED'?{}:null,...(plain?[plain]:[])]);return id;
  };
  const boundary=async(field,metric,build)=>{
    const before=await retained(),limits=(await f.b.query('SELECT * FROM custody_export.limits')).rows[0],row={field,metric,configuredLimit:limits[field],observations:[]};
    await f.b.query('BEGIN');
    try{for(const position of ['below','at','above']){await build(position,Number(limits[field]));const p=await pressure();row.observations.push({position,pressure:p});await admission(position!=='below');}
      await f.b.query('SAVEPOINT p7_stop');const c=(await f.b.query('SELECT generation FROM broker9d.control')).rows[0];await f.b.query('SET SESSION AUTHORIZATION broker9d_ops');
      const stop=await call('operate',[randomUUID(),null,'STOP',c.generation,'OPERATOR_STOP'],f.b);assert.equal(stop.status,'APPLIED');await f.b.query('RESET SESSION AUTHORIZATION');assert.ok((await pressure()).retainedCount>=before.length);row.stop='APPLIED';await f.b.query('ROLLBACK TO SAVEPOINT p7_stop');
    }finally{await f.b.query('ROLLBACK');}
    assert.deepEqual(await retained(),before);assert.deepEqual((await f.b.query('SELECT * FROM custody_export.limits')).rows[0],limits);await recovered();row.afterClearing='ADMISSION_RESTORED';witness.pressure.push(row);
  };
  const operate=async(action,id=request,operation=randomUUID())=>{const q=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[id])).rows[0];return call('operate',[operation,id,action,q?.revision??1,action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER'],f.ops);};
  try{
    for(const [name,c,schemas]of [['source',f.a,['public','shadow9d','audit9d','outbox9d']],['receiver',f.b,['shadow9d','audit9d','transport9d','broker9d','custody_export']],['custodian',f.audit,['custody']]]){
      if(profiling)await c.query('CREATE EXTENSION IF NOT EXISTS plpgsql_check');
      const settings=(await c.query("SELECT current_setting('shared_preload_libraries') preload,current_setting('plpgsql_check.profiler',true) profiler")).rows[0];if(profiling)assert.equal(settings.profiler,'on');else assert.notEqual(settings.profiler,'on');if(profiling){assert.ok(settings.preload.includes('plpgsql_check'));assert.equal((await c.query("SELECT current_setting('plpgsql_check.use_lxcache') cache")).rows[0].cache,'off');await c.query('SELECT plpgsql_profiler_reset_all()');}else assert.ok(!settings.preload.includes('plpgsql_check'));
      witness.installations.push({name,schemas,settings,catalogBefore:await p7Catalog(c,schemas)});
    }
    request=await f.register(0);assert.ok(request);witness.limits=(await f.b.query('SELECT * FROM custody_export.limits')).rows[0];witness.brokerConfiguration=(await f.b.query('SELECT * FROM broker9d.configuration')).rows;witness.sourceConfiguration=(await f.a.query('SELECT enabled,version FROM outbox9d.configuration')).rows;
    assert.deepEqual(witness.limits,{singleton:true,max_unacknowledged:'100',max_payload_bytes:'131072',max_review:'25',max_review_age_seconds:'86400',max_storage_bytes:'10485760'});
    await group('default unacknowledged count below at and above admission threshold',async()=>{
      let count=1;await boundary('max_unacknowledged','unacknowledgedCount',async(pos,limit)=>{const target=limit+({below:-1,at:0,above:1}[pos]);while(count<target){await insert();count++;}assert.equal((await pressure()).unacknowledgedCount,target);});
    });
    await group('default retained payload byte boundary without queue count saturation',async()=>{
      let last;await boundary('max_payload_bytes','pendingBytes',async(pos,limit)=>{
        const target=limit+({below:-1,at:0,above:1}[pos]);let p=await pressure();
        while(target-p.pendingBytes>1900){last=await insert({padding:'x'.repeat(1700)});p=await pressure();}
        const observed=(await f.b.query('SELECT now_at FROM broker9d.control')).rows[0].now_at.toISOString();
        if(!last||pos==='below'){
          let remaining=target-p.pendingBytes;const header=await scalar(f.b,"SELECT pg_column_size(jsonb_build_object('observed',$1::text,'padding','')) value",[observed]);
          if(remaining<header){await f.b.query("UPDATE custody_export.events SET event=jsonb_set(event,'{padding}',to_jsonb(left(event->>'padding',length(event->>'padding')-100))) WHERE seq=$1",[last]);remaining=target-(await pressure()).pendingBytes;}
          last=await insert({observed,padding:'x'.repeat(remaining-header)});
        }else await f.b.query("UPDATE custody_export.events SET event=jsonb_set(event,'{padding}',to_jsonb((event->>'padding')||'x')) WHERE seq=$1",[last]);
        p=await pressure();assert.equal(p.pendingBytes,target);assert.ok(p.unacknowledgedCount<100);
      });
    });
    await group('default REVIEW count boundary separately from age and pending bytes',async()=>{
      let n=0;await boundary('max_review','reviewCount',async(pos,limit)=>{const target=limit+({below:-1,at:0,above:1}[pos]);while(n<target){await insert({status:'REVIEW'});n++;}const p=await pressure();assert.equal(p.reviewCount,target);assert.equal(p.reviewAgeSeconds,0);});
    });
    await group('default observed REVIEW age below at and above controlled clock limit',async()=>{
      let id;await boundary('max_review_age_seconds','reviewAgeSeconds',async(pos,limit)=>{
        const age=limit+({below:-1,at:0,above:1}[pos]),now=(await f.b.query('SELECT now_at FROM broker9d.control')).rows[0].now_at;
        const observed=new Date(now.getTime()-age*1000).toISOString();if(!id)id=await insert({status:'REVIEW',observed});else await f.b.query("UPDATE custody_export.events SET event=jsonb_set(event,'{observed}',to_jsonb($2::text)) WHERE seq=$1",[id,observed]);assert.equal((await pressure()).reviewAgeSeconds,age);
      });
    });
    await group('default relation storage boundary bounded rollback and dead-space compaction',async()=>{
      const before=await retained(),limits=(await f.b.query('SELECT * FROM custody_export.limits')).rows[0],limit=Number(limits.max_storage_bytes),row={field:'max_storage_bytes',metric:'storageBytes',configuredLimit:limits.max_storage_bytes,observations:[]};
      await f.b.query('BEGIN');try{
        await f.b.query('ALTER TABLE custody_export.events ADD COLUMN p7_capacity text;ALTER TABLE custody_export.events ALTER COLUMN p7_capacity SET STORAGE PLAIN');
        row.observations.push({position:'below',pressure:await pressure()});assert.ok((await pressure()).storageBytes<limit);await admission(false);
        let p=await pressure(),n=0;while(p.storageBytes<limit){const batch=p.storageBytes<limit-262144?40:1;for(let i=0;i<batch;i++){assert.ok(n++<1600,'P7_STORAGE_ROW_BOUND');await insert({status:'ACKED',plain:'x'.repeat(6000)});}p=await pressure();}
        row.exactThresholdRepresentable=p.storageBytes===limit;row.observations.push({position:row.exactThresholdRepresentable?'at':'first-crossing',pressure:p});await admission(true);
        await insert({status:'ACKED',plain:'x'.repeat(6000)});row.observations.push({position:'above',pressure:await pressure()});await admission(true);
        await f.b.query('SAVEPOINT p7_stop');const c=(await f.b.query('SELECT generation FROM broker9d.control')).rows[0];await f.b.query('SET SESSION AUTHORIZATION broker9d_ops');assert.equal((await call('operate',[randomUUID(),null,'STOP',c.generation,'OPERATOR_STOP'],f.b)).status,'APPLIED');await f.b.query('ROLLBACK TO SAVEPOINT p7_stop');row.stop='APPLIED';row.probeRows=n+1;
      }finally{await f.b.query('ROLLBACK');}
      assert.deepEqual(await retained(),before);row.afterRollback=await pressure();
      // Reclaim only dead pages from the rolled-back bounded probe, retaining all committed rows.
      await f.b.query('VACUUM (FULL, ANALYZE) custody_export.events');row.afterCompaction=await pressure();assert.ok(row.afterCompaction.storageBytes<limit);assert.deepEqual(await retained(),before);await recovered();row.afterClearing='ADMISSION_RESTORED';assert.deepEqual((await f.b.query('SELECT * FROM custody_export.limits')).rows[0],limits);witness.pressure.push(row);
    });
    await group('unfinished foreign and duplicate broker cleanup obey existing operation identities',async()=>{
      assert.equal((await operate('CLEAN')).status,'INVALID');assert.equal((await operate('CLEAN',randomUUID())).status,'STALE');
      attempt=await call('reserve',[request]);assert.ok(attempt);assert.equal(await call('admit',[attempt.id,attempt.token]),true);assert.equal(await call('begin_send',[attempt.id,attempt.token]),true);assert.equal(await call('unknown',[attempt.id,attempt.token]),true);
      witness.beforeCleanup=await retained();assert.equal((await operate('TERMINATE')).status,'APPLIED');
      const operation=randomUUID(),q=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[request])).rows[0],args=[operation,request,'CLEAN',q.revision,'RETENTION_MINIMIZATION'];
      const first=await call('operate',args,f.ops);assert.equal(first.status,'APPLIED');const snapshot=await retained();assert.deepEqual(await call('operate',args,f.ops),first);assert.deepEqual(await retained(),snapshot);
      const r=await f.row(attempt.id);assert.equal(r.request.payload,null);assert.equal(r.request.cleaned,true);assert.equal(r.attempt.usage_state,'UNKNOWN');assert.equal(await f.register(0),request);assert.equal(await call('reserve',[request]),null);witness.tombstone={request:r.request.id,work:r.request.work_id,dispatch:r.attempt.dispatch_id,evidenceHash:r.request.evidence_hash,status:r.request.status};
    });
    await group('late authenticated cost and exact duplicate retain cleaned terminal spending',async()=>{
      const receipt=await f.receipt(attempt.id);assert.equal(await call('reconcile',[JSON.stringify(receipt)],f.reconciler),'ACCEPTED');assert.equal(await call('reconcile',[JSON.stringify(receipt)],f.reconciler),'DUPLICATE');
      const r=await f.row(attempt.id);assert.equal(r.request.status,'TERMINAL');assert.equal(r.request.payload,null);assert.equal(r.attempt.usage_state,'CONFIRMED');assert.equal(await call('guard_input',[attempt.id,attempt.token],f.guard),null);assert.equal(await call('begin_send',[attempt.id,attempt.token]),false);
      witness.accounting=await call('accounting',[],f.ops);assert.equal(witness.accounting.heldMinor,5);assert.equal(witness.accounting.confirmedMinor,2);assert.equal(await scalar(f.b,'SELECT count(*)::int value FROM broker9d.results'),0);
    });
    await group('terminal transport receipt cleanup duplicate and delayed ACK never recreate source work',async()=>{
      const connect=async(role,database,owner)=>{const password=randomUUID();await owner.query((await owner.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);const u=new URL(f.uri(database,'shadow9d_exporter'));u.username=role;u.password=password;const c=new pg.Client({connectionString:u.toString(),statement_timeout:5000});c.on('error',()=>{});await c.connect();clients.push(c);assert.equal(await scalar(c,'SELECT current_user value'),role);return c;};
      const capture=await connect('shadow9d_capture',f.receiver.name,f.b),ops=await connect('shadow9d_ops',f.source.name,f.a),exporter=await connect('shadow9d_exporter',f.source.name,f.a);
      const original=f.message(0).payload,delivery=(await f.a.query("SELECT id,token FROM outbox9d.deliveries WHERE payload->>'key'=$1",[original.key])).rows[0];
      const terminal=await scalar(capture,'SELECT transport9d.receive($1) value',[original]);assert.equal(terminal.body.status,'MANUAL_REVIEW');assert.equal(terminal.body.receipt,f.payloads[0].receipt.body.receipt);
      assert.equal(await scalar(ops,'SELECT outbox9d.remote_delete_payload($1,$2) value',[delivery.id,f.payloads[0].receipt]),false);assert.equal(await scalar(ops,'SELECT outbox9d.remote_delete_payload($1,$2) value',[delivery.id,{...terminal,mac:'0'.repeat(64)}]),false);
      assert.equal(await scalar(ops,'SELECT outbox9d.remote_delete_payload($1,$2) value',[delivery.id,terminal]),true);assert.equal(await scalar(ops,'SELECT outbox9d.remote_delete_payload($1,$2) value',[delivery.id,terminal]),false);
      assert.equal(await scalar(exporter,'SELECT outbox9d.remote_ack($1,$2,$3) value',[delivery.id,delivery.token,f.payloads[0].receipt]),false);
      assert.deepEqual(await scalar(capture,'SELECT transport9d.receive($1) value',[original]),terminal);assert.equal(await scalar(f.a,'SELECT payload value FROM outbox9d.deliveries WHERE id=$1',[delivery.id]),null);
      assert.equal(await scalar(f.b,'SELECT snapshot value FROM shadow9d.work WHERE id=$1',[terminal.body.workId]),null);assert.equal(await f.register(0),request);witness.transport={delivery:delivery.id,receipt:terminal,duplicateCleanup:false,lateSourceAck:false};
    });
    await group('delayed independent custody ACK after cleanup retains exact capture and receipt identities',async()=>{
      const before=await retained(),proofs=[];
      for(const row of before){const frame=await f.frame(row.seq);assert.equal(commitment(frame.event),row.hash);const body=await scalar(f.ingest,'SELECT custody.ingest($1) value',[frame]),receipt=await durableReceipt(f.signer,body,new Map([[f.keyId,f.keys.privateKey]]));
        assert.equal(await verifyAndAcknowledge(f.verifier,receipt,frame.event,(await f.registry()).keys),true);assert.equal((await custodyStatus(f.sourceInspector,f.inspector,row.seq,await f.registry())).status,'INDEPENDENTLY_VERIFIED');assert.deepEqual(await scalar(f.ingest,'SELECT custody.ingest($1) value',[frame]),body);proofs.push({sequence:row.seq,hash:row.hash,receipt});}
      const after=await retained(),identity=r=>({seq:r.seq,local_id:r.local_id,event:r.event,hash:r.hash});assert.deepEqual(after.map(identity),before.map(identity));assert.ok(after.every(r=>r.status==='ACKED'));assert.equal(await f.register(0),request);assert.equal(await call('reserve',[request]),null);witness.independentReceipts=proofs;
    });
    await group('real role denials and constrained metadata refuse unauthorized maintenance',async()=>{
      for(const [c,sql]of [[f.exec,'UPDATE custody_export.limits SET max_unacknowledged=1000'],[f.exec,'DELETE FROM custody_export.events'],[f.signer,'DELETE FROM custody.signatures'],[f.ingest,'SELECT * FROM custody.keys'],[f.verifier,'SET ROLE custody_source_owner']]){await assert.rejects(c.query(sql),{code:'42501'});witness.denials.push({sqlstate:'42501',operation:sql.split(' ')[0]});}
      for(const sql of ["INSERT INTO custody_export.events(seq,local_id,event,hash,attempts) VALUES(900001,900001,'{}',repeat('1',64),4)","UPDATE custody_export.limits SET max_review=0","UPDATE custody_export.keys SET status='UNKNOWN'"]){await f.b.query('BEGIN');try{await assert.rejects(f.b.query(sql),{code:'23514'});}finally{await f.b.query('ROLLBACK');}}
      await f.audit.query('BEGIN');try{await assert.rejects(f.audit.query("INSERT INTO custody.signatures VALUES(gen_random_uuid(),repeat('A',86)||'==')"),{code:'23503'});}finally{await f.audit.query('ROLLBACK');}
      for(const [c,label,sql,code]of [[f.audit,'key primary identity',"INSERT INTO custody.keys SELECT key_id,public_key,epoch,status FROM custody.keys",'23505'],[f.audit,'unique signing epoch',"INSERT INTO custody.keys SELECT repeat('b',64),public_key,epoch,'RETIRED' FROM custody.keys",'23505'],[f.b,'retained event commitment',"INSERT INTO custody_export.events(seq,local_id,event,hash) SELECT 900002,900002,'{}',hash FROM custody_export.events WHERE seq=1",'23505']]){await c.query('BEGIN');try{await assert.rejects(c.query(sql),{code});witness.constraintWitnesses.push({label,sqlstate:code});}finally{await c.query('ROLLBACK');}}
      const owners={shadow9d:'shadow9d_owner',audit9d:'shadow9d_auditor',outbox9d:'shadow9d_owner',transport9d:'shadow9d_owner',broker9d:'broker9d_owner',custody_export:'custody_source_owner',custody:'custody_owner'};
      for(const i of witness.installations){assert.ok(i.catalogBefore.constraints.some(r=>r.contype==='p'));for(const r of i.catalogBefore.routines.filter(r=>!r.extension_member&&r.schema!=='public')){assert.equal(r.owner,owners[r.schema],r.signature);assert.equal(r.public_execute,false,r.signature);assert.ok(r.proconfig?.some(s=>s.startsWith('search_path=pg_catalog, ')),r.signature);if(/\.(?:remote_delete_payload|delete_payload|broker_payload_cleanup|admit_analysis|ack)\(/.test(r.signature))assert.equal(r.prosecdef,true);}assert.ok(i.catalogBefore.roles.every(r=>!r.rolsuper&&!r.rolinherit&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolbypassrls));}
      assert.equal(witness.installations.find(i=>i.name==='source').catalogBefore.policies.filter(r=>r.policyname.startsWith('shadow9d_export_source_')).length,2);
      const triggers=witness.installations.find(i=>i.name==='receiver').catalogBefore.triggers;
      for(const name of ['custody_analysis_registration','custody_analysis_reservation','custody_analysis_dispatch','custody_analysis_send'])assert.equal(triggers.find(r=>r.name===name)?.tgenabled,'O');
    });
    await group('future routine defaults remain private without persistent grants or APIs',async()=>{
      for(const [c,owner,schema,role]of [[f.a,'shadow9d_owner','shadow9d','shadow9d_exporter'],[f.a,'shadow9d_auditor','audit9d','shadow9d_inspector'],[f.b,'broker9d_owner','broker9d','broker9d_exec'],[f.b,'custody_source_owner','custody_export','custody_sender'],[f.audit,'custody_owner','custody','custody_inspector']]){
        await c.query('BEGIN');try{await c.query('SET LOCAL ROLE '+owner);await c.query('CREATE FUNCTION '+schema+'.p7_future_probe() RETURNS int LANGUAGE sql AS \'SELECT 1\'');await c.query('RESET ROLE');assert.equal(await scalar(c,"SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') value",[schema+'.p7_future_probe()']),true);await c.query('SAVEPOINT denied');await c.query('SET LOCAL ROLE '+role);await assert.rejects(c.query('SELECT '+schema+'.p7_future_probe()'),{code:'42501'});await c.query('ROLLBACK TO SAVEPOINT denied');witness.futurePublic.push({owner,schema,role,publicExecute:false,sqlstate:'42501'});}finally{await c.query('ROLLBACK');}
      }
    });
    await group('authorized sender missing frame leaves retained history unchanged',async()=>{
      const before=await retained();assert.equal(await scalar(f.sender,'SELECT custody_export.frame(900000000000000) value'),null);assert.deepEqual(await retained(),before);
    });
    await group('final catalogs application schema budgets and signing metadata unchanged',async()=>{
      for(const i of witness.installations){const c={source:f.a,receiver:f.b,custodian:f.audit}[i.name];i.catalogAfter=await p7Catalog(c,i.schemas);assert.deepEqual(i.catalogAfter,i.catalogBefore);}
      assert.deepEqual((await f.b.query('SELECT * FROM custody_export.limits')).rows[0],witness.limits);assert.deepEqual((await f.b.query('SELECT * FROM broker9d.configuration')).rows,witness.brokerConfiguration);assert.deepEqual((await f.a.query('SELECT enabled,version FROM outbox9d.configuration')).rows,witness.sourceConfiguration);witness.publicKeys=(await f.audit.query('SELECT key_id,public_key,epoch,status FROM custody.keys')).rows;assert.equal(witness.publicKeys.length,1);assert.equal(witness.publicKeys[0].status,'ACTIVE');witness.finalRetained=await retained();
    });
    if(profiling){witness.native=[];for(const i of witness.installations.filter(i=>i.name!=='custodian'))witness.native.push({installation:i.name,routines:await p7Native({source:f.a,receiver:f.b}[i.name],i.catalogBefore.routines,i.name)});}
    witness.profiling=profiling;witness.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,(profiling?'p7-native-witness-':'p7-witness-')+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});saved=true;
  }finally{if(!saved){witness.status='FAIL_OR_INCOMPLETE';await writeFile(join(process.env.CUSTODY_OUTPUT,'p7-failed-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});}await Promise.allSettled(clients.map(c=>c.end()));await f.close();}
});
