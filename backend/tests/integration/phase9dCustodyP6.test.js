import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {custodyClosureFixture} from '../helpers/phase9dCustodyClosureFixture.js';
import {p6Catalog,p6Native} from '../helpers/phase9dP6Profile.js';
import {keyIdentity,commitment,sourceMac} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt,historicalVerification,verificationRegistry} from '../../../tools/phase9d/closure-keys.mjs';
import {rotateCustodyKey} from '../../../tools/phase9d/closure-rotation.mjs';
import {verifyAndAcknowledge} from '../../../tools/phase9d/custody-delivery.mjs';
import {custodyStatus} from '../../../tools/phase9d/closure-status.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const value=async(client,sql,args=[])=>(await client.query(sql,args)).rows[0].value;
test('P6 signing epochs durable signatures and historical receipt trust',async t=>{
  const f=await custodyClosureFixture(),children=[],clients=[],profiling=process.env.CUSTODY_SQL_MODE==='p6-profile';let saved=false;
  const witness={schema:'phase9d-p6-key-epoch-v1',profiling,groups:[],processes:[],publicProofs:[],races:[],installations:[],fakeAnalystCalls:0,liveCalls:0,routineReplacementOperations:0};
  const pairs=new Map([[f.keyId,f.keys.privateKey]]),frames=[],bodies=[],receipts=[];
  const makeKey=()=>{const pair=generateKeyPairSync('ed25519'),id=keyIdentity(pair.publicKey),pem=pair.publicKey.export({type:'spki',format:'pem'});pairs.set(id,pair.privateKey);return {pair,id,pem};};
  const k2=makeKey(),k3=makeKey(),k5=makeKey(),k6=makeKey();
  const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();await f.unchanged();witness.groups.push(name);}catch(e){error=e;throw e;}});if(error)throw error;};
  const accept=frame=>value(f.ingest,'SELECT custody.ingest($1) value',[frame]);
  const registryRows=async()=>(await f.inspector.query('SELECT key_id,public_key,epoch,status FROM custody.keys ORDER BY epoch')).rows;
  const remoteState=async()=>({keys:await registryRows(),events:(await f.inspector.query('SELECT source,seq,hash,event,receipt,custody_seq,key_id FROM custody.events ORDER BY custody_seq')).rows,signatures:(await f.inspector.query('SELECT receipt,signature FROM custody.signatures ORDER BY receipt')).rows,operations:(await f.inspector.query('SELECT * FROM custody.key_operations ORDER BY epoch')).rows,sources:(await f.inspector.query('SELECT source,seq,head,service FROM custody.sources ORDER BY source')).rows});
  const syncRegistry=async()=>{for(const row of await registryRows()){
    const known=(await f.b.query('SELECT * FROM custody_export.keys WHERE key_id=$1',[row.key_id])).rows[0];
    if(known){assert.equal(known.public_key,row.public_key);assert.equal(known.epoch,row.epoch);await f.b.query('UPDATE custody_export.keys SET status=$2 WHERE key_id=$1',[row.key_id,row.status]);}
    else await f.b.query('INSERT INTO custody_export.keys VALUES($1,$2,$3,$4)',[row.key_id,row.public_key,row.epoch,row.status]);
  }};
  const remember=async(index,receipt)=>{const frame=frames[index],result=historicalVerification(receipt,frame.event,await f.registry());witness.publicProofs.push({event:frame.event,receipt,verification:result});return result;};
  const launch=async(mode,body,keys=new Map())=>{
    const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.NODE_ENV='test';
    const child=fork(fileURLToPath(new URL('../helpers/phase9dP6Signer.mjs',import.meta.url)),[],{env,execArgv:['--max-old-space-size=128'],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    const exited=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));children.push({child,exited});
    const result=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('P6_SIGNER_DEADLINE'));},12000);child.once('message',r=>{clearTimeout(timer);ok(r);});child.once('error',e=>{clearTimeout(timer);fail(e);});child.once('exit',()=>{clearTimeout(timer);fail(Error('P6_SIGNER_EARLY_EXIT'));});child.send({uri:f.sandboxUri('custody_signer'),mode,body,privateKeys:[...keys].map(([id,key])=>[id,key.export({type:'pkcs8',format:'pem'})])});});
    assert.equal(result.actor,'custody_signer');if(mode==='complete')assert.equal((await exited).code,0);return {child,exited,result};
  };
  const kill=async(run,label)=>{assert.equal(run.child.kill('SIGKILL'),true);const exit=await run.exited;assert.ok(exit.signal==='SIGKILL'||exit.code!==0);witness.processes.push({label,pid:run.child.pid,stage:run.result.status,exit});};
  const metadata=async(client,schemas)=>(await client.query(`SELECT 'constraint' kind,n.nspname schema,c.relname relation,p.conname name,pg_get_constraintdef(p.oid) definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)
    UNION ALL SELECT 'index',schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=ANY($1) ORDER BY schema,relation,kind,name`,[schemas])).rows;
  try{
    for(const [name,client]of [['receiver',f.b],['custodian',f.audit]]){
      await client.query('CREATE EXTENSION IF NOT EXISTS plpgsql_check');assert.equal(await value(client,"SELECT current_setting('plpgsql_check.profiler') value"),profiling?'on':'off');
      witness.installations.push({name,catalogBefore:await p6Catalog(client,name),metadataBefore:await metadata(client,[name==='receiver'?'custody_export':'custody']),runtime:(await client.query("SELECT current_setting('plpgsql_check.use_lxcache') transaction_cache,current_setting('plpgsql_check.use_shared_stats_when_it_possible') shared_statistics,current_setting('server_version') version,(SELECT extversion FROM pg_extension WHERE extname='plpgsql_check') profiler_version")).rows[0]});if(profiling)await client.query('SELECT plpgsql_profiler_reset_all()');
    }
    await check('initial enrollment catalog constraints and actual role separation',async()=>{
      const keys=await registryRows();assert.equal(keys.length,1);assert.equal(keys[0].key_id,f.keyId);assert.equal(keys[0].epoch,'1');assert.equal(keys[0].status,'ACTIVE');assert.equal(await value(f.audit,'SELECT custody.active_key() value'),f.keyId);
      for(const [client,sql]of [[f.ingest,'SELECT custody.active_key()'],[f.ingest,'SELECT custody.accept(null,null,null)'],[f.signer,'SELECT custody.rotate(null,null,1)'],[f.signer,'DELETE FROM custody.signatures'],[f.verifier,'UPDATE custody_export.keys SET status=\'ACTIVE\''],[f.ingest,'SELECT verification_secret FROM custody.sources']])await assert.rejects(client.query(sql),{code:'42501'});
      for(const [id,pem,epoch,status]of [[k2.id,k2.pem,1,'RETIRED'],[f.keyId,f.publicKey,99,'RETIRED'],[k2.id,k2.pem,2,'ACTIVE']]){
        await f.audit.query('BEGIN');try{await assert.rejects(f.audit.query('INSERT INTO custody.keys VALUES($1,$2,$3,$4)',[id,pem,epoch,status]),{code:'23505'});}finally{await f.audit.query('ROLLBACK');}
      }
      for(const installation of witness.installations)for(const r of installation.catalogBefore){assert.equal(r.public_execute,false);assert.equal(r.owner,installation.name==='custodian'?'custody_owner':'custody_source_owner');assert.ok(r.proconfig[0].startsWith('search_path=pg_catalog, '));}
      await f.register(0);frames.push(await f.frame(1));assert.equal(commitment(frames[0].event),await value(f.sourceInspector,'SELECT hash value FROM custody_export.events WHERE seq=1'));
    });
    await check('unsigned committed receipt blocks rotation and survives signer death before persistence',async()=>{
      bodies.push(await accept(frames[0]));const before=await remoteState();assert.equal(await value(f.audit,'SELECT custody.rotate($1,$2,1) value',[k2.id,k2.pem]),false);assert.deepEqual(await remoteState(),before);
      const child=await launch('before-store',bodies[0],new Map([[f.keyId,f.keys.privateKey]]));assert.equal(child.result.status,'SIGNED_NOT_STORED');await kill(child,'computed-signature-before-store');assert.equal(await value(f.signer,'SELECT custody.signable($1) value',[bodies[0].receipt]).then(r=>r.signature),null);assert.deepEqual(await remoteState(),before);witness.prePersistSignatureHash=child.result.signatureHash;
    });
    await check('replacement signer persists valid receipt and independent verifier acknowledges it',async()=>{
      const replacement=await launch('complete',bodies[0],new Map([[f.keyId,f.keys.privateKey]]));receipts.push(replacement.result.receipt);assert.equal(hash(receipts[0].signature),witness.prePersistSignatureHash);
      assert.equal((await remember(0,receipts[0])).currentlyIssuing,true);assert.equal(await verifyAndAcknowledge(f.verifier,receipts[0],frames[0].event,(await f.registry()).keys),true);assert.equal((await custodyStatus(f.sourceInspector,f.inspector,1,await f.registry())).status,'INDEPENDENTLY_VERIFIED');
    });
    await check('signature persistence exact duplicate conflict malformed and uncommitted boundaries',async()=>{
      assert.equal(await value(f.signer,'SELECT custody.store_signature($1,$2) value',[bodies[0].receipt,receipts[0].signature]),receipts[0].signature);const before=await remoteState();
      await assert.rejects(f.signer.query('SELECT custody.store_signature($1,$2)',[bodies[0].receipt,'A'.repeat(86)+'==']),{code:'23514'});await assert.rejects(f.signer.query('SELECT custody.store_signature($1,$2)',[bodies[0].receipt,'invalid']),{code:'23514'});await assert.rejects(f.signer.query('SELECT custody.store_signature($1,$2)',[randomUUID(),receipts[0].signature]),{code:'23514'});assert.equal(await value(f.signer,'SELECT custody.signable($1) value',[randomUUID()]),null);assert.deepEqual(await remoteState(),before);
    });
    await check('key identity public material expected epoch and operator type checks precede valid rotation',async()=>{
      const before=await remoteState();for(const args of [[k2.id,k2.pem,99],[k2.id,k2.pem,null],[f.keyId,f.publicKey,1],[k2.id,f.publicKey,1],[k2.id,null,1],[k2.id,'x'.repeat(1025),1],[k2.id,'not-public-key',1]])assert.equal(await value(f.audit,'SELECT custody.rotate($1,$2,$3) value',args),false);
      let queries=0;const fake={query(){queries++;throw Error('MUST_NOT_QUERY');}};await assert.rejects(rotateCustodyKey(fake,{keyId:k2.id,publicKey:f.publicKey,expectedEpoch:1}));
      const wrongType=generateKeyPairSync('rsa',{modulusLength:1024}).publicKey;await assert.rejects(rotateCustodyKey(fake,{keyId:keyIdentity(wrongType),publicKey:wrongType.export({type:'spki',format:'pem'}),expectedEpoch:1}));assert.equal(queries,0);assert.deepEqual(await remoteState(),before);
      await rotateCustodyKey(f.audit,{keyId:k2.id,publicKey:k2.pem,expectedEpoch:1});assert.equal(await value(f.audit,'SELECT custody.active_key() value'),k2.id);assert.equal((await remember(0,receipts[0])).signerStatus,'RETIRED');assert.deepEqual(await durableReceipt(f.signer,await accept(frames[0]),new Map()),receipts[0]);
    });
    await check('retired epochs cannot admit new work and trusted signer refuses an unsigned retired fault state',async()=>{
      await f.control('STOP');frames.push(await f.frame(2));bodies.push(await accept(frames[1]));assert.equal(bodies[1].keyId,k2.id);
      // Owner-only SQL invariant probe. Ingest cannot invoke accept directly.
      await f.audit.query('BEGIN');try{await assert.rejects(f.audit.query('SELECT custody.accept($1,$2,$3)',[{...frames[1].event,sequence:'3',previous:commitment(frames[1].event)},commitment(frames[1].event),f.keyId]),{code:'23514'});}finally{await f.audit.query('ROLLBACK');}
      // This is an explicit trusted-owner fault, not a legal rotation: normal
      // rotation refuses to retire an epoch with this unsigned receipt.
      await f.audit.query("UPDATE custody.keys SET status='RETIRED' WHERE key_id=$1",[k2.id]);try{await assert.rejects(durableReceipt(f.signer,bodies[1],pairs),/SIGNER_NOT_ISSUING/);}finally{await f.audit.query("UPDATE custody.keys SET status='ACTIVE' WHERE key_id=$1",[k2.id]);}
      assert.equal((await value(f.signer,'SELECT custody.signable($1) value',[bodies[1].receipt])).signature,null);
    });
    await check('durable signature survives lost reply process death rotation and absence of retired private keys',async()=>{
      const run=await launch('after-store',bodies[1],new Map([[k2.id,k2.pair.privateKey]]));assert.equal(run.result.status,'STORED_REPLY_WITHHELD');const committed=(await f.inspector.query('SELECT signature FROM custody.signatures WHERE receipt=$1',[bodies[1].receipt])).rows[0].signature;await kill(run,'stored-signature-reply-withheld');
      await rotateCustodyKey(f.audit,{keyId:k3.id,publicKey:k3.pem,expectedEpoch:2});const replacement=await launch('complete',bodies[1]);receipts.push(replacement.result.receipt);assert.equal(receipts[1].signature,committed);assert.equal(receipts[1].body.receipt,bodies[1].receipt);assert.equal((await remember(1,receipts[1])).signerStatus,'RETIRED');
      assert.equal(await verifyAndAcknowledge(f.verifier,receipts[1],frames[1].event,(await f.registry()).keys),false);assert.equal((await custodyStatus(f.sourceInspector,f.inspector,2,await f.registry())).status,'COMMITTED_ACKNOWLEDGEMENT_MISSING');await syncRegistry();assert.equal(await verifyAndAcknowledge(f.verifier,receipts[1],frames[1].event,(await f.registry()).keys),true);assert.equal((await custodyStatus(f.sourceInspector,f.inspector,2,await f.registry())).status,'INDEPENDENTLY_VERIFIED');
    });
    await check('historical receipts remain event bound after rotation and reject substituted keys',async()=>{
      for(let i=0;i<2;i++){assert.deepEqual(await accept(frames[i]),bodies[i]);assert.deepEqual(await durableReceipt(f.signer,bodies[i],new Map()),receipts[i]);const trust=await remember(i,receipts[i]);assert.equal(trust.signatureValid,true);assert.equal(trust.currentlyTrusted,true);assert.equal(trust.currentlyIssuing,false);}
      const before=await remoteState();assert.throws(()=>historicalVerification({...receipts[0],body:{...receipts[0].body,keyId:k3.id}},frames[0].event,verificationRegistry([{keyId:k3.id,publicKey:k3.pem,status:'ACTIVE'}])));assert.throws(()=>verificationRegistry([{keyId:f.keyId,publicKey:k3.pem,status:'RETIRED'}]));assert.deepEqual(await remoteState(),before);
    });
    await check('two blocked independent rotation operators commit one expected epoch transition',async()=>{
      const candidates=[makeKey(),makeKey()],operators=[];for(let i=0;i<2;i++){const c=new pg.Client({connectionString:process.env.CUSTODY_DATABASE_URL,statement_timeout:10000});await c.connect();clients.push(c);operators.push(c);}
      const pids=await Promise.all(operators.map(c=>value(c,'SELECT pg_backend_pid() value')));await f.audit.query('BEGIN;SELECT key_id FROM custody.keys WHERE status=\'ACTIVE\' FOR UPDATE');
      const pending=operators.map((c,i)=>c.query('SELECT custody.rotate($1,$2,3) ok',[candidates[i].id,candidates[i].pem]));
      try{const deadline=Date.now()+8000;while((await f.audit.query("SELECT count(*)::int n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'",[pids])).rows[0].n!==2){assert.ok(Date.now()<deadline);await new Promise(ok=>setTimeout(ok,10));}await f.audit.query('COMMIT');}catch(e){await f.audit.query('ROLLBACK');await Promise.allSettled(pending);throw e;}
      const results=await Promise.all(pending);assert.equal(results.filter(r=>r.rows[0].ok).length,1);const active=(await registryRows()).filter(r=>r.status==='ACTIVE');assert.equal(active.length,1);assert.equal(active[0].epoch,'4');assert.equal((await f.inspector.query('SELECT count(*)::int n FROM custody.key_operations')).rows[0].n,3);witness.races.push({kind:'expected-epoch-rotation',pids,results:results.map(r=>r.rows[0].ok),winner:active[0].key_id,epoch:'4'});
    });
    await check('ingestion waiting on rotation commits only under the resulting active epoch',async()=>{
      await f.control('RESUME');frames.push(await f.frame(3));const pid=await value(f.ingest,'SELECT pg_backend_pid() value');await f.audit.query('BEGIN;SELECT key_id FROM custody.keys WHERE status=\'ACTIVE\' FOR UPDATE');const pending=accept(frames[2]).then(body=>({body}),e=>({error:e.code}));
      try{const deadline=Date.now()+8000;while((await f.audit.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type!=='Lock'){assert.ok(Date.now()<deadline);await new Promise(ok=>setTimeout(ok,10));}await rotateCustodyKey(f.audit,{keyId:k5.id,publicKey:k5.pem,expectedEpoch:4});await f.audit.query('COMMIT');}catch(e){await f.audit.query('ROLLBACK');await pending;throw e;}
      const observed=await pending;if(observed.error)assert.equal(observed.error,'23514');bodies.push(observed.body??await accept(frames[2]));assert.equal(bodies[2].keyId,k5.id);receipts.push(await durableReceipt(f.signer,bodies[2],pairs));await syncRegistry();assert.equal(await verifyAndAcknowledge(f.verifier,receipts[2],frames[2].event,(await f.registry()).keys),true);witness.races.push({kind:'ingestion-versus-rotation',backendPid:pid,firstAttempt:observed.error??'COMMITTED',committedEpoch:'5'});
    });
    await check('compromised historical and current keys retain mathematical validity without current trust',async()=>{
      await f.audit.query("UPDATE custody.keys SET status='COMPROMISED' WHERE key_id=ANY($1::text[])",[[f.keyId,k5.id]]);await syncRegistry();
      for(const i of [0,2]){const trust=await remember(i,receipts[i]);assert.equal(trust.signatureValid,true);assert.equal(trust.currentlyTrusted,false);assert.equal(trust.currentlyIssuing,false);assert.equal((await custodyStatus(f.sourceInspector,f.inspector,i+1,await f.registry())).status,'SIGNER_COMPROMISED');assert.equal(await verifyAndAcknowledge(f.verifier,receipts[i],frames[i].event,(await f.registry()).keys),false);}
      await rotateCustodyKey(f.audit,{keyId:k6.id,publicKey:k6.pem,expectedEpoch:5});assert.equal(await value(f.audit,'SELECT custody.active_key() value'),k6.id);assert.equal((await registryRows()).find(r=>r.key_id===k5.id).status,'COMPROMISED');
    });
    await check('source MAC conflict gap and closed admission cases preserve original receipt commitments',async()=>{
      const before=await remoteState();for(const bad of [null,{event:frames[0].event,mac:'0'.repeat(64),extra:true},{event:{...frames[0].event,source:randomUUID()},mac:'0'.repeat(64)},{...frames[0],mac:'0'.repeat(64)}])await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[bad]),{code:'23514'});
      const conflict={...frames[0].event,actor:'broker9d_ops'},gap={...frames[2].event,sequence:'999',previous:'0'.repeat(64)};for(const event of [conflict,gap])await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[{event,mac:sourceMac(event,f.sourceKey)}]),{code:'23514'});assert.deepEqual(await remoteState(),before);
    });
    await check('no-active-key configuration fault fails closed and normal issuance resumes after restoration',async()=>{
      await f.control('STOP');frames.push(await f.frame(4));await f.audit.query("UPDATE custody.keys SET status='RETIRED' WHERE key_id=$1",[k6.id]);
      try{assert.equal(await value(f.audit,'SELECT custody.active_key() value'),null);const before=await remoteState();await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[frames[3]]),{code:'23514'});assert.deepEqual(await remoteState(),before);}finally{await f.audit.query("UPDATE custody.keys SET status='ACTIVE' WHERE key_id=$1",[k6.id]);}
      bodies.push(await accept(frames[3]));assert.equal(bodies[3].keyId,k6.id);receipts.push(await durableReceipt(f.signer,bodies[3],pairs));await syncRegistry();assert.equal(await verifyAndAcknowledge(f.verifier,receipts[3],frames[3].event,(await f.registry()).keys),true);assert.equal((await custodyStatus(f.sourceInspector,f.inspector,4,await f.registry())).status,'INDEPENDENTLY_VERIFIED');
    });
    await check('native contract rejection arms and supported lineage denial variants',async()=>{
      const base=frames[0].event,valid=async(e,service=e?.service)=>value(f.audit,'SELECT custody.valid_event($1,$2) value',[e,service]);
      assert.equal(await valid(base),true);
      const missing={...base};delete missing.actor;
      const invalid=[null,[],{...base,extra:'no'},missing,{...base,actor:1},{...base,actor:null},{...base,service:'wrong'},{...base,database:'bad'},{...base,evidenceHash:'bad'},{...base,request:'bad'},{...base,generation:'-1'},{...base,observed:'2026-10-18T24:00:00.000Z'},{...base,observed:'not-a-date'}];
      for(const event of invalid)assert.equal(await valid(event,base.service),false);
      const v2={...base,schema:'custody-event-v2',service:'source-lineage-v2',identityHash:'a'.repeat(64),ownerHash:null,actor:'application_transaction',action:'LOCAL_AUDIT'};
      assert.equal(await valid(v2),true);assert.equal(await valid({...v2,service:'receiver-lineage-v2'}),true);
      for(const event of [{...v2,identityHash:'bad'},{...v2,ownerHash:'bad'},{...v2,actor:'invalid'},{...v2,schema:'unknown'},{...v2,service:'unsupported'}])assert.equal(await valid(event),false);
      const denial={...v2,schema:'custody-denial-v1',service:'denial-observer-v2',actor:'trusted_observer',action:'PERMISSION_DENIED',database:'b'.repeat(64),serverIdentity:'b'.repeat(64),authenticatedRole:'custody_ingest',actorTrust:'AUTHENTICATED',sqlstate:'42501',logSessionHash:'c'.repeat(64),logLine:'1',denialClass:'DATABASE_DENIAL'};
      assert.equal(await valid(denial),true);assert.equal(await valid({...denial,actorTrust:'invalid'}),false);
      const before=await remoteState();await assert.rejects(f.audit.query('SELECT custody.accept($1,$2,$3)',[{...base,source:randomUUID()},commitment(base),k6.id]),{code:'42501'});assert.deepEqual(await remoteState(),before);
      witness.additionalContractCases=invalid.length+5+5;
    });
    await check('final immutable receipt event key history and function catalog preservation',async()=>{
      for(let i=0;i<4;i++){assert.deepEqual(await accept(frames[i]),bodies[i]);assert.deepEqual(await durableReceipt(f.signer,bodies[i],new Map()),receipts[i]);await remember(i,receipts[i]);}
      witness.finalPublicState=await remoteState();witness.sourcePublicKeys=(await f.sourceInspector.query('SELECT key_id,public_key,epoch,status FROM custody_export.keys ORDER BY epoch')).rows;
      for(const installation of witness.installations){const c=installation.name==='receiver'?f.b:f.audit;installation.catalogAfter=await p6Catalog(c,installation.name);installation.metadataAfter=await metadata(c,[installation.name==='receiver'?'custody_export':'custody']);assert.deepEqual(installation.catalogAfter,installation.catalogBefore);assert.deepEqual(installation.metadataAfter,installation.metadataBefore);if(profiling)installation.native=await p6Native(c,installation.catalogBefore,installation.name);}
    });
    witness.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,(profiling?'p6-native-witness-':'p6-witness-')+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});saved=true;
  }finally{
    if(!saved){witness.status='INCOMPLETE_OR_FAIL';await writeFile(join(process.env.CUSTODY_OUTPUT,'p6-failed-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});}
    for(const p of children){if(p.child.exitCode===null&&p.child.signalCode===null)p.child.kill();await p.exited;}await Promise.allSettled(clients.map(c=>c.end()));await f.close();
  }
});
