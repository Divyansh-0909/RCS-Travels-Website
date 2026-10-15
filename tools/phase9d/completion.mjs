import { spawn } from 'node:child_process';
import { readFile,writeFile,readdir,mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyBaseline,output,hash } from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),id='remaining-'+Date.now()+'-'+randomUUID();
const state={schema:'phase9d-serialized-verification-v1',id,started:new Date().toISOString(),stages:[],productionShadow:'OFF',liveProviderCalls:0};
const save=()=>writeFile(output+'/'+id+'.json',JSON.stringify(state,null,2));
const commands=[['phase9',['tools/phase9d/run.mjs','phase9']],['replay',['tools/phase9d/run.mjs','replay']],['cross',['tools/phase9d/run.mjs','cross']]];
for(const [name,args] of commands){
  await verifyBaseline();
  const row={name,started:new Date().toISOString(),status:'RUNNING'};state.stages.push(row);await save();
  const child=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  const code=await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail)});
  row.code=code;row.finished=new Date().toISOString();row.status=code===0?'PASS':'FAIL';
  row.log=id+'-'+name+'.log';await writeFile(output+'/'+row.log,log,{flag:'wx'});
  await save();console.log(JSON.stringify(row));
  if(name==='replay'&&code===0){
    const reports=(await readdir(output)).filter(p=>/^replay-.*\.json$/.test(p));
    const records=await Promise.all(reports.map(async p=>({p,r:JSON.parse(await readFile(output+'/'+p))})));
    const record=records.sort((a,b)=>a.r.started.localeCompare(b.r.started)).at(-1);
    const pairedLog=await readFile(output+'/'+record.p.replace(/\.json$/,'.log'),'utf8');
    const run=pairedLog.match(/Replay evidence run: ([0-9]+-[a-f0-9-]+)/)?.[1];
    if(!run)throw new Error('Paired replay invocation identity missing');
    const folder=join(root,'output/phase9-final-integration-2026-10-09/replay',run);
    const copy=join(output,'saved-input',run);await mkdir(copy,{recursive:true});
    for(const file of (await readdir(folder)).filter(p=>p.endsWith('.json')))await writeFile(join(copy,file),await readFile(join(folder,file)),{flag:'wx'});
    const saved={name:'independent-saved-replay',started:new Date().toISOString(),status:'RUNNING',pairedRun:run};state.stages.push(saved);await save();
    const replay=spawn(process.execPath,['backend/tests/run-phase9.js','--receipts='+folder],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let replayLog='';replay.stdout.on('data',b=>replayLog+=b);replay.stderr.on('data',b=>replayLog+=b);
    saved.code=await new Promise((done,fail)=>{replay.once('close',done);replay.once('error',fail)});
    saved.finished=new Date().toISOString();saved.status=saved.code===0?'PASS':'FAIL';saved.log=id+'-saved-replay.log';
    await writeFile(output+'/'+saved.log,replayLog.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]'),{flag:'wx'});
    const receiptReport=join(folder,'saved-replay-report.json');
    try{const bytes=await readFile(receiptReport);await writeFile(join(copy,'saved-replay-report.json'),bytes,{flag:'wx'});saved.reportSha256=hash(bytes)}catch(e){if(e.code!=='ENOENT')throw e}
    await save();console.log(JSON.stringify(saved));
  }
}
state.finished=new Date().toISOString();state.status=state.stages.every(s=>s.status==='PASS')?'PASS':'PARTIAL';await save();process.exitCode=state.status==='PASS'?0:1;
