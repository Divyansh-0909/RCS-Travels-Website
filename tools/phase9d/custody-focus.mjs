import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const round=process.argv[2]??'3';assert.match(round,/^[3-9]$/);
const report=JSON.parse(await readFile('output/phase9d-audit-custody-2026-10-14/mutation-raw.json'));
const ranges=new Set();
for(const [file,row]of Object.entries(report.files))for(const m of row.mutants)if(m.status!=='Killed'){
  const {start,end}=m.location;ranges.add(`${file}:${start.line}:${start.column-1}-${end.line}:${end.column-1}`);
}
await writeFile('tools/phase9d/custody-round'+round+'-stryker.config.mjs',"import base from './custody-stryker.config.mjs';\nexport default {...base,mutate:"+JSON.stringify([...ranges])+",jsonReporter:{fileName:'output/phase9d-audit-custody-2026-10-14/mutation-round"+round+".json'}};\n",{flag:'wx'});
console.log(JSON.stringify({ranges:ranges.size,ignoredMutations:0}));
