import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {verificationRegistry,historicalVerification,durableReceipt} from '../../tools/phase9d/closure-keys.mjs';
import {custodyStatus,sourceCaptureStatus} from '../../tools/phase9d/closure-status.mjs';
import {rotateCustodyKey} from '../../tools/phase9d/closure-rotation.mjs';
import {keyIdentity,commitment,signReceipt,FROZEN} from '../../tools/phase9d/custody-protocol.mjs';
const pair=()=>generateKeyPairSync('ed25519');
const row=(key,status='ACTIVE')=>({keyId:keyIdentity(key.publicKey),publicKey:key.publicKey.export({type:'spki',format:'pem'}),status});
const event=()=>({schema:'custody-event-v1',source:randomUUID(),service:'broker-receiver-v1',database:'a'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'b'.repeat(64),action:'REGISTER',actor:'broker9d_exec',request:randomUUID(),attempt:null,evidenceHash:'c'.repeat(64),evidenceVersion:'responsibility-evidence-v1',receipt:null,configuration:'d'.repeat(64),generation:'1',frozen:FROZEN,observed:'2026-10-15T00:00:00.000Z'});
const body=(e,key)=>({schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:e.sequence,hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId:keyIdentity(key.publicKey),outcome:'COMMITTED'});
test('rotation validates Ed25519 public material and epoch before any write',async()=>{
  const first=pair(),second=pair(),material=row(first);let calls=0,accepted=true;
  const client={async query(sql,args){calls++;assert.equal(sql,'SELECT custody.rotate($1,$2,$3) accepted');assert.deepEqual(args,[material.keyId,material.publicKey,1]);return {rows:[{accepted}]};}};
  for(const value of [{...material,keyId:row(second).keyId,expectedEpoch:1},{...material,expectedEpoch:0},{...material,expectedEpoch:1.5},{...material,publicKey:'invalid',expectedEpoch:1}])await assert.rejects(rotateCustodyKey(client,value));
  assert.equal(calls,0);assert.equal(await rotateCustodyKey(client,{...material,expectedEpoch:1}),material.keyId);accepted=false;
  await assert.rejects(rotateCustodyKey(client,{...material,expectedEpoch:1}));assert.equal(calls,2);
});
test('custody historical keys distinguish signature validity, retirement and compromise',()=>{
  const first=pair(),second=pair(),e=event(),receipt=signReceipt(body(e,first),first.privateKey);
  for(const status of ['ACTIVE','RETIRED','COMPROMISED']){
    const result=historicalVerification(receipt,e,verificationRegistry([row(first,status),row(second)]));
    assert.equal(result.signatureValid,true);assert.equal(result.signerStatus,status);
    assert.equal(result.currentlyTrusted,status!=='COMPROMISED');assert.equal(result.currentlyIssuing,status==='ACTIVE');
  }
  for(const rows of [[{...row(first),keyId:row(second).keyId}],[{...row(first),status:'UNKNOWN'}],[row(first),row(first)]])assert.throws(()=>verificationRegistry(rows));
  assert.throws(()=>historicalVerification(receipt,e,verificationRegistry([row(second)])));
  const substitute=structuredClone(receipt);substitute.body.keyId=row(second).keyId;
  assert.throws(()=>historicalVerification(substitute,e,verificationRegistry([row(first),row(second)])));
  const forged=signReceipt(body(e,first),second.privateKey);assert.throws(()=>historicalVerification(forged,e,verificationRegistry([row(first)])));
  assert.throws(()=>historicalVerification(receipt,{...e,sequence:'2'},verificationRegistry([row(first)])));
});
test('durable signer signs only actual committed bodies; rotation duplicates reuse saved signatures',async()=>{
  const first=pair(),second=pair(),e=event(),b=body(e,first);let stored=null;const calls=[];
  const signer={async query(sql,args){calls.push({sql,args});if(sql==='SELECT custody.signable($1) state'){assert.deepEqual(args,[b.receipt]);return {rows:[{state:{body:b,signature:stored,signerStatus:'ACTIVE'}}]};}
    assert.equal(sql,'SELECT custody.store_signature($1,$2) signature');assert.equal(args[0],b.receipt);stored=args[1];return {rows:[{signature:stored}]};}};
  const receipt=await durableReceipt(signer,b,new Map([[b.keyId,first.privateKey]]));
  historicalVerification(receipt,e,verificationRegistry([row(first)]));
  assert.deepEqual(await durableReceipt(signer,b,new Map([[row(second).keyId,second.privateKey]])),receipt);assert.equal(calls.length,3);
  const missing={query:async()=>({rows:[{state:null}]})};await assert.rejects(durableReceipt(missing,b,new Map()),/UNCOMMITTED_RECEIPT/);
  const unsealed={query:async()=>({rows:[{state:{body:b,signature:null,signerStatus:'ACTIVE'}}]})};
  for(const signerStatus of ['RETIRED','COMPROMISED'])await assert.rejects(durableReceipt({query:async()=>({rows:[{state:{body:b,signature:null,signerStatus}}]})},b,new Map([[b.keyId,first.privateKey]])),/SIGNER_NOT_ISSUING/);
  await assert.rejects(durableReceipt(unsealed,b,new Map()),/SIGNER_EPOCH_UNAVAILABLE/);
  await assert.rejects(durableReceipt(unsealed,b,new Map([[b.keyId,second.privateKey]])),/SIGNER_KEY_MISMATCH/);
  await assert.rejects(durableReceipt(unsealed,{...b,hash:'f'.repeat(64)},new Map([[b.keyId,first.privateKey]])));
  const conflict={query:async sql=>sql.includes('signable')?{rows:[{state:{body:b,signature:null,signerStatus:'ACTIVE'}}]}:{rows:[{signature:'conflict'}]}};
  await assert.rejects(durableReceipt(conflict,b,new Map([[b.keyId,first.privateKey]])));
});
test('independent read-only status detects false acknowledgements without trusting the verifier',async()=>{
  const key=pair(),e=event(),receipt=signReceipt(body(e,key),key.privateKey),registry=verificationRegistry([row(key)]);
  let local={seq:'1',event:e,hash:commitment(e),status:'ACKED',receipt},remote={event:e,hash:commitment(e),receipt:receipt.body.receipt,key_id:receipt.body.keyId,signature:receipt.signature};
  const reads=[],source={query:async(sql,args)=>{reads.push({sql,args});return {rows:local?[local]:[]};}},audit={query:async(sql,args)=>{reads.push({sql,args});return {rows:remote?[remote]:[]};}};
  assert.equal((await custodyStatus(source,audit,1,registry)).status,'INDEPENDENTLY_VERIFIED');
  assert.deepEqual(reads[0].args,[1]);assert.deepEqual(reads[1].args,[e.source,'1']);assert.ok(reads.every(r=>r.sql.startsWith('SELECT ')));
  assert.equal((await custodyStatus(source,audit,1,verificationRegistry([row(key,'RETIRED')]))).remotelyVerified,true);
  assert.equal((await custodyStatus(source,audit,1,verificationRegistry([row(key,'COMPROMISED')]))).status,'SIGNER_COMPROMISED');
  remote=null;assert.equal((await custodyStatus(source,audit,1,registry)).status,'FALSE_ACKNOWLEDGEMENT');
  local.status='PENDING';assert.equal((await custodyStatus(source,audit,1,registry)).status,'CAPTURED_NOT_DELIVERED');
  remote={event:e,hash:commitment(e),receipt:receipt.body.receipt,key_id:receipt.body.keyId,signature:receipt.signature};local.receipt=null;
  assert.equal((await custodyStatus(source,audit,1,registry)).status,'COMMITTED_ACKNOWLEDGEMENT_MISSING');
  local.receipt=receipt;
  for(const corrupt of [{hash:'f'.repeat(64)},{event:{...e,action:'OPERATION_STOP'}}]){const good=remote;remote={...remote,...corrupt};assert.equal((await custodyStatus(source,audit,1,registry)).status,'CUSTODY_CONFLICT');remote=good;}
  for(const corrupt of [{receipt:randomUUID()},{key_id:'f'.repeat(64)},{signature:'invalid'}]){const good=remote;remote={...remote,...corrupt};assert.equal((await custodyStatus(source,audit,1,registry)).status,'FALSE_ACKNOWLEDGEMENT');remote=good;}
  local.receipt={...receipt,signature:'bad'};assert.equal((await custodyStatus(source,audit,1,registry)).status,'FALSE_ACKNOWLEDGEMENT');
  local={seq:'1',event:e,hash:'f'.repeat(64),status:'ACKED',receipt};assert.equal((await custodyStatus(source,audit,1,registry)).status,'SOURCE_COMMITMENT_CONFLICT');
  local={seq:'2',event:e,hash:commitment(e),status:'ACKED',receipt};assert.equal((await custodyStatus(source,audit,1,registry)).status,'SOURCE_COMMITMENT_CONFLICT');
  local=null;assert.equal((await custodyStatus(source,audit,1,registry)).status,'NO_LOCAL_CAPTURE');
});
test('one-snapshot source inspection detects missing capture and bounded chain divergence',async()=>{
  const e=event(),snapshot={control:{source:e.source,seq:'1',head:commitment(e)},events:[{seq:'1',local_id:'1',event:e,hash:commitment(e)}],missing:[]};let calls=0;
  const inspector={async query(sql){calls++;assert.ok(sql.startsWith('SELECT '));assert.ok(sql.includes('LIMIT 1001'));return {rows:[{snapshot}]};}};
  assert.equal((await sourceCaptureStatus(inspector)).status,'CAPTURE_CONSISTENT');assert.equal(calls,1);
  snapshot.missing=[{id:'9'}];assert.deepEqual((await sourceCaptureStatus(inspector)).uncapturedCommittedJournalIds,['9']);
  snapshot.missing=[];
  for(const patch of [{seq:'2'},{event:{...e,sequence:'2'}},{event:{...e,source:randomUUID()}},{event:{...e,previous:'f'.repeat(64)}},{hash:'f'.repeat(64)}]){
    snapshot.events=[{seq:'1',local_id:'1',event:e,hash:commitment(e),...patch}];assert.equal((await sourceCaptureStatus(inspector)).status,'CAPTURE_GAP');
  }
  snapshot.events=[{seq:'1',local_id:'1',event:e,hash:commitment(e)}];snapshot.control.seq='2';assert.ok((await sourceCaptureStatus(inspector)).invalidSequences.includes('HEAD'));
  snapshot.control.seq='1';snapshot.control.head='f'.repeat(64);assert.ok((await sourceCaptureStatus(inspector)).invalidSequences.includes('HEAD'));
  snapshot.events=Array(1001).fill(snapshot.events[0]);assert.equal((await sourceCaptureStatus(inspector)).status,'INSPECTION_LIMIT');
  snapshot.events=[];snapshot.missing=Array(1001).fill({id:'9'});assert.equal((await sourceCaptureStatus(inspector)).status,'INSPECTION_LIMIT');
});
