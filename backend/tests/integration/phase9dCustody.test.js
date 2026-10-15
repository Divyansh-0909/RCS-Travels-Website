import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import pg from 'pg';
import {custodyFixture} from '../helpers/phase9dCustodyFixture.js';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
import {sourceMac,verifyReceipt,commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
test('independent custody service: committed broker journal, tamper denial, bounded recovery',async t=>{
  const f=await custodyFixture(),witness={schema:'custody-execution-v1',groups:[],scope:'broker committed journal; separate server/process',sourcesIndependent:true,verificationKeys:{[f.keyId]:f.publicKey}};
  let service,requestId,work;
  const start=async fault=>{service=await f.launch('service',{fault});assert.deepEqual(service.result.presented,{environmentActor:'custody_ingest',sourceKey:true,receiptSigningKey:true});return 'http://127.0.0.1:'+service.result.port+'/v1/shadow/deliveries';};
  const send=async(endpoint,event)=>sendShadowDelivery(endpoint,f.ingressKey,event);
  const group=async(name,fn)=>{let failed;await t.test(name,async()=>{try{await fn();witness.groups.push(name);}catch(e){failed=e;throw e;}});if(failed)throw failed;};
  try{
    await group('real journal registration captures source hash without raw evidence',async()=>{
      await f.exec.query("SET TIME ZONE 'Asia/Calcutta'");
      const index=f.payloads.findIndex(p=>p.payload.snapshot.caseType==='DRIVER_CANCELLATION');assert.ok(index>=0);requestId=await f.register(index);assert.ok(requestId);const frame=await f.frame(1);assert.equal(frame.event.action,'REGISTER');assert.equal(frame.event.request,requestId);assert.equal(frame.mac,sourceMac(frame.event,f.sourceKey));
      const hash=(await f.b.query("SELECT encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') h FROM broker9d.events e WHERE id=$1",[frame.event.localId])).rows[0].h;assert.equal(frame.event.sourceHash,hash);
      await f.exec.query("SET TIME ZONE 'UTC'");
      assert.equal((await f.b.query('SELECT count(*)::int n FROM custody_export.events')).rows[0].n,1);
      assert.equal(JSON.stringify(frame).includes('snapshot'),false);assert.equal(JSON.stringify(frame).includes('rider_unreachable'),false);
    });
    await group('custodian unavailable keeps committed source pending',async()=>{
      const child=await f.launch('sender',{endpoint:'http://127.0.0.1:1/v1/shadow/deliveries'});assert.equal(child.result.status,'PENDING_OR_REVIEW');await child.exit;
      assert.deepEqual(child.result.presented,{environmentActor:'custody_sender',sourceKey:false,receiptSigningKey:false});
      assert.equal((await f.b.query('SELECT status FROM custody_export.events WHERE seq=1')).rows[0].status,'PENDING');
    });
    await group('custodian process crash before commit preserves zero remote records',async()=>{
      const endpoint=await start('before-commit');await assert.rejects(send(endpoint,await f.frame(1)));await service.exit;assert.equal((await f.custodyState()).length,0);
    });
    await group('three failed sends exhaust retries; distinct operator authorizes bounded recovery',async()=>{
      for(let i=0;i<2;i++){const child=await f.launch('sender',{endpoint:'http://127.0.0.1:1/v1/shadow/deliveries'});assert.equal(child.result.status,'PENDING_OR_REVIEW');await child.exit;}
      const stopped=await f.launch('sender',{endpoint:'http://127.0.0.1:1/v1/shadow/deliveries'});assert.equal(stopped.result.status,'STOPPED_OR_REVIEW');await stopped.exit;
      await assert.rejects(f.sender.query('SELECT custody_export.retry($1,1,3)',[randomUUID()]),{code:'42501'});
      const operation=randomUUID();assert.equal((await f.operator.query('SELECT custody_export.retry($1,1,3) applied',[operation])).rows[0].applied,true);
      assert.equal((await f.operator.query('SELECT custody_export.retry($1,1,3) applied',[operation])).rows[0].applied,true);
      assert.equal((await f.operator.query('SELECT custody_export.retry($1,1,0) applied',[randomUUID()])).rows[0].applied,false);
    });
    await group('remote commit followed by process death retains durable receipt identity',async()=>{
      const endpoint=await start('after-commit');await assert.rejects(send(endpoint,await f.frame(1)));await service.exit;assert.equal((await f.custodyState()).length,1);
    });
    await group('restart reconciles exact duplicate through public signature verifier',async()=>{
      const endpoint=await start(),frame=await f.frame(1),receipt=await send(endpoint,frame);
      verifyReceipt(receipt,frame.event,new Map([[f.keyId,f.keys.publicKey]]));assert.equal(receipt.body.receipt,(await f.custodyState())[0].receipt);
      const verifier=await f.launch('verifier',{receipt,event:frame.event});assert.equal(verifier.result.accepted,true);await verifier.exit;
      assert.deepEqual(verifier.result.presented,{environmentActor:'custody_verifier',sourceKey:false,receiptSigningKey:false});
      witness.firstReceipt=receipt;assert.equal((await f.b.query('SELECT status FROM custody_export.events WHERE seq=1')).rows[0].status,'ACKED');
    });
    await group('forged receipt and receipt substitution cannot acknowledge another event',async()=>{
      const receipt=structuredClone(witness.firstReceipt);receipt.body.hash='0'.repeat(64);
      const rejected=await f.launch('verifier',{receipt,event:(await f.frame(1)).event});assert.equal(rejected.result.status,'FAILED');await rejected.exit;
      await assert.rejects(f.sender.query('SELECT custody_export.ack($1,$2,$3)',[1,commitment((await f.frame(1)).event),witness.firstReceipt]),{code:'42501'});
    });
    await group('real broker dispatch and signed usage then independent guarded persistence',async()=>{
      const execution=await f.run({mode:'execute',requestId,fixture:'valid'});assert.equal(execution.result.status,'RESPONSE_OBSERVED');await execution.exited;work=execution.result;
      assert.equal(await brokerCall(f.reconciler,'reconcile',[JSON.stringify(await f.receipt(work.id,{outcome:'SUCCESS',input:128,output:32,minor:2}))]),'ACCEPTED');
      const guard=await f.run({mode:'guard',id:work.id,token:work.token});assert.equal(guard.result.status,'GUARDED_RESULT_COMMITTED');await guard.exited;
      assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,1);
    });
    await group('conflicting signed event and wrong service cannot rewrite accepted custody',async()=>{
      const before=await f.custodyState(),frame=await f.frame(1),endpoint='http://127.0.0.1:'+service.result.port+'/v1/shadow/deliveries';
      for(const change of [{evidenceHash:'f'.repeat(64)},{source:randomUUID()},{action:'OPERATION_STOP'},{actor:'broker9d_ops'}]){
        const e={...frame.event,...change};await assert.rejects(send(endpoint,{event:e,mac:sourceMac(e,f.sourceKey)}));
      }
      assert.deepEqual(await f.custodyState(),before);
    });
    await group('missing sequence and reordered event rejected before remote advancement',async()=>{
      const endpoint='http://127.0.0.1:'+service.result.port+'/v1/shadow/deliveries';await assert.rejects(send(endpoint,await f.frame(3)));assert.equal((await f.custodyState()).length,1);
    });
    await group('independent head detects a physically missing pending local row',async()=>{
      const original=(await f.b.query('SELECT to_jsonb(e) row FROM custody_export.events e WHERE seq=2')).rows[0].row;
      try{
        await f.b.query('DELETE FROM custody_export.events WHERE seq=2');assert.equal(await f.frame(2),null);
        const count=(await f.b.query('SELECT count(*)::int n FROM custody_export.events')).rows[0].n,head=(await f.b.query('SELECT seq FROM custody_export.control')).rows[0].seq;assert.ok(count<Number(head));
        await assert.rejects(send('http://127.0.0.1:'+service.result.port+'/v1/shadow/deliveries',await f.frame(3)));assert.equal((await f.custodyState()).length,1);
      }finally{await f.b.query('INSERT INTO custody_export.events SELECT * FROM jsonb_populate_record(NULL::custody_export.events,$1)',[original]);}
    });
    await group('all actual worker principals lack custody history privileges',async()=>{
      const before=await f.custodyState();
      for(const role of ['broker9d_exec','broker9d_guard','broker9d_reconciler','shadow9d_capture','shadow9d_exporter']){
        const password=randomUUID();await f.audit.query((await f.audit.query("SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
        const url=new URL(process.env.CUSTODY_DATABASE_URL);url.username=role;url.password=password;
        const c=new pg.Client({connectionString:url.toString()});await c.connect();
        try{for(const sql of ['UPDATE custody.events SET hash=repeat(\'0\',64)','DELETE FROM custody.events','TRUNCATE custody.events','SELECT * FROM custody.events','UPDATE custody.sources SET seq=0','SET ROLE custody_owner','CREATE TABLE custody.forgery(id int)','SELECT custody.accept(\'{}\',\'fake\',\'fake\')','GRANT custody_owner TO '+role])await assert.rejects(c.query(sql),{code:'42501'});}finally{await c.end();}
      }
      for(const sql of ['UPDATE broker9d.configuration SET max_requests=100','DELETE FROM custody_export.events','UPDATE custody_export.events SET status=\'ACKED\'','SELECT secret FROM custody_export.control','SET ROLE custody_source_owner'])await assert.rejects(f.exec.query(sql),{code:'42501'});
      const sourceClient=new pg.Client({connectionString:f.uri(f.source.name,'broker9d_exec')});await sourceClient.connect();
      try{await assert.rejects(sourceClient.query('UPDATE public.bookings SET status=status'),{code:'42501'});}finally{await sourceClient.end();}
      assert.deepEqual(await f.custodyState(),before);
    });
    await group('incorrect custody password rejected independently by PostgreSQL',async()=>{
      const url=new URL(process.env.CUSTODY_DATABASE_URL);url.username='custody_ingest';url.password='incorrect-synthetic';const client=new pg.Client({connectionString:url.toString()});await assert.rejects(client.connect(),{code:'28P01'});await client.end();
    });
    await group('pending capture backpressure does not block operator STOP',async()=>{
      await f.b.query('UPDATE custody_export.control SET max_pending=1');assert.equal((await f.control('STOP')).status,'APPLIED');
      assert.ok((await f.b.query("SELECT count(*)::int n FROM custody_export.events WHERE status='REVIEW'")).rows[0].n>0);
      const denied=await f.run({mode:'execute',requestId,fixture:'valid'});assert.equal(denied.result.calls,0);await denied.exited;
      assert.equal((await f.control('RESUME')).status,'APPLIED');
    });
    await group('terminal payload cleanup before custody acknowledgement preserves all commitments',async()=>{
      const row=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[requestId])).rows[0];assert.equal((await brokerCall(f.ops,'operate',[randomUUID(),requestId,'CLEAN',row.revision,'RETENTION_MINIMIZATION'])).status,'APPLIED');
      assert.equal((await f.b.query('SELECT payload FROM broker9d.requests WHERE id=$1',[requestId])).rows[0].payload,null);
      assert.ok((await f.b.query('SELECT count(*)::int n FROM custody_export.events')).rows[0].n>5);
      assert.equal((await f.b.query('SELECT usage_state FROM broker9d.attempts')).rows[0].usage_state,'CONFIRMED');
    });
    await group('delayed delivery after cleanup and concurrent duplicates preserve chronology',async()=>{
      const endpoint='http://127.0.0.1:'+service.result.port+'/v1/shadow/deliveries',rows=(await f.b.query('SELECT seq FROM custody_export.events ORDER BY seq')).rows;
      for(const {seq}of rows){const frame=await f.frame(seq),receipt=await send(endpoint,frame);const verify=await f.launch('verifier',{receipt,event:frame.event});assert.equal(verify.result.accepted,true);await verify.exit;}
      const last=await f.frame(rows.at(-1).seq),results=await Promise.allSettled([send(endpoint,last),send(endpoint,last)]);assert.ok(results.some(r=>r.status==='fulfilled'));
      assert.equal((await f.custodyState()).length,rows.length);assert.equal((await f.b.query("SELECT count(*)::int n FROM custody_export.events WHERE status<>'ACKED'")).rows[0].n,0);
      witness.chronology=(await f.custodyState()).map(r=>({sequence:r.seq,action:r.event.action,hash:r.hash,receipt:r.receipt}));
    });
    await group('independent inspector reconciles source/event counts and hashes',async()=>{
      const local=(await f.b.query('SELECT seq,hash,event FROM custody_export.events ORDER BY seq')).rows,remote=await f.custodyState();assert.equal(local.length,remote.length);
      for(let i=0;i<local.length;i++){assert.equal(local[i].hash,remote[i].hash);assert.deepEqual(local[i].event,remote[i].event);assert.equal(local[i].hash,commitment(local[i].event));}
      const state=(await f.audit.query('SELECT * FROM custody.sources')).rows[0];assert.equal(state.seq,String(local.length));assert.equal(state.head,local.at(-1).hash);
      witness.accounting=await brokerCall(f.ops,'accounting',[]);await f.unchanged();witness.financialUnchanged=true;
      const saved=(await f.b.query('SELECT seq,event,hash,receipt FROM custody_export.events ORDER BY seq')).rows;witness.localEvents=saved;
      witness.remoteEvents=remote;witness.financialBefore=f.baseline;witness.outcome={guardedResults:1,route:'NEEDS_ADMIN_REVIEW',consequences:0};
    });
    await group('future PUBLIC routines and search-path spoofing are denied',async()=>{
      await f.audit.query("SET ROLE custody_owner;CREATE FUNCTION custody.future_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';RESET ROLE");
      await assert.rejects(f.inspector.query('SELECT custody.future_probe()'),{code:'42501'});
      await f.sender.query('SET search_path=public');assert.equal((await f.frame(1)).event.sequence,'1');
      await assert.rejects(f.inspector.query('CREATE TEMP TABLE spoof(id int)'),{code:'42501'});
      await f.b.query("SET ROLE custody_source_owner;CREATE FUNCTION custody_export.future_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';RESET ROLE");
      await assert.rejects(f.sender.query('SELECT custody_export.future_probe()'),{code:'42501'});
    });
    await group('critical SQL omissions have independent baseline and mutated witnesses',async()=>{
      const frame=await f.frame(1),key=f.keyId;
      const definition=(await f.audit.query("SELECT pg_get_functiondef('custody.accept(jsonb,text,text)'::regprocedure) sql")).rows[0].sql;
      const restore=async()=>f.audit.query(definition),mutants=[],digest=value=>createHash('sha256').update(value).digest('hex');
      const probe=async(name,oldText,newText,event,expected)=>{
        assert.equal(definition.split(oldText).length,2);await assert.rejects(f.audit.query('SELECT custody.accept($1,$2,$3)',[event,commitment(event),key]),{code:expected});
        const changed=definition.replace(oldText,newText);try{await f.audit.query(changed);await f.audit.query('SELECT custody.accept($1,$2,$3)',[event,commitment(event),key]);mutants.push({name,status:'KILLED',baselineHash:digest(definition),mutantHash:digest(changed),mutantSql:changed,reason:'baseline denial became acceptance'});}finally{await restore();}
      };
      await probe('conflicting evidence binding',"IF r.hash<>h OR r.event<>e THEN","IF false THEN",{...frame.event,evidenceHash:'f'.repeat(64)},'23514');
      const latest=(await f.custodyState()).at(-1),future={...latest.event,sequence:String(Number(latest.seq)+2),previous:latest.hash};
      try{await probe('missing sequence fence',"IF (e->>'sequence')::bigint<>s.seq+1 OR e->>'previous'<>s.head THEN","IF false THEN",future,'23514');}
      finally{await f.audit.query('DELETE FROM custody.events WHERE seq>$1',[latest.seq]);await f.audit.query('UPDATE custody.sources SET seq=$1,head=$2 WHERE source=$3',[latest.seq,latest.hash,f.sourceIdentity]);}
      const ack=(await f.b.query("SELECT pg_get_functiondef('custody_export.ack(bigint,text,jsonb)'::regprocedure) sql")).rows[0].sql;
      assert.equal((await f.verifier.query('SELECT custody_export.ack(1,$1,$2) accepted',['0'.repeat(64),witness.firstReceipt])).rows[0].accepted,false);
      const changedAck=ack.replace('AND hash=h','AND true');
      try{await f.b.query(changedAck);assert.equal((await f.verifier.query('SELECT custody_export.ack(1,$1,$2) accepted',['0'.repeat(64),witness.firstReceipt])).rows[0].accepted,true);mutants.push({name:'source acknowledgement event hash',status:'KILLED',baselineHash:digest(ack),mutantHash:digest(changedAck),mutantSql:changedAck});}finally{await f.b.query(ack);}
      assert.equal((await f.audit.query("SELECT pg_get_functiondef('custody.accept(jsonb,text,text)'::regprocedure) sql")).rows[0].sql,definition);
      assert.equal((await f.b.query("SELECT pg_get_functiondef('custody_export.ack(bigint,text,jsonb)'::regprocedure) sql")).rows[0].sql,ack);
      witness.sqlMutations=mutants;
      witness.catalog=[];
      for(const client of [f.b,f.audit])witness.catalog.push(...(await client.query("SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('custody_export','custody') ORDER BY p.proname")).rows);
    });
    witness.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,'custody-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{await f.close();}
});
