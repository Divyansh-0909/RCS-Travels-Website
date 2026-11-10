import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {hash} from './baseline.mjs';
import {closureCoreScope as scope} from './closure-scope.mjs';
const output=resolve(process.env.CUSTODY_OUTPUT??'output/phase9d-custody-local-2026-10-16'),id='quality-'+Date.now()+'-'+randomUUID(),destination=join(output,id);
const current=Object.fromEntries(await Promise.all(scope.map(async file=>[file,hash(await readFile(file))]))),windows=[];
for(const name of (await readdir(output)).filter(n=>/^(unit|db|lineage)-.*\.json$/.test(n))){
  const record=JSON.parse(await readFile(join(output,name)));if(record.code===0&&record.sourcesUnchanged&&scope.every(file=>record.sources[file]===current[file]))windows.push({execution:name,start:Date.parse(record.started),end:Date.parse(record.finished)});
}
assert.ok(windows.some(w=>w.execution.startsWith('unit-')),'CURRENT_UNIT_WINDOW_REQUIRED');
await mkdir(destination,{recursive:true});const directory=join(destination,'coverage-copy');await mkdir(directory);const files=[];
const included=new Set(scope.map(file=>resolve(file).toLowerCase()));const matches=url=>{try{return included.has(resolve(fileURLToPath(url)).toLowerCase());}catch{return false;}};
for(const name of (await readdir(join(output,'coverage-raw'),{recursive:true})).filter(n=>/^coverage-\d+-\d+-\d+\.json$/.test(n.split(/[\\/]/).at(-1)))){
  const at=Number(name.split(/[\\/]/).at(-1).split('-')[2]);if(!windows.some(w=>w.start<=at&&at<=w.end))continue;
  const bytes=await readFile(join(output,'coverage-raw',name)),original=JSON.parse(bytes),result=original.result.filter(s=>matches(s.url));
  const maps=Object.fromEntries(Object.entries(original['source-map-cache']??{}).filter(([url])=>matches(url)));
  await writeFile(join(directory,name.split(/[\\/]/).at(-1)),JSON.stringify({...original,result,...(original['source-map-cache']?{'source-map-cache':maps}:{})}),{flag:'wx'});
  files.push({name,rawSha256:hash(bytes),scopedCountersSha256:hash(JSON.stringify(result)),scopedMapsSha256:hash(JSON.stringify(maps))});
}
const quality=join(tmpdir(),'rcs-phase1-quality-tools/node_modules');
const invoke=(args,extra={})=>{const result=spawnSync(process.execPath,args,{windowsHide:true,stdio:'pipe',...extra});assert.equal(result.status,0,result.stderr?.toString());return result.stdout.toString();};
invoke([join(quality,'c8/bin/c8.js'),'report','--all','--src=.','--extension=.mjs','--temp-directory='+directory,'--report-dir='+join(destination,'coverage'),'--reporter=json','--reporter=json-summary',...scope.map(file=>'--include='+file)]);
invoke(['backend/tests/quality/measure.cjs','--coverage',join(destination,'coverage/coverage-final.json'),'--output',join(destination,'quality.json')],{env:{...process.env,RCS_QUALITY_SCOPED_FILES:scope.join(',')}});
const clonePackage=JSON.parse(await readFile(join(quality,'jscpd/package.json')));
invoke([resolve(quality,'jscpd',clonePackage.bin.jscpd),'--min-lines','5','--min-tokens','50','--reporters','json','--output',join(destination,'clones'),...scope]);
const total=JSON.parse(await readFile(join(destination,'coverage/coverage-summary.json'))).total;
const toolRoot=resolve(quality,'..'),toolchain={packageSha256:hash(await readFile(join(toolRoot,'package.json'))),lockSha256:hash(await readFile(join(toolRoot,'package-lock.json'))),packages:{}};
for(const name of ['eslint','@eslint/js','globals','c8','jscpd','typhonjs-escomplex','eslint-plugin-sonarjs','@babel/parser','typescript'])toolchain.packages[name]=JSON.parse(await readFile(join(quality,name,'package.json'))).version;
const record={id,scope,sources:current,directory,windows,files,originalFilesModified:false,total,toolchain,executorSha256:hash(await readFile(new URL(import.meta.url))),acceptance:'MEASUREMENT_ONLY',capsuleEntryCoverage:'NOT_INCLUDED_REQUIRES_ACTUAL_CAPSULE_COUNTERS'};
await writeFile(join(destination,'manifest.json'),JSON.stringify(record,null,2),{flag:'wx'});console.log(JSON.stringify({id,total,acceptance:record.acceptance}));
