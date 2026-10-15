import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {verifyBaseline,hash} from './baseline.mjs';
import {PHASE9_EMPTY_ENV,PHASE9_FORBIDDEN_DATABASE} from '../../backend/tests/helpers/phase9Isolation.js';
import {phase9ReplayDependencyHashes} from '../../backend/tests/helpers/phase9ReplaySources.js';
import {prepareBrokerReplay} from './recovery-replay.mjs';

const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-broker-recovery-2026-10-14');
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {PostgreSqlContainer}=require('@testcontainers/postgresql'),{Client}=require('pg');
const mode=process.argv[2],id=mode+'-'+Date.now()+'-'+randomUUID();
assert.ok(['integration','adversarial','integrity','unit','full','typecheck','record-replay','saved-replay'].includes(mode));await mkdir(out,{recursive:true});
const files=['tools/phase9d/transport-sender.sql','tools/phase9d/transport-receiver.sql','tools/phase9d/transport-protocol.mjs','tools/phase9d/transport-http.mjs','tools/phase9d/transport-service.mjs','tools/phase9d/transport-database.mjs','tools/phase9d/transport-pump.mjs','tools/phase9d/transport-child.mjs','tools/phase9d/transport-run.mjs','backend/tests/integration/phase9dTransport.test.js','backend/tests/helpers/phase9dTransportProcesses.js','backend/tests/phase9dTransport.test.js'];
files.push('tools/phase9d/transport-replay.mjs','backend/tests/integration/phase9dTransportReplay.test.js');
files.push('tools/phase9d/broker.sql','tools/phase9d/broker-run.mjs',...['session','offline','execution','guard','child'].map(name=>'tools/phase9d/broker-'+name+'.mjs'),
  'tools/phase9d/broker-replay.mjs','backend/tests/integration/phase9dBrokerReplay.test.js','backend/tests/phase9dRecovery.test.js','backend/tests/integration/phase9dBroker.test.js','backend/tests/helpers/phase9dBrokerProcesses.js');
files.push('tools/phase9d/recovery-run.mjs','tools/phase9d/recovery-replay.mjs','backend/tests/integration/phase9dRecoveryReplay.test.js','tools/phase9d/broker-recovery.sql',...['receipt','session','operations','cli'].map(n=>'tools/phase9d/recovery-'+n+'.mjs'),'backend/tests/phase9dRecovery.test.js','backend/tests/integration/phase9dRecovery.test.js','backend/tests/helpers/phase9dRecoveryFixture.js');
files.push('backend/tests/integration/phase9dRecoveryClosure.test.js','backend/tests/integration/phase9dRecoveryToken.test.js','backend/tests/helpers/phase9dRecoveryActions.js','backend/tests/helpers/phase9dRecoveryActionChild.js');
const sources=async()=>{
  const graph=await phase9ReplayDependencyHashes(files.filter(file=>/\.m?js$/.test(file)),{read:async url=>{
    const file=relative(join(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));return readFile(join(root,file));
  }});
  const extra=[...files,'tools/phase9d/permissions.sql','tools/phase9d/outbox.sql','tools/phase9d/sql-profiler.Dockerfile','backend/prisma/schema.prisma','backend/package.json','backend/package-lock.json'];
  for(const name of (await readdir(join(root,'backend/prisma/migrations'))).sort())if(name!=='migration_lock.toml')extra.push('backend/prisma/migrations/'+name+'/migration.sql');
  for(const file of extra)graph[file]=hash(await readFile(join(root,file)));
  return Object.fromEntries(Object.entries(graph).sort(([a],[b])=>a.localeCompare(b)));
};
const before=await sources(),baseline=await verifyBaseline(),started=new Date().toISOString();
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,
  PHASE9D_TRANSPORT_OUTPUT:out,PHASE9D_BROKER_OUTPUT:out,NODE_V8_COVERAGE:join(out,'coverage-raw'),DOCKER_HOST:'npipe:////./pipe/dockerDesktopLinuxEngine'});
await mkdir(env.NODE_V8_COVERAGE,{recursive:true});
async function command(binary,args,cwd,extra={}){
  const child=spawn(binary,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let log='';
  child.on('message',async message=>{
    if(message?.type!=='OWNED_RECOVERY_DATABASE_RESTART'||mode!=='integration'||!container)return;
    const own=container.getId();assert.match(own,/^[a-f0-9]{64}$/);
    const result=await command('docker',['restart',own],root);
    let ready=false;
    for(let i=0;result.code===0&&i<40&&!ready;i++){
      ready=(await command('docker',['exec',own,'pg_isready','-U','rcs_test_user','-d','rcs_container_test'],root)).code===0;
      if(!ready)await new Promise(ok=>setTimeout(ok,100));
    }
    const mapping=await command('docker',['inspect','--format={{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',own],root);
    const port=Number(mapping.log.trim());assert.ok(Number.isInteger(port)&&port>0&&port<=65535);
    if(child.connected)child.send({type:'OWNED_RECOVERY_DATABASE_RESTARTED',code:result.code===0&&ready?0:1,port});
  });
  child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
  const code=await new Promise((ok,fail)=>{child.once('close',ok);child.once('error',fail);});return {code,log};
}
let container,record;
try{
  const replay=['record-replay','saved-replay'].includes(mode);
  const recipePath=replay?await prepareBrokerReplay({mode,path:process.argv[3],output:out,sources:before}):null;
  let args=['--import','tsx','--test','--test-reporter=tap','--test-concurrency=4','tests/*.test.js'],extra={},imageIdentity=null;
  if(mode==='unit')args=['--test','--test-reporter=tap','tests/phase9dRecovery.test.js'];
  if(mode==='typecheck')args=['node_modules/typescript/bin/tsc','--noEmit'];
  if(['integration','adversarial','integrity'].includes(mode)||replay){
    const image='rcs-phase9d-profiler:'+hash(await readFile(join(root,'tools/phase9d/sql-profiler.Dockerfile'))).slice(0,16);
    const build=await command('docker',['build','-f','tools/phase9d/sql-profiler.Dockerfile','-t',image,'tools/phase9d'],root);
    await writeFile(join(out,id+'-build.log'),build.log,{flag:'wx'});assert.equal(build.code,0);
    const identity=await command('docker',['image','inspect','--format={{.Id}}',image],root);assert.equal(identity.code,0);imageIdentity=identity.log.trim();
    container=await new PostgreSqlContainer(imageIdentity).withDatabase('rcs_container_test').withUsername('rcs_test_user').withPassword(randomUUID())
      .withEnvironment({POSTGRES_INITDB_ARGS:'--auth-host=scram-sha-256',POSTGRES_HOST_AUTH_METHOD:'scram-sha-256'})
      .withCommand(['postgres','-c','shared_preload_libraries=plpgsql,plpgsql_check','-c','plpgsql_check.profiler=on']).start();
    const admin=new Client({connectionString:container.getConnectionUri()});await admin.connect();
    try{await admin.query('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;DROP EXTENSION IF EXISTS postgis CASCADE;CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;');}finally{await admin.end();}
    extra={PHASE9_ISOLATED:'1',TEST_DATABASE_URL:container.getConnectionUri(),...(replay?{PHASE9D_REPLAY_INPUT:recipePath}:{})};
    args=['--import','./tests/helpers/phase9Isolation.js','--import','tsx','--test','--test-reporter=tap',...(!replay?['--test-isolation=none']:[]),replay?'tests/integration/phase9dRecoveryReplay.test.js':mode==='adversarial'?'tests/integration/phase9dRecoveryClosure.test.js':mode==='integrity'?'tests/integration/phase9dRecoveryToken.test.js':'tests/integration/phase9dRecovery.test.js'];
  }
  const run=await command(process.execPath,args,join(root,'backend'),extra),log=run.log.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]');
  await writeFile(join(out,id+'.log'),log,{flag:'wx'});
  record={id,mode,started,finished:new Date().toISOString(),code:run.code,args,baseline,sources:before,imageIdentity,
    sourcesUnchanged:JSON.stringify(before)===JSON.stringify(await sources()),recipePath,logSha256:hash(log),summary:log.split('\n').filter(l=>/^# (tests|pass|fail|skipped)/.test(l))};
  process.exitCode=run.code||(record.sourcesUnchanged?0:1);
}catch(error){record={id,mode,started,code:1,error:error.message.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]'),sources:before};process.exitCode=1;}
finally{if(container){
  const diagnostic=await command('docker',['logs',container.getId()],root);
  await writeFile(join(out,id+'-database-diagnostic.log'),diagnostic.log.split('\n').filter(line=>/signal|segmentation|PANIC|FATAL|terminating|shut down|startup process/i.test(line)).join('\n'),{flag:'wx'});
  await container.stop();
}await writeFile(join(out,id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});}
console.log(JSON.stringify({id,code:record.code,sourcesUnchanged:record.sourcesUnchanged,summary:record.summary,error:record.error}));
