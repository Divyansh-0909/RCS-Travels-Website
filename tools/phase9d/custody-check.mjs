import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-audit-custody-2026-10-14'),mode=process.argv[2];
assert.ok(['lint','whitespace','structural'].includes(mode));
const files=[...(await readdir(join(root,'tools/phase9d'))).filter(n=>n.startsWith('custody-')).map(n=>'tools/phase9d/'+n),'backend/tests/phase9dCustody.test.js','backend/tests/integration/phase9dCustody.test.js','backend/tests/helpers/phase9dCustodyFixture.js','backend/tests/helpers/phase9dCustodyFaultChild.js'];
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(join(root,f)))]))),commands=[];
const run=(binary,args)=>{const r=spawnSync(binary,args,{cwd:root,windowsHide:true,encoding:'utf8'});commands.push({binary,args,code:r.status,stdout:r.stdout,stderr:r.stderr});return r;};
if(mode==='lint')process.exitCode=run(process.execPath,[join(tmpdir(),'rcs-phase1-quality-tools/node_modules/eslint/bin/eslint.js'),'--config','tools/phase9d/custody-eslint.config.mjs',...files.filter(f=>/\.m?js$/.test(f))]).status;
if(mode==='whitespace'){
  files.push('docs/benchmarks/phase9d-1-audit-custody-checkpoint-2026-10-14.md');
  const empty=join(out,'empty-'+randomUUID()+'.txt');await writeFile(empty,'',{flag:'wx'});
  try{for(const file of files){const r=run('git',['diff','--no-index','--check',empty,join(root,file)]);assert.ok([0,1].includes(r.status)&&r.stdout==='','WHITESPACE:'+file);}}finally{await unlink(empty);}
}
if(mode==='structural'){
  const require=createRequire(join(tmpdir(),'rcs-phase1-quality-tools/package.json')),{ESLint}=require('eslint');
  const quality=JSON.parse(await readFile(join(out,'quality.json'))),lint=new ESLint({overrideConfigFile:true,overrideConfig:[{files:['**/*.mjs'],rules:{complexity:['error',{max:0,variant:'classic'}]}}]});
  const records=[];let cyclomatic=0;
  for(const row of quality.files){const [report]=await lint.lintFiles([row.file]),diagnostics=report.messages.filter(m=>m.ruleId==='complexity').map(m=>({line:m.line,column:m.column,message:m.message,complexity:Number(m.message.match(/complexity of (\d+)/)?.[1])}));
    assert.ok(diagnostics.length&&diagnostics.every(d=>d.complexity<22));cyclomatic=Math.max(cyclomatic,...diagnostics.map(d=>d.complexity));records.push({file:row.file,hash:sources[row.file],diagnostics});}
  const methods=quality.files.flatMap(f=>f.methods),summary={cyclomatic,cognitive:Math.max(...methods.map(m=>m.cognitive)),halsteadDifficulty:Math.max(...methods.map(m=>m.halsteadDifficulty)),crap:cyclomatic,physicalLines:Math.max(...quality.files.map(f=>f.physicalLines))};
  assert.ok(summary.cognitive<22&&summary.halsteadDifficulty<80&&summary.crap<25&&summary.physicalLines<500);
  await writeFile(join(out,'quality-verified.json'),JSON.stringify({summary,records,originalReportHash:hash(await readFile(join(out,'quality.json'))),scope:'four complete runtime modules; full ESLint line/column; CRAP at measured 100% statement coverage'},null,2));
}
const code=process.exitCode??0;await writeFile(join(out,mode+'.json'),JSON.stringify({code,at:new Date().toISOString(),sources,commands},null,2));console.log(JSON.stringify({mode,code}));
