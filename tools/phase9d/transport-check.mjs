import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-transport-2026-10-13'),mode=process.argv[2];
assert.ok(['lint','whitespace'].includes(mode));
const files=[...(await readdir(join(root,'tools/phase9d'))).filter(name=>name.startsWith('transport-')).map(name=>'tools/phase9d/'+name),
  'backend/tests/phase9dTransport.test.js','backend/tests/integration/phase9dTransport.test.js','backend/tests/integration/phase9dTransportReplay.test.js','backend/tests/helpers/phase9dTransportMutations.js','backend/tests/helpers/phase9dTransportProcesses.js'];
const sources=Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(join(root,file)))])));
const commands=[];
const run=(binary,args)=>{const result=spawnSync(binary,args,{cwd:root,windowsHide:true,encoding:'utf8'});commands.push({binary,args,code:result.status,stdout:result.stdout,stderr:result.stderr});return result;};
if(mode==='lint'){
  const result=run(process.execPath,[join(tmpdir(),'rcs-phase1-quality-tools/node_modules/eslint/bin/eslint.js'),'--config','tools/phase9d/transport-eslint.config.mjs',...files.filter(file=>/\.(mjs|js)$/.test(file))]);
  process.exitCode=result.status;
}else{
  const empty=join(out,'empty-'+randomUUID()+'.txt');await writeFile(empty,'',{flag:'wx'});
  try{
    for(const file of [...files,'docs/benchmarks/phase9d-transport-checkpoint-2026-10-13.md']){
      const result=run('git',['diff','--no-index','--check',empty,join(root,file)]);
      assert.ok([0,1].includes(result.status)&&result.stdout==='','WHITESPACE:'+file);
    }
    assert.equal(run('git',['diff','--check','--','CONTEXT.md','ROADMAP.txt']).status,0);
  }finally{await unlink(empty);}
}
const code=process.exitCode??0;await writeFile(join(out,mode+'.json'),JSON.stringify({code,sources,commands,at:new Date().toISOString()},null,2));
console.log(JSON.stringify({mode,code,files:files.length}));
