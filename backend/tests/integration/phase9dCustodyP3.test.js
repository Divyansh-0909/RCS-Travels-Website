import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import pg from 'pg';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {p3Catalog,p3Native} from '../helpers/phase9dP3Profile.js';
import {commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {custodyStatus} from '../../../tools/phase9d/closure-status.mjs';
const rows=async stream=>(await stream.inspector.query('SELECT to_jsonb(e) state FROM '+stream.schema+'.events e ORDER BY seq')).rows.map(r=>r.state);
const next=async stream=>(await stream.sender.query('SELECT '+stream.schema+'.next() frame')).rows[0].frame;
const immutable=row=>({seq:String(row.seq),event:row.event,hash:row.hash,identity:row.identity??null,localId:row.local_id??null});
test('P3 ordered delivery, sender replacement and bounded authorized recovery',async t=>{
  const f=await custodyLineageFixture(),children=[],profiling=process.env.CUSTODY_SQL_MODE==='p3-profile';let competitor;
  const witness={schema:'phase9d-p3-ordered-recovery-v1',profiling,groups:[],installations:[],publicProofs:[],routineReplacementOperations:0};
  const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();witness.groups.push(name);}catch(error){failure=error;throw error;}});if(failure)throw failure;};
  const launch=async stream=>{
    const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.NODE_ENV='test';env.NODE_OPTIONS='--max-old-space-size=128';
    const child=fork(fileURLToPath(new URL('../helpers/phase9dP3Sender.mjs',import.meta.url)),[],{cwd:process.cwd(),env,execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    const exited=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));children.push({child,exited});
    const result=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('P3_SENDER_DEADLINE'));},8000);child.once('message',value=>{clearTimeout(timer);ok(value);});child.once('error',error=>{clearTimeout(timer);fail(error);});child.once('exit',()=>{clearTimeout(timer);fail(Error('P3_SENDER_EARLY_EXIT'));});child.send({schema:stream.schema,uri:stream.uri()});});
    assert.equal(result.status,'SELECTED');return {child,exited,result};
  };
  const retry=async(client,operation,n,expected)=>(await client.query('SELECT custody_export.retry($1,$2,$3) ok',[operation,n,expected])).rows[0].ok;
  try{
    // Reuse the already established safety fixture's competing-operator role.
    const role='custody_recovery_competitor',password=randomUUID();
    await f.b.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;GRANT USAGE ON SCHEMA custody_export TO '+role+';GRANT EXECUTE ON FUNCTION custody_export.retry(uuid,bigint,int) TO '+role);
    await f.b.query((await f.b.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) sql",[role,password])).rows[0].sql);
    const uri=new URL(f.uri(f.receiver.name,'broker9d_exec'));uri.username=role;uri.password=password;competitor=new pg.Client({connectionString:uri.toString(),connectionTimeoutMillis:2000,statement_timeout:3000});competitor.on('error',()=>{});await competitor.connect();
    await f.register(0);assert.equal((await f.control('STOP')).status,'APPLIED');assert.equal((await f.control('RESUME')).status,'APPLIED');
    for(const stream of f.streams)for(let n=1;n<=2;n++)await stream.owner.query("SELECT audit9d.append('P3_QUEUE_SEED',NULL,$1)",[{kind:'synthetic-p3',ordinal:n}]);
    const streams=[{service:'broker-receiver-v1',schema:'custody_export',lineage:false,owner:f.b,sender:f.sender,inspector:f.sourceInspector,verifier:f.verifier,role:'custody_sender',uri:()=>f.sandboxUri('custody_sender')},...f.streams.map(stream=>({...stream,schema:'custody_lineage',lineage:true,uri:()=>stream.sandboxUri(stream.role)}))];
    for(const client of [f.a,f.b]){
      await client.query('CREATE EXTENSION IF NOT EXISTS plpgsql_check');assert.equal((await client.query("SELECT current_setting('plpgsql_check.profiler') enabled")).rows[0].enabled,profiling?'on':'off');if(profiling)await client.query('SELECT plpgsql_profiler_reset_all()');
    }
    const keys=new Map([[f.keyId,f.keys.privateKey]]),registry=await f.registry();
    const acknowledge=async(stream,frame)=>{
      const body=(await f.ingest.query('SELECT custody.ingest($1) body',[frame])).rows[0].body,receipt=await durableReceipt(f.signer,body,keys);
      assert.equal(historicalVerification(receipt,frame.event,registry).currentlyTrusted,true);
      assert.equal((await stream.verifier.query('SELECT '+stream.schema+'.ack($1,$2,$3) ok',[frame.event.sequence,commitment(frame.event),receipt])).rows[0].ok,true);
      assert.equal((await custodyStatus(stream.inspector,f.inspector,frame.event.sequence,registry,{lineage:stream.lineage})).status,'INDEPENDENTLY_VERIFIED');return receipt;
    };
    for(const stream of streams){
      const record={service:stream.service,schema:stream.schema,catalogBefore:await p3Catalog(stream.owner,stream.schema),restarts:[]};witness.installations.push(record);
      let original,older,target,held;
      await check(stream.service+' selects the oldest pending event through its restricted sender',async()=>{
        original=await rows(stream);assert.ok(original.length>=3);record.originalCommitments=original.map(immutable);
        const identity=(await stream.sender.query('SELECT session_user actor,current_user effective,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=session_user')).rows[0];assert.equal(identity.actor,stream.role);assert.equal(identity.effective,stream.role);for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolbypassrls'])assert.equal(identity[key],false);record.senderIdentity=identity;
        assert.equal((await stream.sender.query('SELECT has_table_privilege(current_user,$1,\'UPDATE\') writable',[stream.schema+'.events'])).rows[0].writable,false);
        const frame=await next(stream);assert.equal(frame.event.sequence,String(original[0].seq));const receipt=await acknowledge(stream,frame);record.olderReceipt=receipt;older=(await rows(stream))[0];assert.equal(older.status,'ACKED');target=original[1];
        for(const catalog of record.catalogBefore){assert.equal(catalog.prosecdef,true);assert.equal(catalog.owner,stream.lineage?'shadow9d_owner':'custody_source_owner');assert.ok(catalog.proconfig.includes('search_path=pg_catalog, '+stream.schema+', pg_temp'));}
      });
      await check(stream.service+' preserves the same event across sender death, replacement and three-attempt REVIEW',async()=>{
        const first=await launch(stream);assert.equal(first.result.actor,stream.role);assert.equal(first.result.frame.event.sequence,String(target.seq));held=first.result.frame;
        assert.equal(first.child.kill('SIGKILL'),true);const killed=await first.exited;assert.equal(killed.signal,'SIGKILL');
        const second=await launch(stream);assert.notEqual(second.result.pid,first.result.pid);assert.deepEqual(second.result.frame,held);second.child.send({stop:true});assert.equal((await second.exited).code,0);
        assert.deepEqual(await next(stream),held);const before=await rows(stream);assert.equal(before[1].attempts,3);assert.equal(before[1].status,'REVIEW');assert.equal(before[2].attempts,0);assert.equal(before[2].status,'PENDING');
        assert.equal(await next(stream),null);assert.deepEqual(await rows(stream),before);assert.deepEqual(immutable(before[1]),immutable(target));assert.deepEqual(before[0],older);
        record.restarts.push({firstPid:first.result.pid,replacementPid:second.result.pid,killed,originalCommitment:target.hash,attempts:3,laterAttempts:0});
      });
      if(!stream.lineage){
        const n=target.seq,operation=randomUUID(),history=async()=>(await f.b.query('SELECT id,seq::text,actor,expected FROM custody_export.retries ORDER BY id')).rows;
        const exhaust=async()=>{for(let attempt=1;attempt<=3;attempt++){assert.deepEqual(await next(stream),held);const row=(await rows(stream))[1];assert.equal(row.attempts,attempt);assert.equal(row.status,attempt===3?'REVIEW':'PENDING');}assert.equal(await next(stream),null);};
        await check('export retry denies sender, stale attempts, missing/non-review rows and pending-cap saturation',async()=>{
          const before=await rows(stream);await assert.rejects(f.sender.query('SELECT custody_export.retry($1,$2,3)',[randomUUID(),n]),{code:'42501'});
          assert.equal(await retry(f.operator,randomUUID(),n,2),false);assert.equal(await retry(f.operator,randomUUID(),Number(n)+10000,3),false);assert.equal(await retry(f.operator,randomUUID(),original[2].seq,3),false);
          const cap=(await f.b.query('SELECT max_pending FROM custody_export.control')).rows[0].max_pending;
          try{await f.b.query("UPDATE custody_export.control SET max_pending=(SELECT count(*) FROM custody_export.events WHERE status='PENDING')");assert.equal(await retry(f.operator,randomUUID(),n,3),false);}finally{await f.b.query('UPDATE custody_export.control SET max_pending=$1',[cap]);}
          assert.deepEqual(await rows(stream),before);assert.equal((await history()).length,0);
        });
        await check('export authorized recovery is UUID-idempotent and fences conflicting identity or actor reuse',async()=>{
          assert.equal(await retry(f.operator,operation,n,3),true);const before=await rows(stream),audit=await history();assert.equal(before[1].attempts,0);assert.equal(before[1].recoveries,1);assert.equal(before[1].status,'PENDING');assert.equal(audit.length,1);assert.equal(audit[0].actor,'custody_operator');
          assert.equal(await retry(f.operator,operation,n,3),true);assert.equal(await retry(f.operator,operation,n,2),false);assert.equal(await retry(f.operator,operation,original[2].seq,3),false);assert.equal(await retry(competitor,operation,n,3),false);
          assert.deepEqual(await rows(stream),before);assert.deepEqual(await history(),audit);assert.deepEqual(before[0],older);
        });
        await check('two independently authenticated recovery operators commit only one competing transition',async()=>{
          await exhaust();const operations=[randomUUID(),randomUUID()],clients=[f.operator,competitor];
          const actors=await Promise.all(clients.map(async client=>(await client.query('SELECT session_user actor,pg_backend_pid() pid')).rows[0]));assert.notEqual(actors[0].actor,actors[1].actor);assert.notEqual(actors[0].pid,actors[1].pid);
          const results=await Promise.all(clients.map((client,index)=>retry(client,operations[index],n,3)));assert.equal(results.filter(Boolean).length,1);const winner=results.indexOf(true);
          assert.equal((await history()).length,2);assert.equal((await rows(stream))[1].recoveries,2);assert.equal((await rows(stream))[1].attempts,0);
          const operationRow=(await history()).find(row=>row.id===operations[winner]);assert.equal(operationRow.actor,actors[winner].actor);
          record.competingRecovery={actors,winners:1,winner:actors[winner].actor};
        });
        await check('third recovery is the last new transition and preserves earlier receipts/history',async()=>{
          await exhaust();assert.equal(await retry(f.operator,randomUUID(),n,3),true);await exhaust();const before=await rows(stream),audit=await history();
          assert.equal(before[1].recoveries,3);assert.equal(before[1].attempts,3);assert.equal(before[1].status,'REVIEW');assert.equal(audit.length,3);
          assert.equal(await retry(f.operator,randomUUID(),n,3),false);assert.equal(await retry(f.operator,operation,n,3),true);
          assert.deepEqual(await rows(stream),before);assert.deepEqual(await history(),audit);assert.deepEqual(before[0],older);record.recoveryHistory=audit;record.exhaustedState={attempts:3,recoveries:3,status:'REVIEW',duplicateOperationAcknowledgesHistoryOnly:true};
        });
      }
      await check(stream.service+' accepts a verified late receipt then drains later events in chronological order',async()=>{
        const receipt=await acknowledge(stream,held),after=await rows(stream);assert.equal(after[1].status,'ACKED');assert.deepEqual(after[0],older);assert.deepEqual(immutable(after[1]),immutable(target));
        for(const row of original.slice(2)){const frame=await next(stream);assert.equal(frame.event.sequence,String(row.seq));assert.equal(commitment(frame.event),row.hash);await acknowledge(stream,frame);}
        const duplicate=(await f.ingest.query('SELECT custody.ingest($1) body',[held])).rows[0].body;assert.deepEqual(await durableReceipt(f.signer,duplicate,keys),receipt);witness.publicProofs.push({event:held.event,receipt});
      });
      await check(stream.service+' empty queue returns null without deleting retained commitments or receipts',async()=>{
        const before=await rows(stream);assert.ok(before.every(row=>row.status==='ACKED'));assert.equal(await next(stream),null);assert.deepEqual(await rows(stream),before);assert.deepEqual(before.map(immutable),original.map(immutable));assert.deepEqual(before[0],older);
        if(stream.lineage)assert.equal((await stream.owner.query("SELECT to_regprocedure('custody_lineage.retry(uuid,bigint,integer)') routine")).rows[0].routine,null);
        record.finalRows=before;
      });
      record.catalogAfter=await p3Catalog(stream.owner,stream.schema);assert.deepEqual(record.catalogAfter,record.catalogBefore);if(profiling)record.native=await p3Native(stream.owner,record.catalogAfter);
    }
    await check('application observations, receipt protocol and restricted operator authority remain unchanged',async()=>{
      await f.unchanged();{
        const actor=(await competitor.query('SELECT session_user actor,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=session_user')).rows[0];assert.equal(actor.actor,'custody_recovery_competitor');for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolbypassrls'])assert.equal(actor[key],false);witness.competitorIdentity=actor;
        assert.equal((await competitor.query("SELECT has_table_privilege(current_user,'custody_export.events','UPDATE') writable")).rows[0].writable,false);
      }
    });
    assert.equal(witness.groups.length,17);witness.status='PASS';witness.liveProviderCalls=0;
    await writeFile(join(process.env.CUSTODY_OUTPUT,'p3-'+(profiling?'native-':'behavior-')+'witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{for(const child of children){if(child.child.exitCode===null&&child.child.signalCode===null)child.child.kill('SIGKILL');await child.exited;}await competitor?.end();await f.close();}
});
