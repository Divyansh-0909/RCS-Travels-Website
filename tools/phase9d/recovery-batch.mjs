// Serial local verification: keep child startup deadlines meaningful under load.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readdir,readFile,writeFile} from 'node:fs/promises';
const output='output/phase9d-broker-recovery-2026-10-14',started=new Date().toISOString(),results=[];
async function run(args){
  const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';
  child.stdout.on('data',bytes=>{text+=bytes;process.stdout.write(bytes);});child.stderr.on('data',bytes=>{text+=bytes;process.stderr.write(bytes);});
  const code=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});results.push({args,code});assert.equal(code,0,'serial verification failed: '+args.join(' '));return text;
}
try{
  for(const mode of ['integration','adversarial'])await run(['tools/phase9d/recovery-run.mjs',mode]);
  await run(['tools/phase9d/recovery-run.mjs','record-replay']);
  const candidates=[];for(const name of (await readdir(output)).filter(name=>/^record-replay-.*\.json$/.test(name))){const record=JSON.parse(await readFile(output+'/'+name));if(record.code===0&&record.sourcesUnchanged&&record.started>=started)candidates.push(record);}
  candidates.sort((a,b)=>b.started.localeCompare(a.started));assert.ok(candidates[0]);
  await run(['tools/phase9d/recovery-run.mjs','saved-replay',candidates[0].recipePath]);
  await run(['tools/phase9d/recovery-capsule.mjs']);
  for(const mode of ['unit','typecheck','full'])await run(['tools/phase9d/recovery-run.mjs',mode]);
}catch(error){process.exitCode=1;console.error(error.message);}
await writeFile(output+'/serial-verification-'+Date.now()+'.json',JSON.stringify({started,finished:new Date().toISOString(),code:process.exitCode??0,results},null,2),{flag:'wx'});
