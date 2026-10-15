import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { verifyBaseline, hash } from './baseline.mjs';
import { executeIsolatedShadowWorker } from './worker-core.mjs';
import { minimizeEvidence } from './privacy.mjs';
import { createResponsibilityEvidence } from '../../backend/services/responsibilityEvidence.js';
const directory = new URL('../../output/phase9d-1-continuation-2026-10-13/', import.meta.url);
const sourceURL = new URL('./worker-core.mjs', import.meta.url), source = await readFile(sourceURL, 'utf8');
const report = JSON.parse(await readFile(new URL('mutation-worker-focused.json', directory)));
const file = report.files['tools/phase9d/worker-core.mjs'];
assert.equal(file.source, source); const baseline = await verifyBaseline();
const survivors = file.mutants.filter(value => value.status === 'Survived');
assert.equal(survivors.length, 2);
const instant = '2026-10-12T16:00:00.000Z';
const snapshot = minimizeEvidence(createResponsibilityEvidence({caseId:'equivalence',bookingId:'synthetic',
  caseType:'DRIVER_CANCELLATION',occurredAt:instant,clock:{now:()=>new Date(instant)}}).snapshot(), 'synthetic-only-key-at-least-32-bytes-long');
const connectionString = 'postgresql://shadow9d_worker:synthetic@localhost:1/rcs_verify_' + 'a'.repeat(32);
async function observe(execute) {
  const queries = [], results = [];
  const row = {id:1,snapshot:snapshot.snapshot,evidence_hash:snapshot.evidenceHash,attempts:1,lease_token:'00000000-0000-4000-8000-000000000001'};
  const client = {async connect(){},async end(){queries.push('END');},async query(sql, values){
    queries.push({sql,values});
    if(sql.includes('session_user AS actor'))return {rows:[{actor:'shadow9d_worker',effective:'shadow9d_worker',database:'rcs_verify_'+ 'a'.repeat(32),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]};
    if(sql.includes('.claim('))return {rows:[{value:row}]};
    if(sql.includes('.complete('))results.push(JSON.parse(values[2]));
    return {rows:[{value:true}]};
  }};
  const result = await execute({connectionString,mode:'resume'},{environment:{},clientFactory:()=>client});
  assert.equal(result.status,'COMPLETED');assert.equal(result.calls,1);
  assert.equal(results.length,1);assert.equal(results[0].route,'NEEDS_ADMIN_REVIEW');
  return {result,queries,results};
}
const original = await observe(executeIsolatedShadowWorker), witnesses = [];
for(const mutant of survivors) {
  const lines=source.split('\n'), {start,end}=mutant.location;
  assert.equal(start.line,end.line);assert.ok([36,37].includes(start.line));assert.equal(mutant.replacement,';');
  const removed=lines[start.line-1].slice(start.column-1,end.column-1);
  assert.ok(removed.startsWith('assert.'));lines[start.line-1]=lines[start.line-1].slice(0,start.column-1)+';'+lines[start.line-1].slice(end.column-1);
  const temporary = new URL('.worker-equivalence-'+randomUUID()+'.mjs',import.meta.url);
  try {
    await writeFile(temporary,lines.join('\n'),{flag:'wx'});
    const changed = await observe((await import(temporary.href)).executeIsolatedShadowWorker);
    assert.deepEqual(changed,original);
    witnesses.push({location:mutant.location,mutatorName:mutant.mutatorName,replacement:mutant.replacement,
      originalStatus:mutant.status,removed,observationSha256:hash(JSON.stringify(changed)),status:'EQUIVALENT_ON_FROZEN_COMPOSITION',
      boundary:'The fake SDK is called only by the unchanged frozen V5 factory. No external caller controls its questions or retry options. Baseline hashing is required; a future adapter change invalidates this review.'});
  } finally { await unlink(temporary); }
}
assert.equal(hash(await readFile(sourceURL)),hash(source));
const artifact={schema:'phase9d-worker-equivalence-v1',sourceSha256:hash(source),baseline,rawReportSha256:hash(await readFile(new URL('mutation-worker-focused.json',directory))),witnesses};
await writeFile(new URL('reviewed-worker-equivalences.json',directory),JSON.stringify(artifact,null,2));
console.log(JSON.stringify({witnesses:witnesses.length,status:'PASS',scope:'frozen internal offline transport only'}));
