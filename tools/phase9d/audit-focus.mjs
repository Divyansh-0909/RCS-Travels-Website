import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='output/phase9d-custody-closure-cloud-2026-10-15',report=JSON.parse(await readFile(output+'/mutation-initial.json','utf8')),ranges=new Set();
for(const [file,record]of Object.entries(report.files)){
  if(file.endsWith('closure-ingress.mjs'))continue;
  assert.equal(record.source,await readFile(file,'utf8'),'SOURCE_DRIFT:'+file);
  for(const mutant of record.mutants)if(mutant.status!=='Killed'){
    const {start,end}=mutant.location;ranges.add(`${file}:${start.line}:${start.column-1}-${end.line}:${end.column-1}`);
  }
}
ranges.add('tools/phase9d/closure-ingress.mjs');
await writeFile('tools/phase9d/audit-focus2-stryker.config.mjs',"import base from './audit-stryker.config.mjs';\nexport default {...base,mutate:"+JSON.stringify([...ranges])+",commandRunner:{command:'node --test --test-concurrency=1 backend/tests/phase9dCustodyClosure.test.js backend/tests/phase9dCustodyClosureTransport.test.js backend/tests/phase9dCustodyObserver.test.js backend/tests/phase9dCustodyBoundary.test.js backend/tests/phase9dCustodyAdversarial.test.js'},jsonReporter:{fileName:'"+output+"/mutation-focus2.json'}};\n",{flag:'wx'});
console.log(JSON.stringify({ranges:ranges.size,ignoredMutations:0,ingress:'full new source epoch'}));
