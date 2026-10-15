// Hash validation only. Never executes receipts, providers, tests or application code.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dir='output/proofloop-project-wide-audit-2026-10-11';
const out=path.join(root,dir);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function identity(p){try{const b=await fs.readFile(path.resolve(root,p));return {path:p,sha256:hash(b),bytes:b.length};}catch(e){return {path:p,status:'MISSING_OR_UNREADABLE',code:e.code};}}
const inventory=JSON.parse(await fs.readFile(path.join(out,'repository-inventory.json'),'utf8'));
const sourceChecks=[];
for(const f of inventory.files.filter(f=>f.sha256)){const now=await identity(f.path);sourceChecks.push({...now,baselineSha256:f.sha256,status:now.sha256===f.sha256?'UNCHANGED':'CHANGED_OR_MISSING'});}
const historical=[];
for(const p of ['output/phase9-ui-2026-10-10/execution-manifest.json','output/phase9-native-device-2026-10-10/execution-manifest.json']){
 const content=await fs.readFile(path.resolve(root,p),'utf8'),m=JSON.parse(content),base=path.posix.dirname(p),sources=[],artifacts=[];
 for(const [file,sha256]of Object.entries(m.sources)){const now=await identity(file);sources.push({...now,recordedSha256:sha256,status:now.sha256===sha256?'CURRENT_SOURCE_MATCH':'HISTORICAL_SOURCE_DRIFT_OR_MISSING'});}
 const records=Array.isArray(m.artifacts)?m.artifacts:Object.entries(m.artifacts).map(([file,sha256])=>({file:base+'/'+file,sha256}));
 for(const a of records){const now=await identity(a.file);artifacts.push({...now,recordedSha256:a.sha256,status:now.sha256===a.sha256?'BYTE_HASH_MATCH':'MISMATCH_OR_MISSING'});}
 let frozen=m.verification?.frozenV5?.sourceManifest||[];
 if(!frozen.length&&m.frozenV5?.manifest?.file){const fm=JSON.parse(await fs.readFile(path.resolve(root,m.frozenV5.manifest.file),'utf8'));const candidate=fm.sources||fm.sourceManifest||fm.sourceHashes||fm.sourceIdentities||[];frozen=Array.isArray(candidate)?candidate:Object.entries(candidate).map(([file,sha256])=>({file,sha256}));}
 const freezeChecks=[];
 for(const f of frozen){const file=f.file||f.path||f.source;const sha=f.sha256||f.hash;if(!file||!sha){freezeChecks.push({status:'UNSUPPORTED_MANIFEST_RECORD_SHAPE'});continue;}const now=await identity(file);freezeChecks.push({...now,recordedSha256:sha,status:now.sha256===sha?'UNCHANGED':'DRIFT_OR_MISSING'});}
 const selected=[];
 for(const r of m.selectedNativeRuns||m.receipts||[]){const file=r.receipt||r.file||r.path;if(!file)continue;const target=file.startsWith('output/')?file:base+'/'+file;const now=await identity(target);selected.push({...now,recordedSha256:r.sha256,status:now.sha256===r.sha256?'BYTE_HASH_MATCH':'MISMATCH_OR_MISSING',execution:'HISTORICAL_NOT_REEXECUTED',recordedExitCode:r.exitCode});}
 const unsigned={...m};delete unsigned.integrity;
 historical.push({manifest:p,manifestSha256:hash(content),sources,artifacts,selectedReceipts:selected,frozenV5:freezeChecks,manifestIntegrity:m.integrity?hash(JSON.stringify(unsigned))===m.integrity?'JSON_COMPACT_HASH_MATCH':'ALGORITHM_NOT_CONFIRMED':'NOT_PRESENT',recordedStatus:m.status,currentSourceMatched:sources.filter(x=>x.status==='CURRENT_SOURCE_MATCH').length,currentSourceDrifted:sources.filter(x=>x.status!=='CURRENT_SOURCE_MATCH').length,artifactMatched:artifacts.filter(x=>x.status==='BYTE_HASH_MATCH').length,artifactMismatch:artifacts.filter(x=>x.status!=='BYTE_HASH_MATCH').length,limitations:'Byte-hash verification preserves source-bound historical evidence; no executable replay/model evaluation/browser/native journey was rerun.'});
}
const currentHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const h0=await identity('C:/Users/singh/.codex/attachments/3442fb64-5ca8-43fd-b7d8-0a0391e9a467/Pasted text.txt');
const supplemental=[];for(const p of ['output/proofloop-phase1-7-verification-2026-10-09/history/SPEC-ARCH.md','output/proofloop-phase1-7-verification-2026-10-09/history/SPEC-VM.md','output/phase9-native-device-2026-10-10/coverage-source-final/coverage-summary.json','output/phase9-native-device-2026-10-10/coverage-current-eight/coverage-summary.json','docs/benchmarks/responsibility-v5-final-freeze-2026-10-08.md'])supplemental.push(await identity(p));
const result={checkedAt:new Date().toISOString(),timezoneForReport:'Asia/Calcutta',baselineStartedAt:inventory.startedAt,gitHeadBaseline:inventory.gitHead,gitHeadCurrent:currentHead,headUnchanged:inventory.gitHead===currentHead,sourceChecks,sourceDriftDuringAudit:sourceChecks.filter(s=>s.status!=='UNCHANGED'),historical,h0,supplemental,limitations:['Baseline is a live working-tree identity ledger, not an atomic filesystem snapshot','Excluded restricted .env/private key/device/profile/data directories were not read','Files without baseline SHA are metadata-accounted, not content-attested','Historical current-source drift does not invalidate immutable historical receipt bytes; it limits applicability to current code','No production DB/provider/configuration query or test/model/UI execution'],auditOnlyWrites:['docs/audits/proofloop-project-wide/','output/proofloop-project-wide-audit-2026-10-11/']};
await fs.writeFile(path.join(out,'evidence-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({headUnchanged:result.headUnchanged,baselineSourceChecks:sourceChecks.length,changedDuringAudit:result.sourceDriftDuringAudit.map(s=>s.path),historical:historical.map(h=>({manifest:h.manifest,sourceMatch:h.currentSourceMatched,sourceDrift:h.currentSourceDrifted,artifactMatch:h.artifactMatched,artifactMismatch:h.artifactMismatch,frozen:h.frozenV5.length,frozenUnchanged:h.frozenV5.filter(x=>x.status==='UNCHANGED').length,integrity:h.manifestIntegrity}))}));
