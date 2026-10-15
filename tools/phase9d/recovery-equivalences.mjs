import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {hash} from './baseline.mjs';
const output='output/phase9d-broker-recovery-2026-10-14',file='tools/phase9d/recovery-receipt.mjs',source=await readFile(file,'utf8');
assert.equal(source.split('a<b?-1:1').length,2);
const original=await import('./recovery-receipt.mjs'),temporary=new URL('.recovery-equivalence-'+randomUUID()+'.mjs',import.meta.url);
const mutant=source.replace('a<b?-1:1','a<=b?-1:1');await writeFile(temporary,mutant,{flag:'wx'});
let comparisons=0;
try{
  const changed=await import(temporary.href),objects=[{},null,0,true,'value',{z:1,a:2},[{b:2,a:1},null],{'😀':1,a:0,'é':2},Object.fromEntries([['same',1],['same',2]])];
  for(let i=0;i<100;i++)objects.push(Object.fromEntries(Array.from({length:10},(_,n)=>['key'+((n+i)%10),{a:n,z:i}])));
  for(const object of objects){assert.equal(changed.canonical(object),original.canonical(object));comparisons++;}
  const binding={receiptId:'a',requestId:'b',attemptId:'c',dispatchId:'d',configurationHash:'e',generation:'1',responseHash:null};
  for(const outcome of ['SUCCESS','BILLED_FAILURE','NO_DISPATCH'])for(const amount of [0,1,999999999]){
    const usage={outcome,input:amount,output:amount,minor:amount},key='synthetic-paired-equivalence-key-at-least-32';
    assert.deepEqual(changed.issueOfflineUsage(binding,usage,key),original.issueOfflineUsage(binding,usage,key));comparisons++;
  }
}finally{await unlink(temporary);}
await writeFile(join(output,'reviewed-equivalences.json'),JSON.stringify({source:file,sourceSha256:hash(source),mutantSha256:hash(mutant),replacement:'a <= b',comparisons,
  rationale:'Object.entries supplies distinct keys to sort. The comparator never compares equal keys. Strict/non-strict less-than have identical ordering on every supported object; duplicate input keys are already collapsed into one object property.',
  boundary:'Only the recorded Object.entries canonicalization composition. Source/composition changes invalidate this review.'},null,2));
console.log(JSON.stringify({status:'PASS',comparisons}));
