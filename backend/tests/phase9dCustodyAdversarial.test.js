import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {validateClosureEvent,validateClosureEnvelope,validateClosureFrame} from '../../tools/phase9d/closure-contract.mjs';
import {minimizeServerDenials,appendDenialObservations} from '../../tools/phase9d/closure-observer.mjs';
import {closureSession} from '../../tools/phase9d/closure-session.mjs';
import {custodyStatus,sourceCaptureStatus} from '../../tools/phase9d/closure-status.mjs';
import {verificationRegistry,historicalVerification,durableReceipt} from '../../tools/phase9d/closure-keys.mjs';
import {FROZEN,sourceMac,commitment,keyIdentity} from '../../tools/phase9d/custody-protocol.mjs';
const key='synthetic-adversarial-source-key-at-least-32';
const base=()=>({schema:'custody-event-v2',source:randomUUID(),service:'source-lineage-v2',database:'a'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'b'.repeat(64),action:'SOURCE_LINEAGE',actor:'application_transaction',request:null,attempt:null,evidenceHash:null,evidenceVersion:null,receipt:null,configuration:null,generation:null,frozen:FROZEN,observed:'2026-10-15T00:00:00.000Z',identityHash:'c'.repeat(64),ownerHash:null});
const denial=()=>({...base(),schema:'custody-denial-v1',service:'denial-observer-v2',action:'PERMISSION_DENIED',actor:'trusted_observer',serverIdentity:'a'.repeat(64),authenticatedRole:'custody_sender',actorTrust:'AUTHENTICATED',sqlstate:'42501',logSessionHash:'d'.repeat(64),logLine:'12',denialClass:'SIGNING_SECRET'});
const classes=['APPLICATION_WRITE','BUDGET_CONFIGURATION','AUDIT_HISTORY','ROLE_ESCALATION','AUTHENTICATION','SIGNING_SECRET','GUARD_WRITE','OPERATIONS_CONTROL','DATABASE_DENIAL'];
test('closed action, actor and denial contracts accept every supported symbol and reject signed semantic substitutions',()=>{
  const e=base();
  for(const [service,actions]of Object.entries({'source-lineage-v2':['SOURCE_LINEAGE','OUTBOX_CREATED','OUTBOX_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],'receiver-lineage-v2':['RECEIPT_ACCEPTED','WORK_ADMITTED','WORK_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],'denial-observer-v2':['PERMISSION_DENIED','AUTHENTICATION_FAILED']}))for(const action of actions)validateClosureEvent({...e,service,action});
  for(const actor of ['application_transaction','shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_worker','shadow9d_recorder','custody_operator','trusted_observer','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'])validateClosureEvent({...e,actor});
  for(const denialClass of classes)validateClosureEvent({...denial(),denialClass});
  for(const field of ['identityHash','ownerHash'])for(const value of ['Z'+'a'.repeat(64),'a'.repeat(64)+'Z'])assert.throws(()=>validateClosureEvent({...e,[field]:value}));
  for(const [field,values]of Object.entries({ownerHash:['f'.repeat(64)],database:['f'.repeat(64)],logSessionHash:['Z'+'d'.repeat(64),'d'.repeat(64)+'Z'],authenticatedRole:['Zcustody_sender','custody_sender!'],logLine:['Z12','12Z','0'],denialClass:['UNKNOWN']}))for(const value of values)assert.throws(()=>validateClosureEvent({...denial(),[field]:value}));
  const sources=new Map([[e.source,{id:e.source,key,service:e.service}]]),frame={mac:sourceMac(e,key),event:e};
  assert.equal(validateClosureFrame(frame,sources),e);
  for(const mac of ['Z'+'f'.repeat(64),'f'.repeat(64)+'Z'])assert.throws(()=>validateClosureEnvelope({event:e,mac},sources));
  assert.throws(()=>validateClosureEnvelope(frame,new Map()),/UNKNOWN_SOURCE/);
});
const log=()=>({timestamp:'2026-10-15 12:00:00.000 UTC',user:'custody_sender',pid:123,session_id:'123.abc',line_num:12,state_code:'42501',error_severity:'ERROR'});
const observerOptions={serverIdentity:'a'.repeat(64),roles:['custody_sender']};
test('server observation size, attribution and spool bounds fail independently of parsing or MAC rejection',()=>{
  const raw=JSON.stringify(log()),result=minimizeServerDenials(raw,observerOptions);
  assert.equal(result[0].denialClass,'DATABASE_DENIAL');assert.deepEqual(minimizeServerDenials(raw+'\n \t\n',observerOptions),result);
  const max=raw+'\n'+'\n'.repeat(1048576-Buffer.byteLength(raw)-1);
  assert.deepEqual(minimizeServerDenials(max,observerOptions),result);assert.throws(()=>minimizeServerDenials(max+'\n',observerOptions));
  const padded={...log(),message:''},empty=JSON.stringify(padded),atLimit=JSON.stringify({...padded,message:'x'.repeat(16384-Buffer.byteLength(empty))});
  assert.equal(Buffer.byteLength(atLimit),16384);assert.deepEqual(minimizeServerDenials(atLimit,observerOptions),result);
  assert.throws(()=>minimizeServerDenials(atLimit.replace('xxx','xxxx'),observerOptions));
  for(const change of [{line_num:0},{pid:1.5},{session_id:'Z123.abc'},{session_id:'123.abcZ'}])assert.throws(()=>minimizeServerDenials(JSON.stringify({...log(),...change}),observerOptions));
  for(const serverIdentity of ['Z'+'a'.repeat(64),'a'.repeat(64)+'Z'])assert.throws(()=>minimizeServerDenials(raw,{...observerOptions,serverIdentity}));
  const correlations=[{pid:1,role:'custody_sender',sqlstate:'42501',denialClass:'ROLE_ESCALATION'},{pid:123,role:'other',sqlstate:'42501',denialClass:'BUDGET_CONFIGURATION'},{pid:123,role:'custody_sender',sqlstate:'28P01',denialClass:'AUTHENTICATION'},{pid:123,role:'custody_sender',sqlstate:'42501',denialClass:'SIGNING_SECRET'}];
  assert.equal(minimizeServerDenials(raw,{...observerOptions,correlations})[0].denialClass,'SIGNING_SECRET');
  assert.throws(()=>minimizeServerDenials(raw,{...observerOptions,correlations:[{...correlations[3],denialClass:'UNKNOWN'}]}));
  const source=randomUUID(),cfg={source,key},initial={frames:[]};
  for(const field of ['maxRecords','maxBytes'])for(const value of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>appendDenialObservations(initial,[],{...cfg,[field]:value}));
  assert.deepEqual(appendDenialObservations(initial,[],{...cfg,maxRecords:10000,maxBytes:10485760}),initial);
  for(const denialClass of classes){const state=appendDenialObservations(initial,[{...result[0],denialClass}],cfg);assert.equal(state.frames[0].event.denialClass,denialClass);}
  const state=appendDenialObservations(initial,result,cfg),size=Buffer.byteLength(JSON.stringify(state));
  assert.deepEqual(appendDenialObservations(initial,result,{...cfg,maxBytes:size}),state);
  const two=appendDenialObservations(state,[{...result[0],logLine:'13'}],cfg);assert.equal(two.frames[1].event.previous,commitment(two.frames[0].event));
});
test('every permitted PostgreSQL identity is admitted and unknown consistent credentials are rejected before connect',async t=>{
  const roles=['custody_sender','custody_verifier','custody_ingest','custody_inspector','custody_signer','custody_source_inspector','custody_source_sender','custody_receiver_sender','custody_lineage_inspector','custody_lineage_verifier','custody_observer'],database='rcs_verify_'+'a'.repeat(32);let created=0;
  const factory=options=>{created++;const u=new URL(options.connectionString);return {connect:async()=>{},end:async()=>{},query:async()=>({rows:[{actor:u.username,effective:u.username,database:u.pathname.slice(1),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,member:false}]})};};
  for(const role of roles)for(const protocol of ['postgres:','postgresql:'])await closureSession(protocol+'//'+role+':synthetic@localhost:1/'+database,role,{factory,environment:{}});
  const before=created;
  for(const [role,path]of [['rogue_login',database],['custody_signer','prefix/'+database],['custody_signer',database+'Z']])await assert.rejects(closureSession('postgresql://'+role+':synthetic@localhost:1/'+path,role,{factory,environment:{}}));
  assert.equal(created,before);
  const {Client}=createRequire(import.meta.url)('pg'),role='custody_signer';
  t.mock.method(Client.prototype,'connect',async()=>{});t.mock.method(Client.prototype,'query',async()=>({rows:[{actor:role,effective:role,database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,member:false}]}));t.mock.method(Client.prototype,'end',async()=>{});
  assert.ok(await closureSession('postgresql://'+role+':synthetic@localhost:1/'+database,role,{environment:{}}) instanceof Client);
});
test('independent status returns explicit nonauthority flags and isolates every source-chain predicate',async()=>{
  const e={...base(),schema:'custody-event-v1',service:'broker-receiver-v1',action:'REGISTER',actor:'broker9d_exec'};delete e.identityHash;delete e.ownerHash;
  const source={query:async()=>({rows:[]})};assert.deepEqual(await custodyStatus(source,null,1,null),{status:'NO_LOCAL_CAPTURE',remotelyVerified:false});
  for(const [patch,status]of [[{hash:'f'.repeat(64)},'SOURCE_COMMITMENT_CONFLICT'],[{seq:'2'},'SOURCE_COMMITMENT_CONFLICT'],[{status:'ACKED'},'FALSE_ACKNOWLEDGEMENT'],[{status:'PENDING'},'CAPTURED_NOT_DELIVERED']]){
    const local={seq:'1',event:e,hash:commitment(e),status:'PENDING',receipt:null,...patch};source.query=async()=>({rows:[local]});
    const result=await custodyStatus(source,{query:async()=>({rows:[]})},1,null);assert.equal(result.status,status);assert.equal(result.remotelyVerified,false);
    if(!status.startsWith('SOURCE_'))assert.equal(result.localStatus,local.status);
  }
  const snapshot={control:{source:e.source,seq:'1',head:commitment(e)},events:[{seq:'1',event:e,hash:commitment(e)}],missing:[]},inspect={query:async()=>({rows:[{snapshot}]})};
  for(const change of [{seq:'2',event:{...e,sequence:'2'}},{event:{...e,sequence:'2'}},{event:{...e,source:randomUUID()}},{event:{...e,previous:'f'.repeat(64)}}]){
    const row={seq:'1',event:e,...change};row.hash=commitment(row.event);snapshot.events=[row];snapshot.control.head=row.hash;
    assert.deepEqual((await sourceCaptureStatus(inspect)).invalidSequences,[row.seq]);
  }
  snapshot.events=[{seq:'1',event:e,hash:'f'.repeat(64)}];snapshot.control.head='f'.repeat(64);assert.deepEqual((await sourceCaptureStatus(inspect)).invalidSequences,['1']);
  snapshot.events=[];let previous='0'.repeat(64);
  for(let i=1;i<=1000;i++){const event={...e,sequence:String(i),localId:String(i),previous},hash=commitment(event);snapshot.events.push({seq:String(i),event,hash});previous=hash;}
  snapshot.control.seq='1000';snapshot.control.head=previous;
  assert.equal((await sourceCaptureStatus(inspect)).status,'CAPTURE_CONSISTENT');
  assert.match((await sourceCaptureStatus(inspect)).suppressionBoundary,/suppressing both.*unobservable/);
  snapshot.events=[];snapshot.missing=Array(1000).fill({id:'1'});snapshot.control.seq='0';snapshot.control.head='0'.repeat(64);
  assert.equal((await sourceCaptureStatus(inspect)).status,'CAPTURE_GAP');snapshot.missing.push({id:'2'});
  assert.deepEqual(await sourceCaptureStatus(inspect),{status:'INSPECTION_LIMIT',remotelyVerified:false});
});
test('signer refuses wrong algorithms, missing trust status and mismatched durable bodies before signing',async()=>{
  const rsa=generateKeyPairSync('rsa',{modulusLength:1024});assert.throws(()=>verificationRegistry([{keyId:keyIdentity(rsa.publicKey),publicKey:rsa.publicKey.export({type:'spki',format:'pem'}),status:'ACTIVE'}]));
  const pair=generateKeyPairSync('ed25519'),id=keyIdentity(pair.publicKey),body={receipt:randomUUID(),keyId:id,hash:'a'.repeat(64)};let writes=0;
  const signer={query:async(sql,args)=>sql.includes('signable')?{rows:[{state:{body,signature:null,signerStatus:'ACTIVE'}}]}:(writes++,{rows:[{signature:args[1]}]})};
  await assert.rejects(durableReceipt(signer,{...body,hash:'b'.repeat(64)},new Map([[id,pair.privateKey]])));assert.equal(writes,0);
  const e={...base(),schema:'custody-event-v1',service:'broker-receiver-v1',action:'REGISTER',actor:'broker9d_exec'};delete e.identityHash;delete e.ownerHash;
  const {signReceipt}=await import('../../tools/phase9d/custody-protocol.mjs'),receipt=signReceipt({schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:'1',hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId:id,outcome:'COMMITTED'},pair.privateKey);
  const registry=verificationRegistry([{keyId:id,publicKey:pair.publicKey.export({type:'spki',format:'pem'}),status:'ACTIVE'}]);registry.statuses.delete(id);
  assert.throws(()=>historicalVerification(receipt,e,registry),/UNKNOWN_SIGNER/);
});
