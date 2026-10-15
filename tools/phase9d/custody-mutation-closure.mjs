import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {hash} from './baseline.mjs';
const out='output/phase9d-audit-custody-2026-10-14';
const reports=['mutation-raw.json',...Array.from({length:4},(_,i)=>'mutation-round'+(i+2)+'.json')],inventory=new Map(),executions=[];
const identity=(file,m)=>JSON.stringify([file,m.location,m.mutatorName,m.replacement]);
for(const name of reports){
  const bytes=await readFile(out+'/'+name),report=JSON.parse(bytes);executions.push({name,hash:hash(bytes),count:0});
  for(const [file,row]of Object.entries(report.files)){
    assert.equal(row.source,await readFile(file,'utf8'),'SOURCE_DRIFT:'+file);
    for(const m of row.mutants){const id=identity(file,m);executions.at(-1).count++;
      if(name===reports[0]){assert.ok(!inventory.has(id));inventory.set(id,{file,location:m.location,mutator:m.mutatorName,replacement:m.replacement,status:m.status,observations:[]});}
      assert.ok(inventory.has(id),'UNKNOWN_MUTANT');const entry=inventory.get(id);entry.observations.push({report:name,id:m.id,status:m.status});
      if(entry.status!=='Killed')entry.status=m.status;
    }
  }
}
const reviews=JSON.parse(await readFile(out+'/reviewed-equivalences.json'));assert.equal(reviews.code,0);
for(const review of reviews.reviews){const id=identity(review.file,{location:review.location,mutatorName:review.mutator,replacement:review.replacement}),entry=inventory.get(id);assert.ok(entry&&entry.status==='Survived');assert.equal(hash(await readFile(review.file)),review.sourceHash);entry.status='REVIEWED_EQUIVALENT';}
const totals={};for(const row of inventory.values())totals[row.status]=(totals[row.status]??0)+1;
assert.equal(inventory.size,329);assert.deepEqual(totals,{Killed:319,REVIEWED_EQUIVALENT:10});
await writeFile(out+'/mutation-closure.json',JSON.stringify({code:0,unique:inventory.size,totals,meaningfulSurvivors:0,finalTimeouts:0,ignored:0,errors:0,reports:executions,
  notes:['Initial raw statuses remain unchanged.','Rounds 2/3 used incomplete coordinate selection; exact reconciliation keeps untested identities unresolved.','Round 4 corrects one-based report columns to zero-based range columns.','Round 5 closes digest/body-deadline timeouts and lost-ack fault omission.','Equivalence reviews are restricted to the stated network-decoded composition and must be invalidated on changes.'],identities:[...inventory.values()]},null,2));
console.log(JSON.stringify({unique:inventory.size,totals}));
