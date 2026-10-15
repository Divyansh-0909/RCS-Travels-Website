import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir,readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyBaseline,hash } from './baseline.mjs';
import { startPostgisTestEnvironment } from '../../backend/tests/helpers/postgisEnvironment.js';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from '../../backend/tests/helpers/phase9Isolation.js';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {PostgreSqlContainer}=require('@testcontainers/postgresql');
const root=resolve(import.meta.dirname,'../..'),output=join(root,'output/phase9d-1-sql-broker-2026-10-13');
const mode=process.argv[2],id=mode+'-'+Date.now()+'-'+randomUUID();
assert.ok(['historical','all-db','sql','full','typecheck','replay'].includes(mode));await mkdir(output,{recursive:true});
const sourceFiles=['tools/phase9d/permissions.sql','tools/phase9d/next-run.mjs','tools/phase9d/sql-profiler.Dockerfile',
  'backend/tests/helpers/phase9dCurrentPolicyWitness.js','backend/tests/integration/phase5DeferredPostgisValidation.test.js',
  'backend/tests/integration/phase7ShadowAdjudicationPostgres.test.js'];
if(mode==='sql')sourceFiles.push('backend/tests/integration/phase9dSqlCertification.test.js','backend/tests/helpers/phase9dSqlMutations.js','tools/phase9d/profiler-vendor/postgresql-server-dev-17.deb','tools/phase9d/profiler-vendor/plpgsql-check.tar.gz');
const identities=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await readFile(join(root,file)))])));
const before=await identities(),baseline=await verifyBaseline(),started=new Date().toISOString();
const inherited=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const env={...inherited,NODE_ENV:'test',PHASE9D_NEXT_OUTPUT:output,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,
  DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,
  PHASE9_ISOLATED:'1',DOCKER_HOST:'npipe:////./pipe/dockerDesktopLinuxEngine'};
async function command(binary,args,cwd,extra={}){
  const child=spawn(binary,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';
  child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
  const code=await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail);});return {code,log};
}
let environment,container,record;
try{
  if(mode==='sql'){
    const image='rcs-phase9d-profiler:'+hash(await readFile(join(root,'tools/phase9d/sql-profiler.Dockerfile'))).slice(0,16);
    const build=await command('docker',['build','-f','tools/phase9d/sql-profiler.Dockerfile','-t',image,'tools/phase9d'],root);
    await writeFile(join(output,id+'-image-build.log'),build.log);assert.equal(build.code,0,'profiler image build');
    container=await new PostgreSqlContainer(image).withDatabase('rcs_container_test').withUsername('rcs_test_user').withPassword(randomUUID())
      .withEnvironment({POSTGRES_INITDB_ARGS:'--auth-host=scram-sha-256',POSTGRES_HOST_AUTH_METHOD:'scram-sha-256'})
      .withCommand(['postgres','-c','shared_preload_libraries=plpgsql,plpgsql_check','-c','plpgsql_check.profiler=on']).start();
    environment={connectionString:container.getConnectionUri(),stop:()=>container.stop()};
    const {Client}=require('pg'),admin=new Client({connectionString:environment.connectionString});await admin.connect();
    try{await admin.query("CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;DROP EXTENSION IF EXISTS postgis CASCADE;CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;");}finally{await admin.end();}
  }else if(['historical','all-db'].includes(mode))environment=await startPostgisTestEnvironment();
  const files=mode==='sql'?['tests/integration/phase9dSqlCertification.test.js']:mode==='historical'?
    ['tests/integration/phase5DeferredPostgisValidation.test.js','tests/integration/phase7ShadowAdjudicationPostgres.test.js']:
    (await readdir(join(root,'backend/tests/integration'))).filter(name=>name.endsWith('.test.js')&&!name.startsWith('phase9')).sort().map(name=>'tests/integration/'+name);
  const args=mode==='full'?['--import','tsx','--test','--test-concurrency=4','--test-reporter=tap','tests/*.test.js']:
    mode==='typecheck'?['node_modules/typescript/bin/tsc','--noEmit']:
    mode==='replay'?['tests/run-phase9.js','--replay']:
    ['--import','./tests/helpers/phase9Isolation.js','--import','tsx','--test','--test-concurrency=1','--test-reporter=tap',...files];
  const extra=environment?{TEST_DATABASE_URL:environment.connectionString}: {PHASE9_ISOLATED:undefined};
  const execution=await command(process.execPath,args,join(root,'backend'),extra);
  const log=execution.log.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]');
  await writeFile(join(output,id+'.log'),log,{flag:'wx'});
  record={schema:'phase9d-next-execution-v1',id,mode,started,finished:new Date().toISOString(),code:execution.code,args,sources:before,
    sourcesUnchanged:JSON.stringify(before)===JSON.stringify(await identities()),baseline,logSha256:hash(log),
    summary:log.split('\n').filter(line=>/^# (tests|pass|fail|skipped|duration_ms)/.test(line))};
  process.exitCode=execution.code||(record.sourcesUnchanged?0:1);
}catch(error){record={schema:'phase9d-next-execution-v1',id,mode,started,finished:new Date().toISOString(),code:1,sources:before,error:error.message.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]'),baseline};process.exitCode=1;}
finally{if(environment)await environment.stop();if(record)await writeFile(join(output,id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});}
console.log(JSON.stringify({id,code:record.code,sourcesUnchanged:record.sourcesUnchanged,summary:record.summary,error:record.error}));
