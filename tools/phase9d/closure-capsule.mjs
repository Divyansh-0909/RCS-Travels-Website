// Local, owned, disposable containment proof. Bootstrap/host remain trusted.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hash} from './baseline.mjs';
import {closureBaseline} from './closure-baseline.mjs';
import {phase9ReplayDependencyHashes} from '../../backend/tests/helpers/phase9ReplaySources.js';
import {minimizeServerDenials,appendDenialObservations} from './closure-observer.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(root,process.env.CUSTODY_OUTPUT??'output/phase9d-custody-closure-cloud-2026-10-15');
const run='capsule-'+Date.now()+'-'+randomUUID(),stage=join(output,run,'build'),owned=[],processes=[],completed=[];
const record={run,schema:'custody-closure-capsule-v1',started:new Date().toISOString(),productionReady:false,checks:[],profiles:[],baseline:await closureBaseline()};
await mkdir(stage,{recursive:true});
// Fork/URL entrypoints are not static imports. Include their actual import
// graphs explicitly, otherwise the host recipe works while the image is incomplete.
const entries=['tools/phase9d/closure-capsule-entry.mjs','tools/phase9d/closure-capsule-controller.mjs','tools/phase9d/closure-capsule-proxy.mjs','tools/phase9d/closure-network-canary.mjs','tools/phase9d/transport-child.mjs','tools/phase9d/broker-child.mjs','backend/tests/helpers/phase9dCustodyLineageFixture.js','backend/tests/helpers/phase9Isolation.js'];
const sources=await phase9ReplayDependencyHashes(entries,{read:async url=>{const file=relative(join(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));return readFile(join(root,file));}});
for(const file of ['tools/phase9d/closure-capsule.mjs','tools/phase9d/closure-baseline.mjs','tools/phase9d/baseline.mjs','tools/phase9d/closure-postgres.Dockerfile','backend/tests/helpers/phase9ReplaySources.js','backend/package-lock.json'])sources[file]=hash(await readFile(join(root,file)));
const copy=async file=>{const bytes=await readFile(join(root,file));sources[file]=hash(bytes);await mkdir(dirname(join(stage,file)),{recursive:true});await writeFile(join(stage,file),bytes,{flag:'wx'});};
for(const file of Object.keys(sources))await copy(file);
for(const name of await readdir(join(root,'tools/phase9d')))if(name.endsWith('.sql'))await copy('tools/phase9d/'+name);
for(const file of ['backend/prisma/schema.prisma','backend/tests/prisma.config.js','backend/tests/helpers/phase9-empty.env','backend/data/zones.geojson','backend/data/shady-zones.geojson'])await copy(file);
for(const name of await readdir(join(root,'backend/prisma/migrations')))if(name!=='migration_lock.toml')await copy('backend/prisma/migrations/'+name+'/migration.sql');
const dependencies=Object.fromEntries(await Promise.all(['pg','zod','dotenv','@prisma/client','@prisma/adapter-pg','@typesafe-ai/sdk','openai','prisma','tsx'].map(async name=>[name,JSON.parse(await readFile(join(root,'backend/node_modules',name,'package.json'),'utf8')).version])));
await writeFile(join(stage,'package.json'),JSON.stringify({type:'module',private:true,dependencies}),{flag:'wx'});
await writeFile(join(stage,'runtime-package.json'),JSON.stringify({type:'module',private:true,dependencies:Object.fromEntries(['pg','zod','openai'].map(name=>[name,dependencies[name]]))}),{flag:'wx'});
await writeFile(join(stage,'backend/package.json'),'{"type":"module"}',{flag:'wx'});
const base='node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c';
const ca=process.env.CODEX_PROXY_CERT;
const secret=ca?'--mount=type=secret,id=proxy_ca,required=true,mode=0444 ':'';
const copyRuntime='COPY --chown=1000:1000 backend backend\nCOPY --chown=1000:1000 tools tools\nRUN chmod -R a+rX backend tools && ln -s /app/node_modules /app/backend/node_modules\nUSER 1000:1000\nENTRYPOINT ["node"]\n';
const install=`RUN ${secret}${ca?'NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca ':''}npm install --ignore-scripts --no-audit --no-fund\n`;
const recipe=`# syntax=docker/dockerfile:1\nFROM ${base} AS controller\nWORKDIR /app\nRUN ${secret}apt-get ${ca?'-o Acquire::https::CaInfo=/run/secrets/proxy_ca ':''}update --error-on=any && apt-get ${ca?'-o Acquire::https::CaInfo=/run/secrets/proxy_ca ':''}install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*\nCOPY package.json ./\n${install}COPY backend/prisma/schema.prisma backend/prisma/schema.prisma\nRUN ${secret}${ca?'NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca ':''}./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma\n${copyRuntime}FROM ${base} AS runtime\nWORKDIR /app\nCOPY runtime-package.json package.json\n${install}${copyRuntime}`;
await writeFile(join(stage,'Dockerfile'),recipe,{flag:'wx'});
const image='rcs-custody-closure:'+hash(recipe+JSON.stringify(sources)+JSON.stringify(dependencies)).slice(0,16);
const runtimeImage=image+'-runtime';
const network='rcs-custody-'+randomUUID(),sourceDb='rcs-custody-source-'+randomUUID(),auditDb='rcs-custody-audit-'+randomUUID(),label='rcs.custody.owned='+run;
const auditNetwork=network+'-audit',deliveryNetwork=network+'-delivery',signerNetwork=network+'-signer';
const forbiddenNetwork=network+'-forbidden';
const pgImage=process.env.CUSTODY_POSTGRES_IMAGE??'rcs-phase9d-profiler:'+hash(await readFile(join(root,'tools/phase9d/sql-profiler.Dockerfile'))).slice(0,16);
const clean=s=>s.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]').slice(-1800);
async function docker(args,input='',timeout=180000,environment={}){
  const child=spawn('docker',args,{windowsHide:true,env:{...process.env,...environment},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.end(input);
  const timer=setTimeout(()=>child.kill(),timeout);const code=await new Promise((ok,fail)=>{child.once('error',fail);child.once('close',ok);});clearTimeout(timer);
  if(code!==0){if(args[0]==='build')await writeFile(join(output,run+'-build-failed.log'),stdout+stderr,{flag:'wx'});throw Error('DOCKER_'+args[0]+':'+clean(stderr));}return stdout.trim();
}
const hardened=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','64','--memory','512m','--cpus','0.75','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m'];
async function createPod(kind,entry,extra=[],networks=[],alias){
  const name='rcs-custody-'+kind+'-'+randomUUID();
  const uid={sender:1101,verifier:1102,ingress:1103,signer:1104,observer:1105,attack:1106}[kind]??1000;
  const trusted=kind==='trusted-controller';
  await docker(['create','-i','--name',name,'--label',label,'--log-driver','none','--network',networks[0]??'container:'+sourceDb,...(alias?['--network-alias',alias]:[]),'--workdir','/app/backend','--user',uid+':'+uid,...hardened,...extra,trusted?image:runtimeImage,...(trusted?['--import','tsx']:[]),'/app/'+entry]);owned.push({kind:'container',name});
  for(const net of networks.slice(1))await docker(['network','connect',...(alias?['--alias',alias]:[]),net,name]);
  const info=JSON.parse(await docker(['inspect',name]))[0];assert.equal(info.Config.Labels['rcs.custody.owned'],run);
  record.dependencyLocks??={};const dependencyKind=trusted?'controller':'runtime';
  if(!record.dependencyLocks[dependencyKind]){const file=run+'-'+dependencyKind+'-package-lock.json';await docker(['cp',name+':/app/package-lock.json',join(output,file)]);record.dependencyLocks[dependencyKind]={file,sha256:hash(await readFile(join(output,file)))};}
  assert.equal(info.HostConfig.ReadonlyRootfs,true);assert.equal(info.Config.User,uid+':'+uid);assert.equal(info.HostConfig.Privileged,false);
  assert.deepEqual(info.HostConfig.CapDrop,['ALL']);assert.ok(info.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.ok(info.Mounts.every(m=>m.Type==='tmpfs'));assert.equal(info.HostConfig.Memory,536870912);assert.equal(info.HostConfig.PidsLimit,64);assert.equal(info.HostConfig.NanoCpus,750000000);
  assert.equal(info.HostConfig.LogConfig.Type,'none');
  assert.ok(!['host','container:'+sourceDb].includes(info.HostConfig.PidMode));assert.notEqual(info.HostConfig.IpcMode,'host');
  record.profiles.push({kind,name,networks,readOnly:true,user:info.Config.User,memory:info.HostConfig.Memory,pids:info.HostConfig.PidsLimit,nanoCpus:info.HostConfig.NanoCpus,mounts:info.Mounts.map(m=>({type:m.Type,destination:m.Destination})),capDrop:info.HostConfig.CapDrop,security:info.HostConfig.SecurityOpt});
  return name;
}
function attached(name){
  const child=spawn('docker',['start','-a','-i',name],{windowsHide:true,stdio:['pipe','pipe','pipe']});processes.push(child);
  let lines=[],buffer='',stderr='';const pending=[];
  child.stdout.on('data',b=>{buffer+=b;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);lines.push(line);}flush();});
  child.stderr.on('data',b=>stderr+=b);child.on('error',()=>{});const exit=new Promise(ok=>child.once('close',code=>{flush();for(const wait of pending.splice(0)){clearTimeout(wait.timer);wait.fail(Error('CAPSULE_EXITED:'+name+':'+clean(stderr)));}ok(code);}));
  function flush(){for(const wait of [...pending]){const index=lines.findIndex(wait.match);if(index>=0){pending.splice(pending.indexOf(wait),1);clearTimeout(wait.timer);wait.ok(lines.splice(index,1)[0]);}}}
  const next=(match,timeout=30000)=>new Promise((ok,fail)=>{const index=lines.findIndex(match);if(index>=0){ok(lines.splice(index,1)[0]);return;}if(child.exitCode!==null){fail(Error('CAPSULE_EXITED:'+name+':'+clean(stderr)));return;}const wait={match,ok,fail,timer:setTimeout(()=>{pending.splice(pending.indexOf(wait),1);fail(Error('CAPSULE_DEADLINE:'+name+':'+clean(stderr)));},timeout)};pending.push(wait);flush();});
  return {name,child,exit,next,async stop(){const info=JSON.parse(await docker(['inspect',name]))[0];if(info.State.Running)await docker(['kill',name]);await exit;}};
}
async function service(mode,cfg){
  const auditRoles=['custody_ingest','custody_signer','custody_inspector'];
  const configuration=structuredClone(cfg);
  for(const field of ['uri','auditUri','forbiddenUri'])if(configuration[field]){const uri=new URL(configuration[field]);uri.hostname=auditRoles.includes(uri.username)?'audit-db':'source-db';uri.port='5432';configuration[field]=uri.toString();}
  const paths={sender:[network,deliveryNetwork],verifier:[network,auditNetwork],ingress:[auditNetwork,deliveryNetwork,signerNetwork],signer:[auditNetwork,signerNetwork],observer:[deliveryNetwork],attack:[auditRoles.includes(cfg.role)?auditNetwork:network]};
  const name=await createPod(mode,'tools/phase9d/closure-capsule-entry.mjs',[],paths[mode],mode==='ingress'?'custody-ingress':mode==='signer'?'custody-signer':undefined);
  const p=attached(name);p.child.stdin.end(JSON.stringify({mode,...configuration}));const result=JSON.parse(await p.next(l=>l.startsWith('{')));assert.notEqual(result.status,'FAILED',JSON.stringify(result));
  console.log(JSON.stringify({run,component:mode,status:result.status}));
  if(['sender','verifier','observer','attack'].includes(mode)){
    const exit=p.exit.then(async code=>{await docker(['rm',name]);owned.find(r=>r.name===name).removed=true;return code;});completed.push(exit);
    return {...p,result,exit,async stop(){await p.stop();await exit;}};
  }
  return {...p,result,async stop(){await p.stop();await docker(['rm','-v',name]);owned.find(r=>r.name===name).removed=true;}};
}
let controller;let sequence=0;
async function command(action,cfg={}){const id=++sequence;controller.child.stdin.write(JSON.stringify({id,action,...cfg})+'\n');const value=JSON.parse((await controller.next(l=>l.startsWith('CUSTODY_CONTROL ')&&JSON.parse(l.slice(16)).id===id,180000)).slice(16)).value;assert.notEqual(value.status,'FAILED',JSON.stringify(value));return value;}
try{
  console.log(JSON.stringify({run,step:'building-curated-custody-image',sources:Object.keys(sources).length}));
  for(const [target,tag]of [['runtime',runtimeImage],['controller',image]]){const build=await docker(['build',...(ca?['--secret','id=proxy_ca,src='+ca]:[]),'--target',target,'-t',tag,stage],'',600000);await writeFile(join(output,run+'-'+target+'-build.log'),build,{flag:'wx'});}
  record.image=await docker(['image','inspect',image,'--format','{{.Id}}']);record.runtimeImage=await docker(['image','inspect',runtimeImage,'--format','{{.Id}}']);record.sources=sources;record.dependencies=dependencies;record.base=base;record.pgImage=pgImage;record.pgImageIdentity=await docker(['image','inspect',pgImage,'--format','{{.Id}}']);record.recipeSha256=hash(recipe);
  for(const name of [network,auditNetwork,deliveryNetwork,signerNetwork,forbiddenNetwork]){await docker(['network','create','--internal','--opt','com.docker.network.bridge.inhibit_ipv4=true','--label',label,name]);owned.push({kind:'network',name});}
  const net=JSON.parse(await docker(['network','inspect',network]))[0];assert.equal(net.Internal,true);assert.equal(net.Options['com.docker.network.bridge.inhibit_ipv4'],'true');
  const canaryName=await createPod('network-canary','tools/phase9d/closure-network-canary.mjs',[],[forbiddenNetwork]);const canary=attached(canaryName);canary.child.stdin.end();await canary.next(line=>line==='CUSTODY_CANARY_READY');
  const forbiddenPeer=JSON.parse(await docker(['inspect',canaryName]))[0].NetworkSettings.Networks[forbiddenNetwork].IPAddress;
  const control="const s=require('net').createConnection({host:process.argv[1],port:5432});let v='';s.on('data',b=>v+=b);s.on('end',()=>{if(v!=='synthetic-custody-network-canary')process.exit(2);console.log('CANARY_REACHABLE')});s.on('error',()=>process.exit(3));setTimeout(()=>{s.destroy();process.exit(4)},2000).unref();";
  assert.equal(await docker(['run','--rm','--label',label,'--network',forbiddenNetwork,...hardened,'--user','1106:1106',runtimeImage,'-e',control,forbiddenPeer]),'CANARY_REACHABLE');
  record.networkCounterfactual={forbiddenPeer,positiveControl:'CANARY_REACHABLE'};
  const sourcePassword=randomUUID(),auditPassword=randomUUID();
  for(const [name,password]of [[sourceDb,sourcePassword],[auditDb,auditPassword]]){
    await docker(['run','-d','--name',name,'--label',label,'--network',name===sourceDb?network:auditNetwork,'--network-alias',name===sourceDb?'source-db':'audit-db','--dns','127.0.0.1','-e','POSTGRES_DB=rcs_container_test','-e','POSTGRES_USER=rcs_test_user','-e','POSTGRES_PASSWORD','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',pgImage,
      'postgres','-c','logging_collector=on','-c','log_destination=jsonlog','-c','log_directory=/tmp/custody-logs','-c','log_filename=custody','-c','log_rotation_age=0','-c','log_rotation_size=4096','-c','log_min_error_statement=panic','-c','log_statement=none','-c','log_parameter_max_length_on_error=0'],'',180000,{POSTGRES_PASSWORD:password});owned.push({kind:'container',name});
    let ready=false;for(let n=0;n<80&&!ready;n++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','rcs_test_user'],'',3000);ready=true;}catch{await new Promise(ok=>setTimeout(ok,250));}}assert.ok(ready);
    const info=JSON.parse(await docker(['inspect',name]))[0];assert.equal(Object.keys(info.HostConfig.PortBindings??{}).length,0);
  }
  await docker(['network','connect',auditNetwork,sourceDb]);
  const auditIp=JSON.parse(await docker(['inspect',auditDb]))[0].NetworkSettings.Networks[auditNetwork].IPAddress;
  const proxyName=await createPod('proxy','tools/phase9d/closure-capsule-proxy.mjs',['-e','CUSTODY_PROXY_HOST='+auditIp]);const proxy=attached(proxyName);proxy.child.stdin.end();await proxy.next(l=>l==='CUSTODY_PROXY_READY');
  const sql=async(db,text,database='rcs_container_test')=>docker(['exec','-i',db,'psql','-X','-q','-A','-t','--set','ON_ERROR_STOP=1','-U','rcs_test_user','-d',database],text);
  await sql(sourceDb,'CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;DROP EXTENSION IF EXISTS postgis CASCADE;CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;');
  const auditName='rcs_verify_'+randomUUID().replaceAll('-','');await sql(auditDb,'CREATE DATABASE "'+auditName+'"');
  const controlName=await createPod('trusted-controller','tools/phase9d/closure-capsule-controller.mjs');controller=attached(controlName);
  const initialized=await command('initialize',{sourceUri:'postgresql://rcs_test_user:'+sourcePassword+'@localhost:5432/rcs_container_test',auditUri:'postgresql://rcs_test_user:'+auditPassword+'@localhost:5433/'+auditName});
  record.initialized=initialized;record.checks.push('actual-offline-broker-usage-guard');
  const observerConfiguration=await command('register-observer');
  const endpoint='http://custody-ingress:7910/v1/shadow/deliveries',signerEndpoint='http://custody-signer:7911/v1/shadow/deliveries',rpcKey=randomUUID()+randomUUID();
  let signer=await service('signer',{...await command('config',{mode:'signer'}),rpcKey,port:7911});assert.equal(signer.result.status,'READY');
  let ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910});assert.equal(ingress.result.status,'READY');
  const senderConfig=await command('config',{mode:'sender',stream:'broker'});
  const verify=async(stream,result)=>{const p=await service('verifier',{...await command('config',{mode:'verifier',stream}),event:result.frame.event,receipt:result.receipt});assert.equal(p.result.status,'VERIFIED');assert.equal(await p.exit,0);return p.result;};
  const first=await service('sender',{...senderConfig,endpoint});assert.equal(first.result.status,'RECEIVED');assert.equal(await first.exit,0);await verify('broker',first.result);record.checks.push('separate-sender-ingress-signer-verifier');
  await ingress.stop();ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910,fault:'before-commit'});
  const beforeCommit=await service('sender',{...senderConfig,endpoint});assert.equal(beforeCommit.result.status,'PENDING');await beforeCommit.exit;assert.equal(await ingress.exit,137);
  ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910});
  const beforeRetry=await service('sender',{...senderConfig,endpoint});assert.equal(beforeRetry.result.status,'RECEIVED');await beforeRetry.exit;await verify('broker',beforeRetry.result);record.checks.push('actual-ingress-death-before-commit');
  record.rotation=await command('rotate');await signer.stop();signer=await service('signer',{...await command('config',{mode:'signer',currentOnly:true}),rpcKey,port:7911});
  const historical=await service('sender',{...senderConfig,endpoint,sequence:1});assert.equal(historical.result.status,'RECEIVED');assert.deepEqual(historical.result.receipt,first.result.receipt);await historical.exit;record.checks.push('original-signature-after-retirement-and-signer-process-restart');
  const interrupted=await service('sender',{...senderConfig,endpoint,pause:true});assert.equal(interrupted.result.status,'PAUSED');await interrupted.stop();record.checks.push('actual-sender-death-after-durable-attempt');
  await ingress.stop();ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910,fault:'lost-ack'});
  const lost=await service('sender',{...senderConfig,endpoint});assert.equal(lost.result.status,'PENDING');await lost.exit;
  await ingress.stop();ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910});
  const retry=await service('sender',{...senderConfig,endpoint});assert.equal(retry.result.status,'RECEIVED');await retry.exit;await verify('broker',retry.result);record.checks.push('lost-ack-durable-duplicate-reconciliation');
  await ingress.stop();ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910,fault:'after-commit'});
  const afterCommit=await service('sender',{...senderConfig,endpoint});assert.equal(afterCommit.result.status,'PENDING');await afterCommit.exit;assert.equal(await ingress.exit,137);
  ingress=await service('ingress',{...await command('config',{mode:'ingress'}),rpcKey,signerEndpoint,port:7910});
  const afterRetry=await service('sender',{...senderConfig,endpoint});assert.equal(afterRetry.result.status,'RECEIVED');await afterRetry.exit;await verify('broker',afterRetry.result);record.checks.push('actual-ingress-death-after-commit-before-signature');
  for(const stream of ['broker','source-lineage-v2','receiver-lineage-v2']){
    const cfg=await command('config',{mode:'sender',stream});let empty=false;
    for(let i=0;i<100&&!empty;i++){const sent=await service('sender',{...cfg,endpoint});await sent.exit;if(sent.result.status==='EMPTY')empty=true;else{assert.equal(sent.result.status,'RECEIVED');await verify(stream,sent.result);}}assert.ok(empty);
  }
  for(const role of ['custody_ingest','custody_signer','custody_inspector','custody_sender','custody_verifier','custody_source_sender','custody_receiver_sender']){const before=await command('integrity');const attack=await service('attack',{...await command('config',{mode:'attack',role}),forbiddenPeer});assert.equal(await attack.exit,0);assert.deepEqual(await command('integrity'),before);record.checks.push({role,denials:attack.result.denials,network:attack.result.network});}
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
  // Snapshot actual durable tables, kill both owned PostgreSQL servers, then
  // reconnect through fresh service processes. No old pool supplies a success.
  const replacementConfigs={signer:await command('config',{mode:'signer',currentOnly:true}),ingress:await command('config',{mode:'ingress'}),verifier:await command('config',{mode:'verifier',stream:'broker'})};
  const snapshots=async()=>{
    const rows=[];
    for(const [db,database,tables]of [[sourceDb,record.initialized.source,['public.bookings','public.payments','custody_lineage.events','outbox9d.deliveries']],[sourceDb,record.initialized.receiver,['broker9d.requests','broker9d.attempts','broker9d.results','broker9d.events','custody_export.events','custody_lineage.events']],[auditDb,auditName,['custody.events','custody.signatures','custody.keys']]]){
      for(const table of tables)rows.push({database,table,sha256:await sql(db,"SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+table+' t',database)});
    }return rows;
  };
  const beforeRestart=await snapshots();
  for(const process of [ingress,signer,controller,proxy])await process.stop();
  for(const name of [sourceDb,auditDb]){
    await docker(['kill','--signal','KILL',name]);await docker(['start',name]);let ready=false;
    for(let n=0;n<80&&!ready;n++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','rcs_test_user'],'',3000);ready=true;}catch{await new Promise(ok=>setTimeout(ok,250));}}assert.ok(ready);
  }
  const afterRestart=await snapshots();assert.deepEqual(afterRestart,beforeRestart);
  signer=await service('signer',{...replacementConfigs.signer,rpcKey,port:7911});
  ingress=await service('ingress',{...replacementConfigs.ingress,rpcKey,signerEndpoint,port:7910});
  const delayed=await service('sender',{...senderConfig,endpoint});assert.equal(delayed.result.status,'RECEIVED');await delayed.exit;
  const delayedVerifier=await service('verifier',{...replacementConfigs.verifier,event:delayed.result.frame.event,receipt:delayed.result.receipt});assert.equal(delayedVerifier.result.status,'VERIFIED');await delayedVerifier.exit;
  const historicalRestart=await service('sender',{...senderConfig,endpoint,sequence:1});assert.deepEqual(historicalRestart.result.receipt,first.result.receipt);await historicalRestart.exit;
  record.databaseRestart={signal:'SIGKILL',servers:[sourceDb,auditDb],before:beforeRestart,after:afterRestart,oldControllerKilled:true,freshServices:true,delayedStopReceiptVerified:true,historicalReceiptPreserved:true};
  record.checks.push('actual-source-and-custody-postgres-death-restart-retained-commitments');
  record.status='PASS';
}catch(error){record.status='FAIL';record.error=clean(error.message);process.exitCode=1;}
finally{
  if(controller&&controller.child.exitCode===null){try{await command('close');controller.child.stdin.end();await controller.exit;}catch{ /* Owned resources are removed below even if the control channel failed. */ }}
  for(const child of processes)if(child.exitCode===null)child.stdin.destroy();
  await Promise.allSettled(completed);
  record.cleanup=[];for(const resource of owned.reverse()){
    if(resource.removed){record.cleanup.push({name:resource.name,status:'REMOVED_AFTER_EXIT'});continue;}
    try{const info=JSON.parse(await docker([resource.kind,'inspect',resource.name]))[0];assert.equal((resource.kind==='network'?info.Labels:info.Config.Labels)['rcs.custody.owned'],run);await docker(resource.kind==='network'?['network','rm',resource.name]:['rm','-f','-v',resource.name]);record.cleanup.push({name:resource.name,status:'REMOVED_OWNED'});}catch{record.cleanup.push({name:resource.name,status:'FAILED'});process.exitCode=1;}
  }
  record.sourcesUnchanged=true;for(const [file,identity]of Object.entries(sources))if(hash(await readFile(join(root,file)))!==identity)record.sourcesUnchanged=false;
  record.finished=new Date().toISOString();await writeFile(join(output,run+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
}
console.log(JSON.stringify({run,status:record.status,error:record.error,checks:record.checks.length,profiles:record.profiles.length,sourcesUnchanged:record.sourcesUnchanged}));
