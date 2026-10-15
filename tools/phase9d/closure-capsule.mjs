// Local, owned, disposable containment proof. Bootstrap/host remain trusted.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hash,verifyBaseline} from './baseline.mjs';
import {phase9ReplayDependencyHashes} from '../../backend/tests/helpers/phase9ReplaySources.js';
import {minimizeServerDenials,appendDenialObservations} from './closure-observer.mjs';
const root=resolve(import.meta.dirname,'../..'),output=join(root,'output/phase9d-custody-closure-2026-10-15');
const run='capsule-'+Date.now()+'-'+randomUUID(),stage=join(output,run,'build'),owned=[],processes=[];
const record={run,schema:'custody-closure-capsule-v1',started:new Date().toISOString(),productionReady:false,checks:[],profiles:[],baseline:await verifyBaseline()};
await mkdir(stage,{recursive:true});
const entries=['tools/phase9d/closure-capsule-entry.mjs','tools/phase9d/closure-capsule-controller.mjs','tools/phase9d/closure-capsule-proxy.mjs','backend/tests/helpers/phase9dCustodyLineageFixture.js','backend/tests/helpers/phase9Isolation.js'];
const sources=await phase9ReplayDependencyHashes(entries,{read:async url=>{const file=relative(join(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));return readFile(join(root,file));}});
const copy=async file=>{const bytes=await readFile(join(root,file));sources[file]=hash(bytes);await mkdir(dirname(join(stage,file)),{recursive:true});await writeFile(join(stage,file),bytes,{flag:'wx'});};
for(const file of Object.keys(sources))await copy(file);
for(const name of await readdir(join(root,'tools/phase9d')))if(name.endsWith('.sql'))await copy('tools/phase9d/'+name);
for(const file of ['backend/prisma/schema.prisma','backend/tests/prisma.config.js','backend/tests/helpers/phase9-empty.env','backend/data/zones.geojson','backend/data/shady-zones.geojson'])await copy(file);
for(const name of await readdir(join(root,'backend/prisma/migrations')))if(name!=='migration_lock.toml')await copy('backend/prisma/migrations/'+name+'/migration.sql');
const dependencies=Object.fromEntries(await Promise.all(['pg','zod','dotenv','@prisma/client','@prisma/adapter-pg','@typesafe-ai/sdk','openai','prisma','tsx'].map(async name=>[name,JSON.parse(await readFile(join(root,'backend/node_modules',name,'package.json'),'utf8')).version])));
await writeFile(join(stage,'package.json'),JSON.stringify({type:'module',private:true,dependencies}),{flag:'wx'});
await writeFile(join(stage,'backend/package.json'),'{"type":"module"}',{flag:'wx'});
const base='node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c';
const recipe=`FROM ${base}\nWORKDIR /app\nCOPY package.json ./\nRUN npm install --ignore-scripts --no-audit --no-fund\nCOPY backend/prisma/schema.prisma backend/prisma/schema.prisma\nRUN ./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma\nCOPY backend backend\nCOPY tools tools\nRUN ln -s /app/node_modules /app/backend/node_modules\nUSER 1000:1000\nENTRYPOINT ["node"]\n`;
await writeFile(join(stage,'Dockerfile'),recipe,{flag:'wx'});
const image='rcs-custody-closure:'+hash(recipe+JSON.stringify(sources)+JSON.stringify(dependencies)).slice(0,16);
const network='rcs-custody-'+randomUUID(),sourceDb='rcs-custody-source-'+randomUUID(),auditDb='rcs-custody-audit-'+randomUUID(),label='rcs.custody.owned='+run;
const pgImage='rcs-phase9d-profiler:'+hash(await readFile(join(root,'tools/phase9d/sql-profiler.Dockerfile'))).slice(0,16);
const clean=s=>s.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]').slice(-1800);
async function docker(args,input='',timeout=180000,environment={}){
  const child=spawn('docker',args,{windowsHide:true,env:{...process.env,...environment},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.end(input);
  const timer=setTimeout(()=>child.kill(),timeout);const code=await new Promise((ok,fail)=>{child.once('error',fail);child.once('close',ok);});clearTimeout(timer);
  if(code!==0){if(args[0]==='build')await writeFile(join(output,run+'-build-failed.log'),stdout+stderr,{flag:'wx'});throw Error('DOCKER_'+args[0]+':'+clean(stderr));}return stdout.trim();
}
const hardened=['--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','64','--memory','512m','--cpus','0.75','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m'];
async function createPod(kind,entry,extra=[]){
  const name='rcs-custody-'+kind+'-'+randomUUID();
  await docker(['create','-i','--name',name,'--label',label,'--network','container:'+sourceDb,'--workdir','/app/backend',...hardened,...extra,image,'--import','tsx','/app/'+entry]);owned.push({kind:'container',name});
  const info=JSON.parse(await docker(['inspect',name]))[0];assert.equal(info.Config.Labels['rcs.custody.owned'],run);
  assert.equal(info.HostConfig.ReadonlyRootfs,true);assert.equal(info.Config.User,'1000:1000');assert.equal(info.HostConfig.Privileged,false);
  assert.deepEqual(info.HostConfig.CapDrop,['ALL']);assert.ok(info.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.ok(info.Mounts.every(m=>m.Type==='tmpfs'));assert.equal(info.HostConfig.Memory,536870912);assert.equal(info.HostConfig.PidsLimit,64);assert.equal(info.HostConfig.NanoCpus,750000000);
  assert.ok(!['host','container:'+sourceDb].includes(info.HostConfig.PidMode));assert.notEqual(info.HostConfig.IpcMode,'host');
  record.profiles.push({kind,name,readOnly:true,user:info.Config.User,memory:info.HostConfig.Memory,pids:info.HostConfig.PidsLimit,nanoCpus:info.HostConfig.NanoCpus,mounts:info.Mounts.map(m=>({type:m.Type,destination:m.Destination})),capDrop:info.HostConfig.CapDrop,security:info.HostConfig.SecurityOpt});
  return name;
}
function attached(name){
  const child=spawn('docker',['start','-a','-i',name],{windowsHide:true,stdio:['pipe','pipe','pipe']});processes.push(child);
  let lines=[],buffer='',stderr='';const pending=[];
  child.stdout.on('data',b=>{buffer+=b;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);lines.push(line);}flush();});
  child.stderr.on('data',b=>stderr+=b);child.on('error',()=>{});const exit=new Promise(ok=>child.once('close',code=>{flush();ok(code);}));
  function flush(){for(const wait of [...pending]){const index=lines.findIndex(wait.match);if(index>=0){pending.splice(pending.indexOf(wait),1);clearTimeout(wait.timer);wait.ok(lines.splice(index,1)[0]);}}}
  const next=(match,timeout=30000)=>new Promise((ok,fail)=>{const index=lines.findIndex(match);if(index>=0){ok(lines.splice(index,1)[0]);return;}if(child.exitCode!==null){fail(Error('CAPSULE_EXITED:'+name+':'+clean(stderr)));return;}const wait={match,ok,timer:setTimeout(()=>{pending.splice(pending.indexOf(wait),1);fail(Error('CAPSULE_DEADLINE:'+name+':'+clean(stderr)));},timeout)};pending.push(wait);flush();});
  return {name,child,exit,next,async stop(){await docker(['kill',name]);await exit;}};
}
async function service(mode,cfg){const name=await createPod(mode,'tools/phase9d/closure-capsule-entry.mjs');const p=attached(name);p.child.stdin.end(JSON.stringify({mode,...cfg}));const result=JSON.parse(await p.next(l=>l.startsWith('{')));assert.notEqual(result.status,'FAILED',JSON.stringify(result));return {...p,result};}
let controller;let sequence=0;
async function command(action,cfg={}){const id=++sequence;controller.child.stdin.write(JSON.stringify({id,action,...cfg})+'\n');const value=JSON.parse((await controller.next(l=>l.startsWith('CUSTODY_CONTROL ')&&JSON.parse(l.slice(16)).id===id,180000)).slice(16)).value;assert.notEqual(value.status,'FAILED',JSON.stringify(value));return value;}
try{
  console.log(JSON.stringify({run,step:'building-curated-custody-image',sources:Object.keys(sources).length}));
  const build=await docker(['build','-t',image,stage],'',600000);await writeFile(join(output,run+'-build.log'),build,{flag:'wx'});
  record.image=await docker(['image','inspect',image,'--format','{{.Id}}']);record.sources=sources;record.dependencies=dependencies;record.base=base;record.pgImage=pgImage;record.recipeSha256=hash(recipe);
  await docker(['network','create','--internal','--opt','com.docker.network.bridge.inhibit_ipv4=true','--label',label,network]);owned.push({kind:'network',name:network});
  const net=JSON.parse(await docker(['network','inspect',network]))[0];assert.equal(net.Internal,true);assert.equal(net.Options['com.docker.network.bridge.inhibit_ipv4'],'true');
  const sourcePassword=randomUUID(),auditPassword=randomUUID();
  for(const [name,password]of [[sourceDb,sourcePassword],[auditDb,auditPassword]]){
    await docker(['run','-d','--name',name,'--label',label,'--network',network,'--dns','127.0.0.1','-e','POSTGRES_DB=rcs_container_test','-e','POSTGRES_USER=rcs_test_user','-e','POSTGRES_PASSWORD','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',pgImage,
      'postgres','-c','logging_collector=on','-c','log_destination=jsonlog','-c','log_directory=/tmp/custody-logs','-c','log_filename=custody.json','-c','log_rotation_age=0','-c','log_rotation_size=4096','-c','log_min_error_statement=panic','-c','log_statement=none','-c','log_parameter_max_length_on_error=0'],'',180000,{POSTGRES_PASSWORD:password});owned.push({kind:'container',name});
    let ready=false;for(let n=0;n<80&&!ready;n++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','rcs_test_user'],'',3000);ready=true;}catch{await new Promise(ok=>setTimeout(ok,250));}}assert.ok(ready);
    const info=JSON.parse(await docker(['inspect',name]))[0];assert.equal(info.NetworkSettings.Ports['5432/tcp'],null);
  }
  const auditIp=JSON.parse(await docker(['inspect',auditDb]))[0].NetworkSettings.Networks[network].IPAddress;
  const proxyName=await createPod('proxy','tools/phase9d/closure-capsule-proxy.mjs',['-e','CUSTODY_PROXY_HOST='+auditIp]);const proxy=attached(proxyName);proxy.child.stdin.end();await proxy.next(l=>l==='CUSTODY_PROXY_READY');
  const sql=async(db,text,database='rcs_container_test')=>docker(['exec','-i',db,'psql','-X','-q','-A','-t','--set','ON_ERROR_STOP=1','-U','rcs_test_user','-d',database],text);
  await sql(sourceDb,'CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;DROP EXTENSION IF EXISTS postgis CASCADE;CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;');
  const auditName='rcs_verify_'+randomUUID().replaceAll('-','');await sql(auditDb,'CREATE DATABASE "'+auditName+'"');
  const controlName=await createPod('trusted-controller','tools/phase9d/closure-capsule-controller.mjs');controller=attached(controlName);
  const initialized=await command('initialize',{sourceUri:'postgresql://rcs_test_user:'+sourcePassword+'@localhost:5432/rcs_container_test',auditUri:'postgresql://rcs_test_user:'+auditPassword+'@localhost:5433/'+auditName});
  record.initialized=initialized;record.checks.push('actual-offline-broker-usage-guard');
  const observerConfiguration=await command('register-observer');
  const endpoint='http://127.0.0.1:7910/v1/shadow/deliveries',signerEndpoint='http://127.0.0.1:7911/v1/shadow/deliveries',rpcKey=randomUUID()+randomUUID();
  let signer=await service('signer',{...await command('config',{mode:'signer'}),rpcKey,port:7911});assert.equal(signer.result.status,'READY');
  let ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910});assert.equal(ingress.result.status,'READY');
  const senderConfig=await command('config',{mode:'sender',stream:'broker'});
  const verify=async(stream,result)=>{const p=await service('verifier',{...await command('config',{mode:'verifier',stream}),event:result.frame.event,receipt:result.receipt});assert.equal(p.result.status,'VERIFIED');assert.equal(await p.exit,0);return p.result;};
  const first=await service('sender',{...senderConfig,endpoint});assert.equal(first.result.status,'RECEIVED');assert.equal(await first.exit,0);await verify('broker',first.result);record.checks.push('separate-sender-ingress-signer-verifier');
  record.rotation=await command('rotate');await signer.stop();signer=await service('signer',{...await command('config',{mode:'signer',currentOnly:true}),rpcKey,port:7911});
  const historical=await service('sender',{...senderConfig,endpoint,sequence:1});assert.equal(historical.result.status,'RECEIVED');assert.deepEqual(historical.result.receipt,first.result.receipt);await historical.exit;record.checks.push('original-signature-after-retirement-and-signer-process-restart');
  const interrupted=await service('sender',{...senderConfig,endpoint,pause:true});assert.equal(interrupted.result.status,'PAUSED');await interrupted.stop();record.checks.push('actual-sender-death-after-durable-attempt');
  await ingress.stop();ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910,fault:'lost-ack'});
  const lost=await service('sender',{...senderConfig,endpoint});assert.equal(lost.result.status,'PENDING');await lost.exit;
  await ingress.stop();ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910});
  const retry=await service('sender',{...senderConfig,endpoint});assert.equal(retry.result.status,'RECEIVED');await retry.exit;await verify('broker',retry.result);record.checks.push('lost-ack-durable-duplicate-reconciliation');
  for(const stream of ['broker','source-lineage-v2','receiver-lineage-v2']){
    const cfg=await command('config',{mode:'sender',stream});let empty=false;
    for(let i=0;i<100&&!empty;i++){const sent=await service('sender',{...cfg,endpoint});await sent.exit;if(sent.result.status==='EMPTY')empty=true;else{assert.equal(sent.result.status,'RECEIVED');await verify(stream,sent.result);}}assert.ok(empty);
  }
  for(const role of ['custody_ingest','custody_signer','custody_inspector','custody_sender','custody_verifier']){const attack=await service('attack',await command('config',{mode:'attack',role}));assert.equal(await attack.exit,0);record.checks.push({role,denials:attack.result.denials,network:attack.result.network});}
  const probes=await command('denial-probes');let observations=[];
  for(const [server,name]of [['source',sourceDb],['audit',auditDb]]){
    const info=JSON.parse(await docker(['inspect',name]))[0];
    const raw=await docker(['exec',name,'cat','/tmp/custody-logs/custody.json']);
    const correlations=probes.observations.filter(o=>o.server===server),roles=[...new Set(correlations.map(o=>o.role))];
    // JSON logs are host-collected. Keep only the controlled, attributable probes.
    const selected=raw.split('\n').filter(line=>{const row=JSON.parse(line);return roles.includes(row.user)&&(['42501','28P01'].includes(row.state_code));}).join('\n');
    observations.push(...minimizeServerDenials(selected,{serverIdentity:hash(info.Id),roles,correlations}));
  }
  for(const expected of probes.observations)assert.ok(observations.some(o=>o.denialClass===expected.denialClass),expected.denialClass);
  const spool=appendDenialObservations({frames:[]},observations,{source:observerConfiguration.source,key:observerConfiguration.key});
  const spoolPath=join(output,run+'-observer-inputs.json');await writeFile(spoolPath,JSON.stringify(spool),{flag:'wx'});
  const resumed=JSON.parse(await readFile(spoolPath,'utf8'));assert.deepEqual(appendDenialObservations(resumed,observations,{source:observerConfiguration.source,key:observerConfiguration.key}),spool);
  const observerConfig={endpoint,ingressKey:observerConfiguration.ingressKey,source:{id:observerConfiguration.source,service:'denial-observer-v2'}};
  const paused=await service('observer',{...observerConfig,frame:resumed.frames[0],pause:true});assert.equal(paused.result.status,'PAUSED');await paused.stop();
  if(resumed.frames.length>1){const gap=await service('observer',{...observerConfig,frame:resumed.frames[1]});assert.equal(gap.result.status,'PENDING');await gap.exit;}
  for(const frame of resumed.frames){const delivered=await service('observer',{...observerConfig,frame});assert.equal(delivered.result.status,'RECEIVED');assert.equal(await delivered.exit,0);}
  const duplicate=await service('observer',{...observerConfig,frame:resumed.frames[0]});assert.equal(duplicate.result.status,'RECEIVED');await duplicate.exit;
  record.denialObservations={records:observations,spoolSha256:hash(await readFile(spoolPath)),observerRestart:true,duplicatesReused:true,gapRejected:true};record.checks.push('independent-server-denial-delivery-and-restart');
  assert.equal((await command('stop')).status,'APPLIED');record.state=await command('state');assert.equal(record.state.status,'UNCHANGED');
  record.status='PASS';
}catch(error){record.status='FAIL';record.error=clean(error.message);process.exitCode=1;}
finally{
  if(controller&&controller.child.exitCode===null){try{await command('close');controller.child.stdin.end();await controller.exit;}catch{}}
  for(const child of processes)if(child.exitCode===null)child.stdin.destroy();
  record.cleanup=[];for(const resource of owned.reverse()){
    try{const info=JSON.parse(await docker([resource.kind,'inspect',resource.name]))[0];assert.equal((resource.kind==='network'?info.Labels:info.Config.Labels)['rcs.custody.owned'],run);await docker(resource.kind==='network'?['network','rm',resource.name]:['rm','-f',resource.name]);record.cleanup.push({name:resource.name,status:'REMOVED_OWNED'});}catch{record.cleanup.push({name:resource.name,status:'FAILED'});process.exitCode=1;}
  }
  record.sourcesUnchanged=true;for(const [file,identity]of Object.entries(sources))if(hash(await readFile(join(root,file)))!==identity)record.sourcesUnchanged=false;
  record.finished=new Date().toISOString();await writeFile(join(output,run+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
}
console.log(JSON.stringify({run,status:record.status,error:record.error,checks:record.checks.length,profiles:record.profiles.length,sourcesUnchanged:record.sourcesUnchanged}));
