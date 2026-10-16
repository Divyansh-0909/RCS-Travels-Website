import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {phase9ReplayDependencyHashes} from '../../backend/tests/helpers/phase9ReplaySources.js';
import {hash} from './baseline.mjs';
import {closureBaseline} from './closure-baseline.mjs';
import {prepareCustodyReplay} from './audit-replay.mjs';
import {serverDiagnostics} from './audit-diagnostics.mjs';
import {PHASE9_EMPTY_ENV,PHASE9_FORBIDDEN_DATABASE} from '../../backend/tests/helpers/phase9Isolation.js';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.CUSTODY_OUTPUT??'output/phase9d-custody-closure-cloud-2026-10-15'),mode=process.argv[2],id=mode+'-'+Date.now()+'-'+randomUUID();
assert.ok(['unit','regression-units','broader-db','broker-db','transport-db','outbox-db','custody-db','db','lineage','safety','sql','sql-native','sql-profiler-probe','regressions','replay-record','replay','full','typecheck'].includes(mode));await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),{PostgreSqlContainer}=require('@testcontainers/postgresql'),{Client}=require('pg');
const scope=[...(await readdir(join(root,'tools/phase9d'))).filter(n=>n.startsWith('custody-')||n.startsWith('closure-')||n.startsWith('audit-')).map(n=>'tools/phase9d/'+n),
  ...['phase9dCustodyAdversarial','phase9dCustodyBoundary','phase9dCustodyClosure','phase9dCustodyClosureTransport','phase9dCustodyObserver','phase9dCustody','phase9dBroker','phase9dTransport'].map(name=>'backend/tests/'+name+'.test.js'),
  ...['phase9dCustodyClosure','phase9dCustodyLineage','phase9dCustodySafety','phase9dCustodyReplay','phase9dCustodySql','phase9dCustody','phase9dBroker','phase9dTransport','phase9dOutbox'].map(name=>'backend/tests/integration/'+name+'.test.js'),
  'backend/tests/helpers/phase9dCustodyClosureFixture.js','backend/tests/helpers/phase9dCustodyFixture.js','backend/tests/helpers/phase9dCustodyFaultChild.js','backend/tests/helpers/phase9dCustodyReplaySender.mjs',
  ...['broker.sql','broker-recovery.sql','permissions.sql','outbox.sql','transport-sender.sql','transport-receiver.sql','sql-profiler.Dockerfile'].map(n=>'tools/phase9d/'+n),
  'backend/tests/helpers/phase9dRecoveryFixture.js','backend/package.json','backend/package-lock.json'];
const broader=(await readdir(join(root,'backend/tests/integration'))).filter(file=>file.endsWith('.test.js')&&!file.startsWith('phase9')).sort();
const regressionUnits=['Custody','Broker','Transport','Export','Recovery'].map(name=>'phase9d'+name+'.test.js');
scope.push(...broader.map(file=>'backend/tests/integration/'+file),...regressionUnits.map(file=>'backend/tests/'+file));
scope.push('backend/tests/helpers/phase9Isolation.js','backend/tests/prisma.config.js','backend/tests/helpers/phase9-empty.env','backend/data/zones.geojson','backend/data/shady-zones.geojson');
const sources=async()=>{
  const graph=await phase9ReplayDependencyHashes(scope.filter(f=>/\.m?js$/.test(f)),{read:async url=>{const file=relative(join(root,'backend'),fileURLToPath(url));assert.ok(!file.startsWith('..')&&!file.includes(':'));return readFile(join(root,file));}});
  const files=[...scope,'backend/prisma/schema.prisma'];
  for(const n of (await readdir(join(root,'backend/prisma/migrations'))).sort())if(n!=='migration_lock.toml')files.push('backend/prisma/migrations/'+n+'/migration.sql');
  for(const f of files)graph[f]=hash(await readFile(join(root,f)));return Object.fromEntries(Object.entries(graph).sort(([a],[b])=>a.localeCompare(b)));
};
const before=await sources(),baseline=await closureBaseline(),started=new Date().toISOString(),containers=[];
const replay=mode.startsWith('replay')?await prepareCustodyReplay({path:mode==='replay'?process.argv[3]:undefined,output:out,sources:before}):null;
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,NODE_V8_COVERAGE:join(out,'coverage-raw',id),CUSTODY_OUTPUT:out});
await mkdir(env.NODE_V8_COVERAGE,{recursive:true});
const command=async(binary,args,cwd,extra={})=>{const child=spawn(binary,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);return {code:await new Promise((ok,fail)=>{child.once('close',ok);child.once('error',fail);}),log};};
let record;
try{
  let args=['--import','tsx','--test','--test-reporter=tap','--test-concurrency=4','tests/*.test.js'],extra={},servers=[];
  if(mode==='unit')args=['--test','--test-reporter=tap','tests/phase9dCustodyClosure.test.js','tests/phase9dCustodyClosureTransport.test.js','tests/phase9dCustodyObserver.test.js','tests/phase9dCustodyBoundary.test.js','tests/phase9dCustodyAdversarial.test.js'];
  if(mode==='regression-units')args=['--import','tsx','--test','--test-reporter=tap',...regressionUnits.map(file=>'tests/'+file)];
  if(mode==='typecheck')args=['node_modules/typescript/bin/tsc','--noEmit'];
  if(['broader-db','broker-db','transport-db','outbox-db','custody-db','db','lineage','safety','sql','sql-native','sql-profiler-probe','replay-record','replay'].includes(mode)){
    const image=process.env.CUSTODY_POSTGRES_IMAGE??'rcs-phase9d-profiler:'+hash(await readFile(join(root,'tools/phase9d/sql-profiler.Dockerfile'))).slice(0,16);
    if(!process.env.CUSTODY_POSTGRES_IMAGE){const build=await command('docker',['build','-f','tools/phase9d/sql-profiler.Dockerfile','-t',image,'tools/phase9d'],root);await writeFile(join(out,id+'-build.log'),build.log,{flag:'wx'});assert.equal(build.code,0);}
    for(let i=0;i<2;i++){
      const c=await new PostgreSqlContainer(image).withDatabase('rcs_container_test').withUsername('rcs_test_user').withPassword(randomUUID())
        .withEnvironment({POSTGRES_INITDB_ARGS:'--auth-host=scram-sha-256',POSTGRES_HOST_AUTH_METHOD:'scram-sha-256'})
        .withCommand(['postgres',...(['sql-native','sql-profiler-probe'].includes(mode)?['-c','shared_preload_libraries=plpgsql_check','-c','plpgsql_check.profiler=on']:[]),'-c','logging_collector=on','-c','log_destination=jsonlog','-c','log_directory=/tmp/custody-logs','-c','log_filename=custody','-c','log_rotation_age=0','-c','log_rotation_size=4096','-c','log_parameter_max_length_on_error=0','-c','log_line_prefix=%m [%p] actor=%u state=%e ','-c','log_min_error_statement=panic','-c','log_statement=none']).start();containers.push(c);servers.push({container:c.getId(),image:(await command('docker',['inspect',c.getId(),'--format','{{.Image}}'],root)).log.trim(),version:await c.exec(['sh','-c','postgres --version'])});
    }
    const source=new Client({connectionString:containers[0].getConnectionUri()});await source.connect();
    await source.query('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;DROP EXTENSION IF EXISTS postgis CASCADE;CREATE SCHEMA extensions;CREATE EXTENSION postgis WITH SCHEMA extensions;');await source.end();
    const uri=new URL(containers[1].getConnectionUri()),name='rcs_verify_'+randomUUID().replaceAll('-',''),audit=new Client({connectionString:uri.toString()});await audit.connect();await audit.query('CREATE DATABASE "'+name+'"');await audit.end();uri.pathname='/'+name;
    extra={PHASE9_ISOLATED:'1',TEST_DATABASE_URL:containers[0].getConnectionUri(),CUSTODY_DATABASE_URL:uri.toString(),CUSTODY_SOURCE_CONTAINER:containers[0].getId(),CUSTODY_SQL_MODE:mode,...(replay?{CUSTODY_REPLAY_INPUT:replay}:{})};
    const suites={db:['phase9dCustodyClosure'],lineage:['phase9dCustodyLineage'],safety:['phase9dCustodySafety'],sql:['phase9dCustodySql'],'sql-native':['phase9dCustodySql'],'sql-profiler-probe':['phase9dCustodySql'],'broker-db':['phase9dBroker'],'transport-db':['phase9dTransport'],'outbox-db':['phase9dOutbox'],'custody-db':['phase9dCustody'],'replay-record':['phase9dCustodyReplay'],replay:['phase9dCustodyReplay']};
    const selected=mode==='broader-db'?broader.map(name=>'tests/integration/'+name):suites[mode].map(name=>'tests/integration/'+name+'.test.js');
    args=['--import','./tests/helpers/phase9Isolation.js','--import','tsx','--test','--test-concurrency=1','--test-reporter=tap',...selected];
  }
  let run;
  if(mode==='regressions'){
    run={code:0,log:''};
    // These legacy fixtures create cluster roles. A fresh server pair per suite
    // preserves their accepted isolation model and prevents role collisions.
    for(const childMode of ['custody-db','broker-db','transport-db','outbox-db']){
      const child=await command(process.execPath,['tools/phase9d/closure-run.mjs',childMode],root,{CUSTODY_POSTGRES_IMAGE:process.env.CUSTODY_POSTGRES_IMAGE??'',CUSTODY_OUTPUT:out});
      run.code=run.code||child.code;run.log+=child.log;
    }
  }else run=await command(process.execPath,args,join(root,'backend'),extra);
  const log=run.log.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]');await writeFile(join(out,id+'.log'),log,{flag:'wx'});
  const denials=[],diagnostics=[];
  for(const c of containers){const r=await command('docker',['logs',c.getId()],root);for(const line of r.log.split('\n')){const match=/actor=([a-z0-9_]+) state=(42501|28P01)/.exec(line);if(match)denials.push({server:c.getId(),actor:match[1],sqlstate:match[2]});}}
  for(const c of containers){const r=await command('docker',['exec',c.getId(),'cat','/tmp/custody-logs/custody.json'],root);diagnostics.push({server:c.getId(),logReadCode:r.code,rawLogSha256:hash(r.log),observations:serverDiagnostics(r.log)});}
  record={id,mode,started,finished:new Date().toISOString(),code:run.code,sources:before,sourcesUnchanged:JSON.stringify(before)===JSON.stringify(await sources()),baseline,servers,serverDiagnostics:diagnostics,replayInput:replay?{file:relative(root,replay),sha256:hash(await readFile(replay))}:null,independentServerDenials:denials,logSha256:hash(log),summary:log.split('\n').filter(l=>/^# (tests|pass|fail|skipped)/.test(l))};process.exitCode=run.code||(record.sourcesUnchanged?0:1);
}catch(e){record={id,mode,code:1,error:e.message.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]'),sources:before};process.exitCode=1;}
finally{for(const c of containers)await c.stop();await writeFile(join(out,id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});}
console.log(JSON.stringify({id,code:record.code,summary:record.summary,error:record.error}));
