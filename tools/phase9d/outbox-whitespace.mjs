import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'),output=join(root,'output/phase9d-outbox-broker-2026-10-13');
const directory=await mkdtemp(join(tmpdir(),'rcs-outbox-whitespace-')),empty=join(directory,'empty');await writeFile(empty,'',{flag:'wx'});
const files=(await readdir(join(root,'tools/phase9d'))).filter(name=>/^(outbox|export-)/.test(name)||['capsule.mjs','capsule-entry.mjs'].includes(name)).map(name=>'tools/phase9d/'+name);
files.push('backend/tests/phase9dExport.test.js','backend/tests/helpers/phase9dExportFixture.js','backend/tests/helpers/phase9dOutboxMutations.js',
  'backend/tests/integration/phase9dOutbox.test.js','backend/tests/integration/phase9dOutboxReplay.test.js',
  'docs/benchmarks/phase9d-outbox-checkpoint-2026-10-13.md','CONTEXT.md','ROADMAP.txt');
const records=[];
const clean=result=>[0,1].includes(result.status)&&result.stdout.trim()==='';
try{
  const bad=join(directory,'bad');await writeFile(bad,'synthetic whitespace witness \n',{flag:'wx'});
  const seeded=spawnSync('git',['diff','--no-index','--check','--',empty,bad],{cwd:root,windowsHide:true,encoding:'utf8'});
  assert.equal(clean(seeded),false);await unlink(bad);
  for(const file of files){
    const tracked=['CONTEXT.md','ROADMAP.txt'].includes(file);
    const args=tracked?['diff','--check','--',file]:['diff','--no-index','--check','--',empty,join(root,file)];
    const result=spawnSync('git',args,{cwd:root,windowsHide:true,encoding:'utf8'});
    records.push({file,scope:tracked?'actual tracked diff':'whole new/owned source',args,code:result.status,stdout:result.stdout,stderr:result.stderr,pass:tracked?result.status===0:clean(result)});
  }
  const record={files:records,seededFailure:{code:seeded.status,stdout:seeded.stdout,rejected:true},pass:records.every(row=>row.pass),
    boundary:'Git no-index implies difference exit 1 even with --check; empty check output and no error exit establish clean new sources. Tracked docs use actual diff exit 0; historical unrelated whitespace is preserved.'};
  await writeFile(join(output,'whitespace-attempt-'+Date.now()+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
  await writeFile(join(output,'whitespace.json'),JSON.stringify(record,null,2));
  assert.ok(record.pass);console.log(JSON.stringify({files:records.length,pass:true,seededWhitespaceRejected:true}));
}finally{await unlink(empty);}
