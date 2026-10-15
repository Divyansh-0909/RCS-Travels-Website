// Rehearsal image/namespace proof only; no production credentials or deployment.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir,readFile,writeFile,readdir,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,relative,join,dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { verifyBaseline,hash } from './baseline.mjs';
import { phase9ReplayDependencyHashes } from '../../backend/tests/helpers/phase9ReplaySources.js';
import { createResponsibilityEvidence } from '../../backend/services/responsibilityEvidence.js';
import { minimizeEvidence } from './privacy.mjs';
import {outboxCapsuleFixture} from './outbox-capsule-fixture.mjs';
const exportMode=process.argv[2]==='outbox';
const root=resolve(import.meta.dirname,'../..'), output=resolve(root,exportMode?'output/phase9d-outbox-broker-2026-10-13':'output/phase9d-1-continuation-2026-10-13');
const run='capsule-'+Date.now()+'-'+randomUUID(), stage=join(output,run,'build'), started=new Date().toISOString();
const sources=await phase9ReplayDependencyHashes(['tools/phase9d/worker-core.mjs','tools/phase9d/capsule-entry.mjs','tools/phase9d/export-core.mjs'],{read:async url=>{
  const file=relative(resolve(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));
  return readFile(resolve(root,file));
}});
const baseline=await verifyBaseline();await mkdir(stage,{recursive:true});
for(const [file,identity]of Object.entries(sources)){
  const bytes=await readFile(resolve(root,file));assert.equal(hash(bytes),identity);
  await mkdir(dirname(join(stage,file)),{recursive:true});await writeFile(join(stage,file),bytes,{flag:'wx'});
}
await mkdir(join(stage,'backend/prisma'),{recursive:true});
const schema=await readFile(join(root,'backend/prisma/schema.prisma'));
await writeFile(join(stage,'backend/prisma/schema.prisma'),schema,{flag:'wx'});
const migrations={};
for(const name of await readdir(join(root,'backend/prisma/migrations'))){
  if(name==='migration_lock.toml')continue;assert.match(name,/^[a-zA-Z0-9_]+$/);
  const file='backend/prisma/migrations/'+name+'/migration.sql',bytes=await readFile(join(root,file));
  migrations[file]=hash(bytes);await mkdir(dirname(join(stage,file)),{recursive:true});await writeFile(join(stage,file),bytes,{flag:'wx'});
}
const migrationConfig='import {defineConfig} from "prisma/config"; export default defineConfig({schema:"backend/prisma/schema.prisma",migrations:{path:"backend/prisma/migrations"},datasource:{url:process.env.TEST_MIGRATION_DATABASE_URL}});';
await writeFile(join(stage,'capsule-prisma.config.mjs'),migrationConfig,{flag:'wx'});
const dependencies=Object.fromEntries(await Promise.all(['pg','zod','dotenv','@prisma/client','@prisma/adapter-pg','@typesafe-ai/sdk','openai','prisma']
  .map(async name=>[name,JSON.parse(await readFile(join(root,'backend/node_modules',name,'package.json'),'utf8')).version])));
await writeFile(join(stage,'package.json'),JSON.stringify({type:'module',private:true,dependencies}),{flag:'wx'});
await writeFile(join(stage,'backend/package.json'),'{"type":"module"}',{flag:'wx'});
const base='node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c';
const recipe=`FROM ${base}\nWORKDIR /app\nCOPY package.json ./\nRUN npm install --ignore-scripts --no-audit --no-fund\nCOPY backend/prisma/schema.prisma backend/prisma/schema.prisma\nRUN ./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma\nCOPY backend backend\nCOPY tools tools\nCOPY capsule-prisma.config.mjs ./\nENV NODE_ENV=production DATABASE_URL=postgresql://denied:denied@localhost:1/phase9_forbidden DOTENV_CONFIG_PATH=/nonexistent\nUSER 1000:1000\nENTRYPOINT ["node","tools/phase9d/capsule-entry.mjs"]\n`;
await writeFile(join(stage,'Dockerfile'),recipe,{flag:'wx'});
const suffix=randomUUID(),network='rcs-phase9d-private-'+suffix, dbName='rcs-phase9d-db-'+suffix, workerName='rcs-phase9d-worker-'+suffix;
const image='rcs-phase9d-capsule:'+hash(recipe+JSON.stringify(sources)+JSON.stringify(dependencies)+JSON.stringify(migrations)).slice(0,16);
const pgRecipe=await readFile(join(root,'backend/tests/fixtures/postgis-pgvector.Dockerfile'));
const pgImage='rcs-test-postgis-pgvector:'+hash(pgRecipe).slice(0,16),label='rcs.phase9d.owned='+run;
async function docker(args,input='',timeout=180000,environment={}){
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...environment}});let stdout='',stderr='';
  child.stdout.on('data',v=>{stdout+=v;});child.stderr.on('data',v=>{stderr+=v;});child.stdin.end(input);
  const timer=setTimeout(()=>child.kill(),timeout);
  const code=await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail);});clearTimeout(timer);
  if(code!==0){await writeFile(join(output,run+'-docker-failed.log'),stderr.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[url-redacted]'));throw new Error('OWNED_DOCKER_COMMAND_FAILED:'+args[0]);}
  return stdout.trim();
}
const resources={network:false,db:false,worker:false};let server,canaryPath;
const database='rcs_verify_'+randomUUID().replaceAll('-','');assert.match(database,/^rcs_verify_[a-f0-9]{32}$/);
async function sql(text,db=database){return docker(['exec','-i',dbName,'psql','-X','-q','-A','-t','--set','ON_ERROR_STOP=1','-U','rcs_test_user','-d',db],text);}
const record={schema:'phase9d-capsule-execution-v1',run,started,sources,migrations,schemaSha256:hash(schema),baseline,dependencies,base,pgImage,recipeSha256:hash(recipe),
  launcherSha256:hash(await readFile(new URL(import.meta.url))),permissionsSha256:hash(await readFile(join(root,'tools/phase9d/permissions.sql'))),productionReady:false};
try{
  console.log(JSON.stringify({run,step:'building-owned-image',sourceFiles:Object.keys(sources).length}));
  const build=await docker(['build','-t',image,stage],'',300000);await writeFile(join(output,run+'-build.log'),build);
  record.imageId=await docker(['image','inspect',image,'--format','{{.Id}}']);
  await docker(['network','create','--internal','--opt','com.docker.network.bridge.inhibit_ipv4=true','--label',label,network]);resources.network=true;
  const networkInfo=JSON.parse(await docker(['network','inspect',network]))[0];assert.equal(networkInfo.Internal,true);assert.equal(networkInfo.EnableIPv6,false);
  const adminPassword=randomUUID();
  await docker(['run','-d','--name',dbName,'--label',label,'--network',network,
    '-e','POSTGRES_DB=rcs_container_test','-e','POSTGRES_USER=rcs_test_user','-e','POSTGRES_PASSWORD',
    '-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',pgImage],'',180000,{POSTGRES_PASSWORD:adminPassword});resources.db=true;
  const dbInfo=JSON.parse(await docker(['inspect',dbName]))[0];assert.equal(dbInfo.Config.Labels['rcs.phase9d.owned'],run);
  assert.equal(dbInfo.NetworkSettings.Ports['5432/tcp'],null);assert.deepEqual(Object.keys(dbInfo.NetworkSettings.Networks),[network]);
  let ready=false;
  for(let n=0;n<40&&!ready;n++){
    try{await docker(['exec',dbName,'pg_isready','-U','rcs_test_user'],'',3000);ready=true;}catch(error){if(n===39)throw error;await new Promise(done=>setTimeout(done,500));}
  }
  assert.equal(ready,true);
  await sql(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE DATABASE "${database}" TEMPLATE template0;`,'rcs_container_test');
  // All actual migrations execute in a separate privileged fixture container.
  await sql('CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;');
  const migrationURL='postgresql://rcs_test_user:'+adminPassword+'@localhost:5432/'+database;
  await docker(['run','--rm','--network','container:'+dbName,'--entrypoint','node','-e','TEST_MIGRATION_DATABASE_URL',image,
    'node_modules/prisma/build/index.js','migrate','deploy','--config','capsule-prisma.config.mjs'],'',180000,{TEST_MIGRATION_DATABASE_URL:migrationURL});
  const hba=JSON.parse(await sql("SELECT jsonb_agg(jsonb_build_object('type',type,'address',address,'method',auth_method)) FROM pg_hba_file_rules WHERE type LIKE 'host%';"));
  assert.ok(hba.length>0&&hba.every(rule=>rule.method==='scram-sha-256'));record.hostAuthentication=hba;
  await sql(await readFile(join(root,'tools/phase9d/permissions.sql'),'utf8'));
  if(exportMode){await sql(await readFile(join(root,'tools/phase9d/outbox.sql'),'utf8'));record.outboxPermissionsSha256=hash(await readFile(join(root,'tools/phase9d/outbox.sql')));}
  await sql('REVOKE TEMPORARY ON DATABASE "'+database+'" FROM PUBLIC');
  const password=randomUUID();assert.match(password,/^[a-f0-9-]+$/);await sql("ALTER ROLE shadow9d_worker PASSWORD '"+password+"';");
  await sql('SELECT shadow9d.set_stop(false)');
  const at='2026-10-12T16:00:00.000Z';
  const evidence=minimizeEvidence(createResponsibilityEvidence({caseId:'capsule',bookingId:'synthetic-booking',caseType:'DRIVER_CANCELLATION',occurredAt:at,clock:{now:()=>new Date(at)}}).snapshot(),'synthetic-only-key-at-least-32-bytes-long');
  const quoted=JSON.stringify(evidence.snapshot);assert.ok(!quoted.includes("'"));
  const privacyKey='synthetic-only-key-at-least-32-bytes-long',exportPassword=randomUUID();
  if(exportMode){
    const fixture=outboxCapsuleFixture(at);await sql(fixture.sql);record.sourceFixture={type:fixture.sourceType,actualCollectorExecution:fixture.actualCollectorExecution,sqlSha256:hash(fixture.sql)};
    await sql("UPDATE outbox9d.configuration SET enabled=true,privacy_key='"+privacyKey+"';ALTER ROLE shadow9d_exporter PASSWORD '"+exportPassword+"';");
  }else await sql("SELECT shadow9d.enqueue('"+evidence.evidenceHash+"','"+quoted+"'::jsonb,'"+evidence.evidenceHash+"','"+evidence.originalCommitment+"');");
  const tables=(await sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")).split('\n');
  async function publicState(){const values=[];for(const table of tables){assert.match(table,/^[a-z0-9_]+$/);values.push(JSON.parse(await sql('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) FROM public."'+table+'" t;')));}return hash(JSON.stringify(values));}
  const before=await publicState();
  // A reachable host listener makes the negative route probe meaningful.
  server=createServer(socket=>socket.end('host sentinel'));await new Promise((done,fail)=>{server.once('error',fail);server.listen(49199,'0.0.0.0',done);});
  const canaryName='phase9d-private-'+randomUUID();
  canaryPath=join(output,canaryName);const canaryValue=randomUUID();await writeFile(canaryPath,canaryValue,{flag:'wx'});
  const control=`const net=require('node:net');const s=net.createConnection({host:'host.docker.internal',port:49199});const t=setTimeout(()=>{s.destroy();process.exit(1)},2000);s.once('connect',()=>{clearTimeout(t);console.log(JSON.stringify({status:'REACHABLE',address:s.remoteAddress}));s.destroy()});s.once('error',()=>process.exit(1));`;
  const positive=JSON.parse(await docker(['run','--rm','--network','bridge','--entrypoint','node',base,'-e',control], '',10000));
  assert.equal(positive.status,'REACHABLE');assert.match(positive.address,/^[0-9.]+$/);record.hostSentinelPositiveControl=true;
  await docker(['create','-i','--name',workerName,'--label',label,'--network','container:'+dbName,
    '--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--pids-limit','64','--memory','512m','--cpus','0.75','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m',
    ...['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].flatMap(key=>['-e',key+'=']),image]);resources.worker=true;
  const workerInfo=JSON.parse(await docker(['inspect',workerName]))[0];
  assert.equal(workerInfo.Config.Labels['rcs.phase9d.owned'],run);assert.equal(workerInfo.HostConfig.ReadonlyRootfs,true);
  assert.equal(workerInfo.Config.User,'1000:1000');assert.ok(workerInfo.Mounts.every(m=>m.Type==='tmpfs'));
  assert.deepEqual(Object.keys(workerInfo.HostConfig.Tmpfs),['/tmp']);
  assert.equal(workerInfo.HostConfig.Privileged,false);assert.deepEqual(workerInfo.HostConfig.CapDrop,['ALL']);
  assert.notEqual(workerInfo.HostConfig.PidMode,'host');assert.notEqual(workerInfo.HostConfig.PidMode,'container:'+dbName);
  assert.notEqual(workerInfo.HostConfig.IpcMode,'host');
  assert.ok(workerInfo.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  record.profile={readOnly:true,user:workerInfo.Config.User,capDrop:workerInfo.HostConfig.CapDrop,security:workerInfo.HostConfig.SecurityOpt,
    memory:workerInfo.HostConfig.Memory,pids:workerInfo.HostConfig.PidsLimit,nanoCpus:workerInfo.HostConfig.NanoCpus,
    hostPid:false,hostIpc:false,mounts:workerInfo.Mounts.map(m=>({type:m.Type,destination:m.Destination})),internalNetwork:true,bridgeIPv4Inhibited:true};
  const target=new URL('postgresql://'+(exportMode?'shadow9d_exporter:'+exportPassword:'shadow9d_worker:'+password)+'@localhost:5432/'+database);
  const raw=await docker(['start','-a','-i',workerName],JSON.stringify({connectionString:target.toString(),canaryName,hostAddress:positive.address,key:privacyKey}),45000);
  const witness=JSON.parse(raw);assert.equal(witness.outcome.status,exportMode?'ACKED':'COMPLETED');assert.equal(witness.liveModelCalls,0);
  if(exportMode){
    assert.equal(await publicState(),before);record.exporterWitness=witness;
    target.username='shadow9d_worker';target.password=password;
    record.workerWitness=JSON.parse(await docker(['start','-a','-i',workerName],JSON.stringify({connectionString:target.toString(),canaryName,hostAddress:positive.address}),45000));
    assert.equal(record.workerWitness.outcome.status,'COMPLETED');assert.equal(record.workerWitness.liveModelCalls,0);
  }
  assert.equal(await publicState(),before);
  assert.equal(await readFile(canaryPath,'utf8'),canaryValue);record.privateCanaryExcludedAndUnchanged=true;
  const rows=JSON.parse(await sql('SELECT jsonb_agg(jsonb_build_object(\'status\',status,\'result\',result)) FROM shadow9d.work;'));assert.equal(rows.length,1);assert.equal(rows[0].status,'COMPLETED');assert.equal(rows[0].result.route,'NEEDS_ADMIN_REVIEW');
  record.status='PASS';record.witness=witness;record.publicTables=tables.length;record.applicationStateSha256=before;record.applicationUnchanged=true;record.storedResult=rows[0].result;
  record.boundary='Disposable Docker namespace/process and dedicated SQL principal; not deployed IAM, remote audit, live provider broker, kernel exploit resistance or production readiness.';
}catch(error){record.status='FAIL';record.error=error.message;process.exitCode=1;}
finally{
  const cleanup=[];
  if(canaryPath){try{await unlink(canaryPath);cleanup.push({kind:'synthetic-canary',status:'REMOVED_OWNED'});}catch{cleanup.push({kind:'synthetic-canary',status:'FAILED'});process.exitCode=1;}}
  if(server)await new Promise(done=>server.close(done));
  for(const [kind,name]of [['worker',workerName],['db',dbName],['network',network]])if(resources[kind]){
    try{const info=JSON.parse(await docker([kind==='network'?'network':'container','inspect',name]))[0];assert.equal((kind==='network'?info.Labels:info.Config.Labels)['rcs.phase9d.owned'],run);
      await docker(kind==='network'?['network','rm',name]:['rm','-f','-v',name]);cleanup.push({kind,status:'REMOVED_OWNED'});
    }catch(error){cleanup.push({kind,status:'FAILED',error:error.message});process.exitCode=1;}
  }
  record.cleanup=cleanup;record.finished=new Date().toISOString();
  await writeFile(join(output,run+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
  console.log(JSON.stringify({run,status:record.status,error:record.error,checks:record.witness?.checks.length,denials:record.witness?.denied.length,cleanup}));
}
