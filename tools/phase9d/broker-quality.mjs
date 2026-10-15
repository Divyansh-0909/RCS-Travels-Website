import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {hash} from './baseline.mjs';
const output=resolve('output/phase9d-broker-2026-10-13');
const scope=['session','offline','execution','guard','child','replay'].map(name=>'tools/phase9d/broker-'+name+'.mjs');
const current=Object.fromEntries(await Promise.all(scope.map(async file=>[file,hash(await readFile(file))]))),windows=[];
for(const name of (await readdir(output)).filter(name=>/^(unit|integration)-.*\.json$/.test(name))){
  const record=JSON.parse(await readFile(join(output,name)));
  if(record.code===0&&record.sourcesUnchanged&&scope.every(file=>record.sources[file]===current[file]))windows.push({execution:name,start:Date.parse(record.started),end:Date.parse(record.finished)});
}
assert.ok(windows.some(row=>row.execution.startsWith('unit-'))&&windows.some(row=>row.execution.startsWith('integration-')));
const directory=join(output,'coverage-report-copy-'+randomUUID());await mkdir(directory,{recursive:true});
const included=new Set(scope.map(file=>resolve(file).toLowerCase()));
const matches=url=>{try{return included.has(resolve(fileURLToPath(url)).toLowerCase());}catch{return false;}};
const files=[];
for(const name of (await readdir(join(output,'coverage-raw'))).filter(name=>/^coverage-\d+-\d+-\d+\.json$/.test(name))){
  const at=Number(name.split('-')[2]);if(!windows.some(window=>window.start<=at&&at<=window.end))continue;
  const bytes=await readFile(join(output,'coverage-raw',name)),original=JSON.parse(bytes),result=original.result.filter(script=>matches(script.url));
  const maps=Object.fromEntries(Object.entries(original['source-map-cache']??{}).filter(([url])=>matches(url)));
  await writeFile(join(directory,name),JSON.stringify({...original,result,...(original['source-map-cache']?{'source-map-cache':maps}:{})}));
  files.push({name,rawSha256:hash(bytes),scopedCountersSha256:hash(JSON.stringify(result)),scopedMapsSha256:hash(JSON.stringify(maps))});
}
await writeFile(join(output,'coverage-custody.json'),JSON.stringify({scope,sources:current,directory,windows,files,originalFilesModified:false},null,2));
const quality=join(tmpdir(),'rcs-phase1-quality-tools/node_modules');
const invoke=(args,extra={})=>{const result=spawnSync(process.execPath,args,{windowsHide:true,stdio:'inherit',...extra});assert.equal(result.status,0);};
invoke([join(quality,'c8/bin/c8.js'),'report','--all','--src=.','--extension=.mjs','--temp-directory='+directory,'--report-dir='+join(output,'coverage'),'--reporter=json','--reporter=json-summary',...scope.map(file=>'--include='+file)]);
invoke(['backend/tests/quality/measure.cjs','--coverage',join(output,'coverage/coverage-final.json'),'--output',join(output,'quality.json')],{env:{...process.env,RCS_QUALITY_SCOPED_FILES:scope.join(',')}});
invoke([join(quality,'jscpd/run-jscpd.js'),'--min-lines','5','--min-tokens','50','--reporters','json','--output',join(output,'clones'),...scope]);
console.log(JSON.stringify(JSON.parse(await readFile(join(output,'coverage/coverage-summary.json'))).total));
