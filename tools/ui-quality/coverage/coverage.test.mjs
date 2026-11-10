import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parse, serialize, validate } from './core.mjs';
import { safePreviewPath, previewRequest } from './preview.mjs';
import { viewerHandler } from '../../handoff/viewer-server.mjs';
import { applyAndroidObservations } from './android-observations.mjs';

const rows=parse(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv','utf8'));
const issues=JSON.parse(fs.readFileSync('tools/ui-quality/coverage/issues.json'));
const routes=JSON.parse(fs.readFileSync('tools/ui-quality/coverage/discovered-routes.json'));
const options={issues,routes};
test('canonical inventory resolves every discovered route, real source and parent',()=>{
  const result=validate(rows,options);assert.equal(result.sourceTraces,rows.length);assert(rows.some(r=>r.kind==='dialog'));assert(rows.some(r=>r.kind==='subscreen'));
});
test('CSV quotes, commas, Unicode and multiline data round-trip without changing IDs',()=>{
  const sample=structuredClone(rows.slice(0,2));sample[0].screen='A "save, retry"\nहिन्दी section';sample[1].evidence_urls=['https://drive.google.com/a?x=1,2'];
  assert.deepEqual(parse(serialize(sample)),sample);assert.equal(serialize(parse(serialize(rows))),serialize(rows));
});
test('the initial CSV schema upgrades severity without changing stable IDs or history',()=>{
  const csv=serialize(rows),records=csv.split('\n');
  // Test the documented one-column migration using a record without embedded newlines.
  const index=records[0].split(',').indexOf('issue_severity');
  const oldHeader=records[0].split(',').filter((_,i)=>i!==index).join(',');
  const sample=rows.find(r=>!r.issue_ids.length),encoded=serialize([sample]).split('\n')[1];
  const legacy=encoded.replace(',"NOT_APPLICABLE","NOT_APPLICABLE",',',"NOT_APPLICABLE",');
  const migrated=parse(oldHeader+'\n'+legacy+'\n');assert.equal(migrated[0].id,sample.id);assert.equal(migrated[0].issue_severity,'NOT_APPLICABLE');assert.equal(migrated[0].verification_status,sample.verification_status);
});
test('duplicate stable IDs and duplicate logical surfaces fail',()=>{
  assert.throws(()=>validate([...rows,rows[0]],options),/Duplicate ID/);
  const copy={...rows[0],id:'A.DUPLICATE'};assert.throws(()=>validate([...rows,copy],options),/Duplicate logical surface/);
});
test('orphan parents, cycles, issue references and missing registered routes fail',()=>{
  const copy=structuredClone(rows);copy[0].parent_id='A.MISSING';assert.throws(()=>validate(copy,options),/Unresolved parent/);
  copy[0].parent_id=copy[0].id;assert.throws(()=>validate(copy,options),/Parent cycle/);
  copy[0].parent_id='';copy[0].issue_ids=['invented'];assert.throws(()=>validate(copy,options),/Orphan issue/);
  assert.throws(()=>validate(rows,{...options,routes:[{platform:'website',path:'/invented-production-page'}]}),/route omitted/);
});
test('invalid statuses and stale source traces are rejected',()=>{
  const copy=structuredClone(rows);copy[0].audit_status='COMPLETE';assert.throws(()=>validate(copy,options),/Invalid audit_status/);
  copy[0].audit_status=rows[0].audit_status;copy[0].source_token='This is not actual RCS code';assert.throws(()=>validate(copy,options),/real code evidence/);
});
test('a source inspection or screenshot cannot become a verified functional result',()=>{
  const copy=structuredClone(rows),row=copy.find(r=>r.verification_status==='NOT_RUN');row.verification_status='VERIFIED';row.audit_dimensions=['render'];row.last_review_phase='P05';row.last_review_date='2026-10-23';row.evidence_urls=['https://drive.google.com/proof'];row.verification_levels=['SOURCE_ONLY','FIXTURE_RENDER'];
  assert.throws(()=>validate(copy,options),/not functional verification/);
});
test('parent evidence never changes unreviewed children',()=>{
  const copy=structuredClone(rows),parent=copy.find(r=>r.id==='W.SETTINGS'),children=copy.filter(r=>r.parent_id===parent.id),before=structuredClone(children);
  Object.assign(parent,{verification_status:'VERIFIED',audit_dimensions:['keyboard'],verification_levels:['KEYBOARD'],last_review_phase:'P05',last_review_date:'2026-10-23',evidence_urls:['https://drive.google.com/parent-only']});
  validate(copy,options);assert.deepEqual(children,before);assert(children.some(c=>c.verification_status==='NOT_RUN'));
});
test('five P03 visual findings remain FAIL / OWNER_DEFERRED, including +30px',()=>{
  const deferred=rows.filter(r=>r.issue_ids.some(id=>id.startsWith('P03-'))&&r.owner_decision==='OWNER_DEFERRED');assert.equal(deferred.length,5);
  assert.deepEqual(deferred.flatMap(r=>r.issue_ids).sort(),['P03-H1','P03-H2','P03-H3','P03-O1','P03-O2']);
  assert(deferred.every(r=>r.verification_status==='FAIL'&&r.implementation_status==='OWNER_DEFERRED'));
  assert(issues.find(i=>i.id==='P03-H3').description.includes('+30px'));
});
test('P01 and P04 backfill is bounded, and native nodes do not imply spoken TalkBack',()=>{
  const p01=rows.filter(r=>r.last_review_phase==='P01'&&r.verification_status==='VERIFIED');assert.deepEqual(p01.map(r=>r.id).sort(),['W.SETTINGS.APPEARANCE','W.SETTINGS.NOTIFICATIONS']);
  const samples=rows.filter(r=>r.issue_ids.some(id=>id.startsWith('P01-AXE-')));assert.equal(samples.length,9);assert(samples.every(r=>r.verification_status==='FAIL'&&r.verification_levels.includes('AXE')));
  assert.equal(rows.find(r=>r.id==='W.HOME').last_review_phase,'P03');assert.equal(rows.find(r=>r.id==='W.OUTSTATION').last_review_phase,'P03');
  const p04=rows.filter(r=>r.last_review_phase==='P04'&&r.verification_status==='VERIFIED');assert.deepEqual(p04.flatMap(r=>r.issue_ids).sort(),['P04-A1','P04-A2']);
  assert.equal(rows.find(r=>r.id==='A.ACCOUNT').verification_status,'NOT_RUN');
  const copy=structuredClone(rows);copy.find(r=>r.issue_ids.includes('P04-A2')).audit_dimensions.push('spoken_talkback');assert.throws(()=>validate(copy,options),/not spoken TalkBack/);
});
test('Android reachability observations remain separate from historical verification',()=>{
  assert(rows.filter(r=>r.platform==='android').every(r=>['DEVICE_OFFLINE','DEVICE_OBSERVED','FIXTURE_REQUIRED','REDIRECT','UNREACHABLE','EXTERNAL_HANDOFF','DEV_ONLY'].includes(r.reachability)));
  assert(rows.filter(r=>r.platform==='android'&&r.verification_status==='VERIFIED').every(r=>r.last_review_phase!=='P05'));
});
test('connected native observations need evidence and cannot complete audits or children',()=>{
  const copy=structuredClone(rows),before=structuredClone(copy),observation={phase:'P05',status:'PASS',scope:'NATIVE_NAVIGATION_REACHABILITY_ONLY',at:'2026-10-23',evidence:{url:'https://drive.google.com/file/d/test-device-evidence/view',sha256:'a'.repeat(64)},entries:[{id:'A.ACCOUNT',navigation:['Account tab']}]};
  assert.throws(()=>applyAndroidObservations(structuredClone(rows),{...observation,evidence:{}}));
  const unsupported=structuredClone(copy);unsupported.find(r=>r.id==='A.ACCOUNT').reachability='DEVICE_OBSERVED';unsupported.find(r=>r.id==='A.ACCOUNT').evidence_urls=[];
  assert.throws(()=>validate(unsupported,options),/requires exact device evidence/);
  applyAndroidObservations(copy,observation);validate(copy,options);
  for(const row of copy){const old=before.find(r=>r.id===row.id);for(const field of ['audit_status','audit_dimensions','owner_decision','implementation_status','verification_status','last_review_phase','last_review_date'])assert.deepEqual(row[field],old[field],row.id+' '+field);}
  assert.equal(copy.find(r=>r.id==='A.ACCOUNT').reachability,'DEVICE_OBSERVED');
  assert.equal(copy.find(r=>r.id==='A.ACCOUNT.LANGUAGE').reachability=== 'DEVICE_OBSERVED',before.find(r=>r.id==='A.ACCOUNT.LANGUAGE').reachability==='DEVICE_OBSERVED');
});
test('preview navigation allows only existing synthetic actors and explicit safe paths',()=>{
  const allowed=new Set(['/settings','/dashboard','/dev/vehicle?step=searching']);
  assert.deepEqual(previewRequest('/?actor=admin&to=%2Fdashboard',allowed),{actor:'admin',target:'/dashboard'});
  for(const path of ['https://production.example','//external','/\\external','/%2f%2fexternal','/api/bookings','/fixture-auth','/__review/open','/settings\r\nLocation: x'])assert.equal(safePreviewPath(path),false,path);
  assert.equal(previewRequest('/?actor=owner&to=%2Fsettings',allowed),null);
  assert.equal(previewRequest('/?actor=admin&to=%2Funknown',allowed),null);
});
test('coverage API is loopback-host checked, GET-only and returns canonical records',async()=>{
  const config={root:process.cwd(),runtime:'output/handoff',port:0,previewUrl:'http://127.0.0.1:1575'};
  const server=http.createServer(viewerHandler(config,{state:{}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.port=server.address().port;
  const url='http://127.0.0.1:'+config.port;
  try{
    const response=await fetch(url+'/api/coverage');assert.equal(response.status,200);assert.deepEqual((await response.json()).rows,rows);
    assert.equal((await fetch(url+'/api/coverage',{method:'POST'})).status,405);
    const forbidden=await new Promise((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port:config.port,path:'/api/coverage',headers:{Host:'external.example'}},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});request.once('error',reject);});
    assert.equal(forbidden,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
