import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-transport-2026-10-13');
const rawReports=['mutation-transport.json','mutation-transport-focused.json','mutation-transport-round3.json','mutation-transport-round4.json'],all=new Map();
const identity=(file,m)=>JSON.stringify([file,m.location,m.mutatorName,m.replacement]);
const sources={};
for(const report of rawReports){const body=JSON.parse(await readFile(join(out,report)));
  for(const [file,value]of Object.entries(body.files)){
    const sha=hash(await readFile(join(root,file)));assert.equal(hash(value.source),sha,'SOURCE_DRIFT:'+file);sources[file]=sha;
    for(const m of value.mutants){const key=identity(file,m),prior=all.get(key);all.set(key,{file,location:m.location,mutatorName:m.mutatorName,replacement:m.replacement,
      status:m.status,observations:[...(prior?.observations??[]),{report,id:m.id,status:m.status}]});}
  }
}
assert.equal(all.size,514);
const equivalents=JSON.parse(await readFile(join(out,'reviewed-equivalences.json'))).reviewed;
const reviewed=new Map(equivalents.map(row=>[row.identity,row]));
for(const [key,row]of all){
  if(row.status==='Survived'){assert.equal(reviewed.get(key)?.pairedWitness,'PASS');assert.equal(reviewed.get(key).sourceSha256,sources[row.file]);row.review=reviewed.get(key);}
  else assert.equal(row.status,'Killed','UNCLOSED_MUTANT:'+key);
}
assert.equal(equivalents.length,6);
const summary={uniqueIdentities:all.size,killed:[...all.values()].filter(row=>row.status==='Killed').length,reviewedEquivalent:equivalents.length,
  meaningfulSurvivors:0,timeouts:0,ignored:0,errors:0};
await writeFile(join(out,'mutation-closure.json'),JSON.stringify({sources,rawReports,summary,meaningfulSurvivors:0,identities:[...all.values()],
  boundary:'Exact identity reconciliation within this seven-module framework campaign. Historical raw survivor/timeout statuses remain unchanged. Focused selection column correction is recorded in the retained configs; no mutation is ignored or merged with prior campaigns.'},null,2));
console.log(JSON.stringify(summary));
