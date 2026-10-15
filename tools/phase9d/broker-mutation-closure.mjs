import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-broker-2026-10-13');
const rawReports=['mutation-broker-round2.json','mutation-broker-round3.json','mutation-broker-round4.json','mutation-broker-round5.json','mutation-broker-round6.json'],identities=new Map(),sources={};
for(const report of rawReports){const data=JSON.parse(await readFile(join(out,report)));
  for(const[file,body]of Object.entries(data.files)){const sha=hash(await readFile(join(root,file)));assert.equal(hash(body.source),sha);sources[file]=sha;
    for(const mutant of body.mutants){const identity=JSON.stringify([file,mutant.location,mutant.mutatorName,mutant.replacement]),prior=identities.get(identity);
      identities.set(identity,{file,location:mutant.location,mutatorName:mutant.mutatorName,replacement:mutant.replacement,status:mutant.status,
        observations:[...(prior?.observations??[]),{report,id:mutant.id,status:mutant.status}]});}
  }
}
assert.equal(identities.size,358);const reviewedFile='reviewed-equivalences.json';
const reviewed=JSON.parse(await readFile(join(out,reviewedFile))).reviewed,reviews=new Map(reviewed.map(row=>[row.identity,row]));
for(const[identity,row]of identities){
  if(row.status==='Survived'){assert.equal(reviews.get(identity)?.pairedWitness,'PASS');assert.equal(reviews.get(identity).sourceSha256,sources[row.file]);row.review=reviews.get(identity);}
  else assert.equal(row.status,'Killed','UNCLOSED:'+identity);
}
const summary={uniqueIdentities:identities.size,killed:[...identities.values()].filter(row=>row.status==='Killed').length,reviewedEquivalent:reviewed.length,meaningfulSurvivors:0,timeouts:0,ignored:0,errors:0};
assert.equal(summary.killed,354);assert.equal(summary.reviewedEquivalent,4);
await writeFile(join(out,'mutation-closure.json'),JSON.stringify({status:'PASS',sources,rawReports,reviewedFile,summary,identities:[...identities.values()],
  boundary:'Exact file/location/mutator/replacement reconciliation for the current six-module source epoch. First campaign used the preceding diagnostic-pause source and is retained separately. Raw statuses are unchanged; bounded independent test observers killed earlier hanging mutations rather than altering production deadlines or statuses.'},null,2));console.log(JSON.stringify(summary));
