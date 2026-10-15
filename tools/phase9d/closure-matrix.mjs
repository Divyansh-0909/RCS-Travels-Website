import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {hash,verifyBaseline} from './baseline.mjs';
const output='output/phase9d-custody-closure-2026-10-15';await mkdir(output,{recursive:true});
const previous='output/phase9d-audit-custody-2026-10-14';
const manifest=JSON.parse(await readFile(previous+'/manifest.json'));
for(const [file,digest]of Object.entries(manifest.sources))if(hash(await readFile(file))!==digest)throw Error('ACCEPTED_SOURCE_CHANGED:'+file);
const old=JSON.parse(await readFile(previous+'/audit-coverage-matrix-current.json'));
const matrix=old.matrix.map((row,index)=>({id:'EVENT-'+String(index+1).padStart(2,'0'),requirement:row.action,
  producingEntryPoint:row.authority,eventSource:row.source,sourceHash:null,localTransaction:row.boundary,
  destination:'separate custody PostgreSQL server; per-source chain',requiredPrincipal:row.principal,
  delivery:'existing broker journal: durable at least once, REVIEW retry; other producers not independently delivered yet',
  existingTest:'backend/tests/integration/phase9dCustody.test.js: selected broker/permission recipe',
  missingTest:row.newCustody.startsWith('IMPLEMENTED')?'complete action/failure/restart matrix':'independent committed capture, delivery and suppression boundary',
  securityRisk:'Source-owner suppression before capture is not distinguishable from an event that never occurred without another observer',
  status:'PARTIAL'}));
for(const row of matrix)row.sourceHash=hash(await readFile(row.eventSource));
const requirements=[['A','Original-to-current reconciliation'],['B','Critical committed source/transport/broker coverage'],['C','Independent server denial delivery'],['D','Restricted custody runtime containers'],['E','Detectable compromised-verifier acknowledgement'],['F','Historical signing epochs and rotation'],['G','Bounded operational backlog and actual recovery'],['H','Read-only local versus externally audited status; promotion policy'],['I','Executable saved-input custody replay'],['J','Changed SQL security certification'],['K','Independent review and critical-code quality'],['L','Preserved reliability debt'],['M','Isolated acceptance stop criteria'],['N','Production and data boundaries'],['O','Validated source-bound deliverables']].map(([id,requirement])=>({id,requirement,status:id==='H'?'REQUIRES_OWNER_APPROVAL':'PARTIAL',existingTest:'14 October accepted manifest',missingTest:'Current continuation execution evidence',securityRisk:'Do not infer deployment or authority from isolated evidence'}));
await writeFile(output+'/acceptance-before.json',JSON.stringify({schema:'custody-closure-acceptance-v1',at:new Date().toISOString(),previousManifest:{file:previous+'/manifest.json',sha256:hash(await readFile(previous+'/manifest.json'))},baseline:await verifyBaseline(),matrix,requirements},null,2),{flag:'wx'});
await writeFile(output+'/prior-readiness.json',await readFile(previous+'/readiness-gates.json'),{flag:'wx'});
console.log(JSON.stringify({events:matrix.length,requirements:requirements.length}));
