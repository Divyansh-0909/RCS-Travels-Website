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
import {prepareOutboxReplay} from './outbox-replay.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-outbox-broker-2026-10-13');
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {PostgreSqlContainer}=require('@testcontainers/postgresql'),{Client}=require('pg');
const mode=process.argv[2],id=mode+'-'+Date.now()+'-'+randomUUID();
assert.ok(['integration','unit','full','typecheck','record-replay','saved-replay'].includes(mode));await mkdir(out,{recursive:true});
const files=['tools/phase9d/outbox.sql','tools/phase9d/export-projection.mjs','tools/phase9d/export-repository.mjs','tools/phase9d/export-pump.mjs',
  'tools/phase9d/export-core.mjs','tools/phase9d/export-child.mjs','backend/tests/helpers/phase9dExportFixture.js',
  'tools/phase9d/outbox-run.mjs','tools/phase9d/outbox-replay.mjs','backend/tests/integration/phase9dOutboxReplay.test.js','backend/tests/integration/phase9dOutbox.test.js','backend/tests/phase9dExport.test.js'];
const sources=async()=>{
  const graph=await phase9ReplayDependencyHashes(files.filter(file=>/\.m?js$/.test(file)),{read:async url=>{
    const file=relative(join(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));return readFile(join(root,file));
  }});
  const extra=[...files,'tools/phase9d/permissions.sql','tools/phase9d/sql-profiler.Dockerfile','backend/prisma/schema.prisma','backend/package.json','backend/package-lock.json'];
  for(const name of (await readdir(join(root,'backend/prisma/migrations'))).sort())if(name!=='migration_lock.toml')extra.push('backend/prisma/migrations/'+name+'/migration.sql');
  for(const file of extra)graph[file]=hash(await readFile(join(root,file)));
  return Object.fromEntries(Object.entries(graph).sort(([a],[b])=>a.localeCompare(b)));
};
const before=await sources(),baseline=await verifyBaseline(),started=new Date().toISOString();
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,
  PHASE9D_OUTBOX_OUTPUT:out,NODE_V8_COVERAGE:join(out,'coverage-raw'),DOCKER_HOST:'npipe:////./pipe/dockerDesktopLinuxEngine'});
await mkdir(env.NODE_V8_COVERAGE,{recursive:true});
async function command(binary,args,cwd,extra={}){
  const child=spawn(binary,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';
  child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
  const code=await new Promise((ok,fail)=>{child.once('close',ok);child.once('error',fail);});return {code,log};
}
let container,record;
try{
  const replay=['record-replay','saved-replay'].includes(mode);
  const recipePath=replay?await prepareOutboxReplay({mode,path:process.argv[3],output:out,sources:before}):null;
  let args=['--import','tsx','--test','--test-reporter=tap','--test-concurrency=4','tests/*.test.js'],extra={},imageIdentity=null;
  if(mode==='unit')args=['--test','--test-reporter=tap','tests/phase9dExport.test.js'];
  if(mode==='typecheck')args=['node_modules/typescript/bin/tsc','--noEmit'];
  if(mode==='integration'||replay){
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
    args=['--import','./tests/helpers/phase9Isolation.js','--import','tsx','--test','--test-reporter=tap',replay?'tests/integration/phase9dOutboxReplay.test.js':'tests/integration/phase9dOutbox.test.js'];
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
