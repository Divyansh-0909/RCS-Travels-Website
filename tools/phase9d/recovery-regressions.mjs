// Keep disposable-database regressions serial so startup deadlines remain meaningful.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const output='output/phase9d-broker-recovery-2026-10-14',started=new Date().toISOString(),results=[];
try{
  for(const args of [
    ['tools/phase9d/broker-run.mjs','unit'],
    ['tools/phase9d/broker-run.mjs','integration'],
    ['tools/phase9d/transport-run.mjs','integration'],
    ['tools/phase9d/outbox-run.mjs','integration'],
    ['tools/phase9d/next-run.mjs','all-db'],
    ['tools/phase9d/next-run.mjs','replay'],
  ]){
    const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',bytes=>process.stdout.write(bytes));child.stderr.on('data',bytes=>process.stderr.write(bytes));
    const code=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
    results.push({args,code});assert.equal(code,0,'baseline regression failed: '+args.join(' '));
  }
}catch(error){process.exitCode=1;console.error(error.message);}
await writeFile(output+'/regression-verification-'+Date.now()+'.json',JSON.stringify({started,finished:new Date().toISOString(),code:process.exitCode??0,results},null,2),{flag:'wx'});
