import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createPublicKey} from 'node:crypto';
import {verifyReceipt,validateEvent,keyIdentity,commitment} from './custody-protocol.mjs';
import {hash} from './baseline.mjs';
const out=resolve('output/phase9d-audit-custody-2026-10-14'),path=resolve(process.argv[2]),name=relative(out,path);
assert.ok(!name.startsWith('..')&&!name.includes(':')&&/^custody-witness-[a-f0-9-]+\.json$/.test(name));
const bytes=await readFile(path);assert.ok(bytes.length<1048576);const record=JSON.parse(bytes);
assert.equal(record.status,'PASS');assert.equal(record.schema,'custody-execution-v1');
const keys=new Map();for(const [id,pem]of Object.entries(record.verificationKeys)){const key=createPublicKey(pem);assert.equal(keyIdentity(key),id);keys.set(id,key);}
assert.equal(record.localEvents.length,record.remoteEvents.length);let previous='0'.repeat(64),custodySequence=0n;
for(let i=0;i<record.localEvents.length;i++){
  const local=record.localEvents[i],remote=record.remoteEvents[i];validateEvent(local.event);assert.equal(local.seq,String(i+1));assert.equal(local.event.sequence,local.seq);assert.equal(local.event.previous,previous);
  assert.equal(commitment(local.event),local.hash);assert.equal(remote.hash,local.hash);assert.deepEqual(remote.event,local.event);
  assert.ok(Number.isSafeInteger(remote.seq)&&Number.isSafeInteger(remote.custody_seq));assert.equal(String(remote.seq),local.seq);
  const body=verifyReceipt(local.receipt,local.event,keys);assert.equal(body.receipt,remote.receipt);assert.equal(body.custodySequence,String(remote.custody_seq));
  assert.ok(BigInt(body.custodySequence)>custodySequence);custodySequence=BigInt(body.custodySequence);previous=local.hash;
}
assert.equal(record.financialUnchanged,true);assert.deepEqual(record.outcome,{guardedResults:1,route:'NEEDS_ADMIN_REVIEW',consequences:0});
const result={schema:'saved-custody-observation-audit-v1',code:0,witness:name,witnessHash:hash(bytes),events:record.localEvents.length,publicReceiptProofsVerified:true,providerCalls:0,databaseCalls:0,fullEventReplay:false,checkedAt:new Date().toISOString()};
await writeFile(join(out,'receipt-audit-'+name),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
