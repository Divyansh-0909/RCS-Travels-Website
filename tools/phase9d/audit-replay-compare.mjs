import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash} from './baseline.mjs';
import {commitment} from './custody-protocol.mjs';
import {verificationRegistry,historicalVerification} from './closure-keys.mjs';
const output=resolve(process.env.CUSTODY_OUTPUT??'output/phase9d-custody-closure-cloud-2026-10-15');
const read=async path=>{const file=resolve(path),inside=relative(output,file);assert.ok(!inside.startsWith('..')&&!inside.includes(':')&&inside.endsWith('.json'));const bytes=await readFile(file);assert.ok(bytes.length<10485760);return {file:inside,sha256:hash(bytes),value:JSON.parse(bytes)};};
const runs=await Promise.all(process.argv.slice(2).map(read));assert.equal(runs.length,2);assert.notEqual(runs[0].file,runs[1].file);
for(const {value}of runs){
  assert.equal(value.status,'PASS');assert.equal(value.outcomeSha256,hash(JSON.stringify(value.outcome)));
  const registry=verificationRegistry(value.keys.map(row=>({keyId:row.key_id,publicKey:row.public_key,status:row.status}))),chains=new Map(),ids=new Set(),sequences=new Set();
  for(const {event,receipt}of [...value.receipts].sort((a,b)=>a.event.source.localeCompare(b.event.source)||Number(a.event.sequence)-Number(b.event.sequence))){
    const head=chains.get(event.source)??{sequence:0,hash:'0'.repeat(64)};
    assert.equal(Number(event.sequence),head.sequence+1);assert.equal(event.previous,head.hash);
    assert.equal(historicalVerification(receipt,event,registry).currentlyTrusted,true);
    assert.ok(!ids.has(receipt.body.receipt));ids.add(receipt.body.receipt);
    assert.ok(!sequences.has(receipt.body.custodySequence));sequences.add(receipt.body.custodySequence);
    chains.set(event.source,{sequence:Number(event.sequence),hash:commitment(event)});
  }
  assert.equal(chains.size,4);assert.equal(value.outcome.operativeConsequences,0);assert.equal(value.outcome.fakeProviderCalls,1);
  assert.deepEqual(value.outcome.final,value.outcome.committed);
}
assert.equal(runs[0].value.inputSha256,runs[1].value.inputSha256);assert.deepEqual(runs[0].value.outcome,runs[1].value.outcome);
const report={schema:'custody-saved-reconstruction-comparison-v1',status:'PASS',runs:runs.map(({file,sha256})=>({file,sha256})),inputSha256:runs[0].value.inputSha256,
  canonicalOutcomeSha256:runs[0].value.outcomeSha256,checks:['identical saved input commitment','fresh executable outcomes agree','all receipt signatures and historical key identities valid','per-source chains contiguous','receipt and custody sequence identities unique','financial state preserved after committed incident','zero operative consequences'],
  equivalence:'Generated database/request/attempt/dispatch/receipt/key/session identities are checked inside each execution. Event commitments/signatures bind those actual identities, so cryptographic bytes can differ across executions. Controlled source clocks, original journal identities, evidence hashes, configuration, accounting and ordered lineage agree. Server observation wall time/session identity differ.',
  limitations:['No exact UI/OS replay','No byte-identical signatures or generated identifiers','Public observations are verified here; actual database queries were executed in the two reconstruction runs','Unavailable historical frozen manifest is not reconstructed']};
await writeFile(join(output,'replay-comparison-'+randomUUID()+'.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({status:report.status,canonicalOutcomeSha256:report.canonicalOutcomeSha256}));
