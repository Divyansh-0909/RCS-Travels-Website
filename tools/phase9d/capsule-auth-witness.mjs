// Reproduce the old fixture's loopback trust bypass without consequence writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { hash } from './baseline.mjs';
const run='legacy-auth-'+Date.now()+'-'+randomUUID(),name='rcs-phase9d-auth-'+randomUUID();
const image='rcs-test-postgis-pgvector:'+hash(await readFile('backend/tests/fixtures/postgis-pgvector.Dockerfile')).slice(0,16);
const label='rcs.phase9d.owned='+run;
async function docker(args,environment={}){
  const child=spawn('docker',args,{env:{...process.env,...environment},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',()=>{});
  const code=await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail);});
  return {code,output:output.trim()};
}
const record={schema:'phase9d-legacy-loopback-auth-witness-v1',run,sourceSha256:hash(await readFile(new URL(import.meta.url))),started:new Date().toISOString(),applicationWrites:0,liveModelCalls:0};
let created=false;
try{
  const start=await docker(['run','-d','--name',name,'--label',label,'--network','none',
    '-e','POSTGRES_USER=rcs_test_user','-e','POSTGRES_DB=rcs_container_test','-e','POSTGRES_PASSWORD',image],{POSTGRES_PASSWORD:randomUUID()});
  assert.equal(start.code,0);created=true;
  let ready=false;for(let n=0;n<40&&!ready;n++){ready=(await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','rcs_test_user'])).code===0;if(!ready)await new Promise(done=>setTimeout(done,500));}assert.equal(ready,true);
  const probe=await docker(['exec','-e','PGPASSWORD=deliberately-wrong-synthetic-password',name,'psql','-X','-w','-A','-t','-h','127.0.0.1','-U','rcs_test_user','-d','rcs_container_test','-c','SELECT current_user']);
  assert.equal(probe.code,0);assert.equal(probe.output,'rcs_test_user');
  const hba=await docker(['exec',name,'psql','-X','-A','-t','-U','rcs_test_user','-d','rcs_container_test','-c',
    "SELECT jsonb_agg(jsonb_build_object('type',type,'address',address,'method',auth_method)) FROM pg_hba_file_rules WHERE type LIKE 'host%'"]);
  assert.equal(hba.code,0);record.hostAuthentication=JSON.parse(hba.output);
  record.status='BYPASS_REPRODUCED';record.wrongPasswordAuthenticatedOwner=true;
}finally{
  if(created){const inspected=await docker(['inspect',name]);assert.equal(inspected.code,0);assert.equal(JSON.parse(inspected.output)[0].Config.Labels['rcs.phase9d.owned'],run);
    assert.equal((await docker(['rm','-f','-v',name])).code,0);record.cleanup='REMOVED_OWNED';}
  record.finished=new Date().toISOString();await writeFile('output/phase9d-1-continuation-2026-10-13/'+run+'.json',JSON.stringify(record,null,2),{flag:'wx'});
}
console.log(JSON.stringify({run,status:record.status,applicationWrites:record.applicationWrites,cleanup:record.cleanup}));
