import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {phase9ReplayDependencyHashes} from '../../backend/tests/helpers/phase9ReplaySources.js';
import {hash,verifyBaseline} from './baseline.mjs';
import {PHASE9_EMPTY_ENV,PHASE9_FORBIDDEN_DATABASE} from '../../backend/tests/helpers/phase9Isolation.js';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-audit-custody-2026-10-14'),mode=process.argv[2],id=mode+'-'+Date.now()+'-'+randomUUID();
assert.ok(['unit','db','full','typecheck'].includes(mode));await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),{PostgreSqlContainer}=require('@testcontainers/postgresql'),{Client}=require('pg');
const scope=[...(await readdir(join(root,'tools/phase9d'))).filter(n=>n.startsWith('custody-')).map(n=>'tools/phase9d/'+n),
  'backend/tests/phase9dCustody.test.js','backend/tests/integration/phase9dCustody.test.js','backend/tests/helpers/phase9dCustodyFixture.js','backend/tests/helpers/phase9dCustodyFaultChild.js',
  ...['broker.sql','broker-recovery.sql','permissions.sql','outbox.sql','transport-sender.sql','transport-receiver.sql','sql-profiler.Dockerfile'].map(n=>'tools/phase9d/'+n),
  'backend/tests/helpers/phase9dRecoveryFixture.js','backend/package.json','backend/package-lock.json'];
const sources=async()=>{
  const graph=await phase9ReplayDependencyHashes(scope.filter(f=>/\.m?js$/.test(f)),{read:async url=>{const file=relative(join(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));return readFile(join(root,file));}});
  const files=[...scope,'backend/prisma/schema.prisma'];
  for(const n of (await readdir(join(root,'backend/prisma/migrations'))).sort())if(n!=='migration_lock.toml')files.push('backend/prisma/migrations/'+n+'/migration.sql');
  for(const f of files)graph[f]=hash(await readFile(join(root,f)));return Object.fromEntries(Object.entries(graph).sort(([a],[b])=>a.localeCompare(b)));
};
const before=await sources(),baseline=await verifyBaseline(),started=new Date().toISOString(),containers=[];
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,DOCKER_HOST:'npipe:////./pipe/dockerDesktopLinuxEngine',NODE_V8_COVERAGE:join(out,'coverage-raw'),CUSTODY_OUTPUT:out});
await mkdir(env.NODE_V8_COVERAGE,{recursive:true});
const command=async(binary,args,cwd,extra={})=>{const child=spawn(binary,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);return {code:await new Promise((ok,fail)=>{child.once('close',ok);child.once('error',fail);}),log};};
let record;
try{
  let args=['--import','tsx','--test','--test-reporter=tap','--test-concurrency=4','tests/*.test.js'],extra={},servers=[];
  if(mode==='unit')args=['--test','--test-reporter=tap','tests/phase9dCustody.test.js'];
  if(mode==='typecheck')args=['node_modules/typescript/bin/tsc','--noEmit'];
  if(mode==='db'){
    const image='rcs-phase9d-profiler:'+hash(await readFile(join(root,'tools/phase9d/sql-profiler.Dockerfile'))).slice(0,16);
    const build=await command('docker',['build','-f','tools/phase9d/sql-profiler.Dockerfile','-t',image,'tools/phase9d'],root);await writeFile(join(out,id+'-build.log'),build.log,{flag:'wx'});assert.equal(build.code,0);
    for(let i=0;i<2;i++){
      const c=await new PostgreSqlContainer(image).withDatabase('rcs_container_test').withUsername('rcs_test_user').withPassword(randomUUID())
        .withEnvironment({POSTGRES_INITDB_ARGS:'--auth-host=scram-sha-256',POSTGRES_HOST_AUTH_METHOD:'scram-sha-256'})
        .withCommand(['postgres','-c','log_line_prefix=%m [%p] actor=%u state=%e ','-c','log_min_error_statement=panic','-c','log_statement=none']).start();containers.push(c);servers.push(c.getId());
    }
    const source=new Client({connectionString:containers[0].getConnectionUri()});await source.connect();
    await source.query('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;DROP EXTENSION IF EXISTS postgis CASCADE;CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;');await source.end();
    const uri=new URL(containers[1].getConnectionUri()),name='rcs_verify_'+randomUUID().replaceAll('-',''),audit=new Client({connectionString:uri.toString()});await audit.connect();await audit.query('CREATE DATABASE "'+name+'"');await audit.end();uri.pathname='/'+name;
    extra={PHASE9_ISOLATED:'1',TEST_DATABASE_URL:containers[0].getConnectionUri(),CUSTODY_DATABASE_URL:uri.toString()};
    args=['--import','./tests/helpers/phase9Isolation.js','--import','tsx','--test','--test-reporter=tap','tests/integration/phase9dCustody.test.js'];
  }
  const run=await command(process.execPath,args,join(root,'backend'),extra);const log=run.log.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]');await writeFile(join(out,id+'.log'),log,{flag:'wx'});
  const denials=[];
  for(const c of containers){const r=await command('docker',['logs',c.getId()],root);for(const line of r.log.split('\n')){const match=/actor=([a-z0-9_]+) state=(42501|28P01)/.exec(line);if(match)denials.push({server:c.getId(),actor:match[1],sqlstate:match[2]});}}
  record={id,mode,started,finished:new Date().toISOString(),code:run.code,sources:before,sourcesUnchanged:JSON.stringify(before)===JSON.stringify(await sources()),baseline,servers,independentServerDenials:denials,logSha256:hash(log),summary:log.split('\n').filter(l=>/^# (tests|pass|fail|skipped)/.test(l))};process.exitCode=run.code||(record.sourcesUnchanged?0:1);
}catch(e){record={id,mode,code:1,error:e.message.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]'),sources:before};process.exitCode=1;}
finally{for(const c of containers)await c.stop();await writeFile(join(out,id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});}
console.log(JSON.stringify({id,code:record.code,summary:record.summary,error:record.error}));
