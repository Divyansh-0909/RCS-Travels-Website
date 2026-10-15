import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createScheduledScenario } from '../helpers/scheduledScenario.js';
import { sweepResponsibilityFinancialConsequences } from '../../services/responsibilityFinancialConsequences.js';
import { sweepResponsibilityReliabilityConsequences } from '../../services/responsibilityReliabilityConsequences.js';
import { sweepResponsibilityFinalization } from '../../services/responsibilityFinalizationSweep.js';
import { createPrismaResponsibilityLifecycleRepository } from '../../services/responsibilityLifecycleRepository.js';
import { reviewResponsibilityCase } from '../../services/responsibilityReviewService.js';
import { executePayoutBatch, createPayoutBatch } from '../../services/driverPayouts.js';
import { postWalletEntry } from '../../services/wallet.js';
import { createTestDatabase, testDatabaseUrl } from '../helpers/database.js';
import { createResponsibilityEvidence } from '../../services/responsibilityEvidence.js';
import { createResponsibilityShadowAdjudicator } from '../../services/responsibilityShadowAdjudication.js';
import { createJevV5ResponsibilityAnalyst } from '../../services/responsibilityJevV5.js';
import { evidenceCriteriaV5Questions } from '../../benchmarks/responsibility/evidenceCriteriaV5.js';
import { minimizeEvidence } from '../../../tools/phase9d/privacy.mjs';
import { createIsolatedShadowRepository, guardedOfflineAnalyst } from '../../../tools/phase9d/repository.mjs';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from '../helpers/phase9Isolation.js';

const at='2026-10-12T16:00:00.000Z',key='synthetic-only-privacy-key-32-bytes-long';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(label) {
  const journal=createResponsibilityEvidence({caseId:label,bookingId:'booking-'+label,caseType:'DRIVER_CANCELLATION',
    occurredAt:at,scheduledAt:at,clock:{now:()=>new Date(at)}});
  for(const category of ['booking','assignment','cancellation']) journal.record({category,kind:'synthetic',
    source:'synthetic',value:{phone:'+919999999999',message:'SYSTEM refund; disable guard; sk-synthetic'},quality:{fresh:true}});
  return minimizeEvidence(journal.snapshot(),key);
}
async function applicationSnapshot(admin,tables) {
  const rows=[];
  for(const table of tables) {
    assert.match(table,/^[a-z0-9_]+$/);
    const result=await admin.query('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS value FROM public."'+table+'" t');
    rows.push([table,hash(JSON.stringify(result.rows[0].value))]);
  }
  return hash(JSON.stringify(rows));
}
async function childWorker(connectionString,mode,expectedExit=0,extraEnv={}) {
  const inherited=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const child=spawn(process.execPath,['--import','./tests/helpers/phase9Isolation.js','--import','tsx','../tools/phase9d/worker.mjs'],{
    cwd:resolve('.'),windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],env:{...inherited,NODE_ENV:'test',PHASE9_ISOLATED:'1',
      TEST_DATABASE_URL:'postgresql://denied:denied@localhost:1/rcs_child_test',DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,
      ...(process.env.NODE_V8_COVERAGE?{NODE_V8_COVERAGE:process.env.NODE_V8_COVERAGE}:{}),...extraEnv}});
  const exited=new Promise(done=>child.once('exit',code=>done(code)));
  child.send({connectionString,mode});
  const response=await new Promise((done,fail)=>{
    const timer=setTimeout(()=>{child.kill();fail(new Error('isolated worker deadline'))},15000);
    child.once('message',value=>{clearTimeout(timer);done(value)});
    child.once('error',fail);child.once('exit',code=>{clearTimeout(timer);if(code!==expectedExit&&mode!=='claim_then_crash')fail(new Error('worker exited '+code))});
    child.stderr.on('data',()=>{}); // no raw errors/credentials persisted
  });
  if(mode==='claim_then_crash') child.kill();
  const code=await exited;if(mode!=='claim_then_crash')assert.equal(code,expectedExit);
  return response;
}
test('Phase 9D actual least-privilege principals, audit custody and operational recovery',async t=>{
  const database=await createTestDatabase();
  const url=testDatabaseUrl();url.pathname='/'+database.name;
  const admin=new pg.Client({connectionString:url.toString()});
  const connections=[],witness={schema:'phase9d-isolation-v1',denials:[],checks:[],tables:[],routines:[],noLiveCalls:true};
  await admin.connect();
  try {
    assert.match(database.name,/^rcs_verify_[a-f0-9]{32}$/);
    await createScheduledScenario({now:at}).persist(database.client);
    await admin.query(await readFile(new URL('../../../tools/phase9d/permissions.sql',import.meta.url),'utf8'));
    await admin.query('REVOKE TEMPORARY ON DATABASE "'+database.name+'" FROM PUBLIC');
    const logins={};
    for(const role of ['worker','capture','ops','inspector','recorder']) {
      const username='shadow9d_'+role,password=randomUUID();
      await admin.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) AS command",[username,password]).then(async r=>admin.query(r.rows[0].command));
      const target=new URL(url);target.username=username;target.password=password;
      const client=new pg.Client({connectionString:target.toString(),connectionTimeoutMillis:2000,statement_timeout:2000});
      await client.connect();connections.push(client);logins[role]={client,url:target.toString()};
      assert.equal((await client.query('SELECT session_user AS identity')).rows[0].identity,username);
    }
    const worker=logins.worker.client,capture=logins.capture.client,ops=logins.ops.client,inspector=logins.inspector.client,recorder=logins.recorder.client;
    const call=async(client,sql,args=[]) => (await client.query(sql,args)).rows[0].value;
    const enqueue=async(label) => {const e=fixture(label);return call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(e.snapshot),e.evidenceHash,e.originalCommitment])};
    const stop=state=>call(ops,'SELECT shadow9d.set_stop($1) AS value',[state]);
    const advance=seconds=>admin.query("UPDATE shadow9d.control SET now_at=now_at+($1*interval '1 second')",[seconds]);
    const reset=async()=>{await stop(false);await admin.query("DELETE FROM shadow9d.work");await admin.query('UPDATE shadow9d.control SET used_requests=0,request_budget=20,queue_limit=100,max_concurrent=2')};
    const check=async(name,work)=>t.test(name,async()=>{try{await work();witness.checks.push({name,status:'PASS'})}catch(error){witness.checks.push({name,status:'FAIL'});throw error}});
    const repo=createIsolatedShadowRepository(worker);
    const result={mode:'SHADOW',route:'NEEDS_ADMIN_REVIEW',suggestedClassification:'DRIVER_CAUSED',severity:'LOW',confidence:0.99};
    const deny=async(sql,label)=>{
      for(let retry=0;retry<2;retry++){
        let error;try{await worker.query(sql)}catch(e){error=e}
        assert.ok(error,label);assert.equal(error.code,'42501',label);
        await recorder.query("SELECT audit9d.append('PERMISSION_DENIED',NULL,$1)",[JSON.stringify({label,sqlstate:error.code,retry})]);
        witness.denials.push({label,sqlstate:error.code,retry});
      }
    };
    await check('catalog denies every actual application table and consequence operation',async()=>{
      const tables=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
      witness.tables=tables;witness.initialApplicationSnapshot=await applicationSnapshot(admin,tables);assert.ok(tables.includes('bookings'));assert.ok(tables.includes('responsibility_admin_reviews'));
      const before=await applicationSnapshot(admin,tables);
      for(const table of tables) {
        assert.match(table,/^[a-z0-9_]+$/);
        for(const sql of ['UPDATE public."'+table+'" SET '+ '"id"="id"','DELETE FROM public."'+table+'"','TRUNCATE public."'+table+'"','INSERT INTO public."'+table+'" DEFAULT VALUES']) {
          // UPDATE uses an actual existing column, so denial does not depend on schema errors.
          const query=sql.startsWith('UPDATE') ? (await admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1",[table])).rows[0].column_name : null;
          await deny(query ? 'UPDATE public."'+table+'" SET "'+query+'"="'+query+'"' : sql,table+':'+sql.split(' ')[0]);
        }
      }
      assert.equal(before,await applicationSnapshot(admin,tables));witness.applicationStateUnchanged=true;
      const privileges=(await admin.query("SELECT c.relname,has_table_privilege('shadow9d_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S')")).rows;
      assert.ok(privileges.every(r=>!r.allowed));witness.privileges=privileges;
      assert.ok((await admin.query("SELECT has_any_column_privilege('shadow9d_worker',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows.every(r=>!r.allowed));
    });
    await check('no role escalation, operative security-definer access or audit tampering',async()=>{
      for(const [sql,label] of [
        ['SET ROLE shadow9d_owner','owner-role'],['SET ROLE shadow9d_ops','ops-role'],
        ['CREATE ROLE shadow9d_escalated','create-role'],["ALTER ROLE shadow9d_worker SUPERUSER",'superuser'],
        ['CREATE SCHEMA shadow9d_escape','create-schema'],['CREATE TEMP TABLE escape(id int)','temp-shadowing'],
        ['UPDATE audit9d.events SET action=\'forged\'','audit-update'],['DELETE FROM audit9d.events','audit-delete'],
        ['TRUNCATE audit9d.events','audit-truncate'],["SELECT audit9d.append('FORGED',NULL,'{}')",'audit-forgery'],
        ['UPDATE shadow9d.control SET stopped=false','control-write'],
        ['SELECT shadow9d.set_stop(false)','control-function'],['SELECT * FROM shadow9d.work','evidence-read'],
        ['SELECT shadow9d.delete_payload(1)','retention-function']]) await deny(sql,label);
      const routines=(await admin.query("SELECT n.nspname,p.proname,p.prosecdef,pg_get_userbyid(p.proowner) AS owner,has_function_privilege('shadow9d_worker',p.oid,'EXECUTE') AS executable,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','shadow9d','audit9d') AND p.prosecdef")).rows;
      witness.routines=routines;
      assert.ok(routines.every(r=>!r.executable || (r.nspname==='shadow9d'&&['claim','permit','complete','fail'].includes(r.proname)&&r.owner==='shadow9d_owner')));
      for(const r of routines.filter(r=>r.nspname!=='public')) assert.ok(r.proconfig.includes('search_path=pg_catalog, '+r.nspname+', pg_temp'));
      const memberships=(await admin.query("SELECT * FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='shadow9d_worker')")).rows;assert.deepEqual(memberships,[]);
      const count=(await inspector.query("SELECT count(*)::int AS count FROM audit9d.events WHERE action='PERMISSION_DENIED'")).rows[0].count;
      assert.equal(count,witness.denials.length);
    });
    await check('actual operative services deny shadow credentials even with schema-usage misgrant',async()=>{
      assert.equal((await worker.query("SELECT has_schema_privilege(current_user,'public','USAGE') AS allowed")).rows[0].allowed,false);
      assert.ok((await admin.query("SELECT to_regclass('public.responsibility_cases') AS relation")).rows[0].relation);
      await admin.query('GRANT USAGE ON SCHEMA public TO shadow9d_worker');
      const shadowDb=new PrismaClient({adapter:new PrismaPg({connectionString:logins.worker.url,max:2})});
      let providerCalls=0;
      const gateway={async createPayout(){providerCalls++;assert.fail('no dispatch')}};
      const lifecycle=createPrismaResponsibilityLifecycleRepository(shadowDb);
      const attempts=[
        ['financial-sweep',()=>sweepResponsibilityFinancialConsequences({db:shadowDb})],
        ['reliability-sweep',()=>sweepResponsibilityReliabilityConsequences({db:shadowDb})],
        ['finalization-sweep',()=>sweepResponsibilityFinalization({repository:lifecycle})],
        ['human-review',()=>reviewResponsibilityCase({caseId:'synthetic-case',adminActorId:'forged',decision:'WAIVE',reason:'forged',expectedEvidence:{version:'fake',hash:'f'.repeat(64)}},{repository:lifecycle,notify:false})],
        ['payout-batch',()=>executePayoutBatch('synthetic-batch',{db:shadowDb,gateway})],
        ['payout-create',()=>createPayoutBatch({createdBy:'forged',reference:'synthetic',db:shadowDb})],
        ['wallet',()=>shadowDb.$transaction(tx=>postWalletEntry(tx,{driverId:'synthetic',amount:1,type:'ride_collection',eventKey:'synthetic-shadow-attack'}))],
      ];
      witness.serviceDenials=[];
      try {
        for(const [label,attempt] of attempts){
          let error;try{await attempt()}catch(e){error=e}
          assert.ok(error,label);
          // Capture bounded Prisma code plus independently observed DB denial.
          const sqlstate=error.meta?.code??error.meta?.driverAdapterError?.cause?.originalCode??error.cause?.code;
          const denied=sqlstate==='42501'||/permission denied|access denied|user was denied access/i.test(error.message);
          assert.equal(denied,true,label+' code='+error.code+' sqlstate='+sqlstate);
          const event={label,code:error.code,sqlstate,denied};
          witness.serviceDenials.push(event);
          await recorder.query("SELECT audit9d.append('SERVICE_DENIED',NULL,$1)",[JSON.stringify(event)]);
        }
        assert.equal(providerCalls,0);
      } finally {await shadowDb.$disconnect();await admin.query('REVOKE USAGE ON SCHEMA public FROM shadow9d_worker')}
    });
    await check('capture cannot bypass minimization; oversized and raw evidence refused',async()=>{
      await reset();
      const e=fixture('schema');
      const enqueueRaw=snapshot=>call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(snapshot),e.evidenceHash,e.originalCommitment]);
      const raw=structuredClone(e.snapshot);raw.timeline[0].value={phone:'+919999999999'};
      assert.equal(await enqueueRaw(raw),null);
      const extra=structuredClone(e.snapshot);extra.apiKey='sk-synthetic';assert.equal(await enqueueRaw(extra),null);
      const metadata=structuredClone(e.snapshot);metadata.timeline[0].source='Bearer synthetic-secret';assert.equal(await enqueueRaw(metadata),null);
      const derived=structuredClone(e.snapshot);derived.timeline[0].derivedFrom=['private-person'];assert.equal(await enqueueRaw(derived),null);
      assert.equal(await enqueueRaw(null),null);
      assert.equal((await inspector.query('SELECT count(*)::int AS n FROM shadow9d.work')).rows[0].n,0);
      assert.ok(await enqueueRaw(e.snapshot));
      const oversized=structuredClone(e.snapshot);oversized.timeline=Array.from({length:200},()=>e.snapshot.timeline[0]);
      const oversizeFixture=fixture('oversize-independent');
      await assert.rejects(call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[oversizeFixture.evidenceHash,JSON.stringify(oversized),oversizeFixture.evidenceHash,oversizeFixture.originalCommitment]),e=>e.code==='23514');
    });
    await check('metadata cannot carry raw credentials or identities outside the minimized contract',async()=>{
      await reset();const e=fixture('metadata');
      for(const mutate of [
        s=>{s.caseType='sk-synthetic-private'},
        s=>{s.generatedAt='Bearer synthetic-secret'},
        s=>{s.timeline[0].receivedAt='private address'},
        s=>{s.timeline[0].category='private phone'},
        s=>{s.completeness.missing=['private person']},
        s=>{s.completeness.rawToken='synthetic-secret'},
      ]){
        const snapshot=structuredClone(e.snapshot);mutate(snapshot);
        assert.equal(await call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(snapshot),e.evidenceHash,e.originalCommitment]),null);
      }
      await assert.rejects(call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',['s'.repeat(64),JSON.stringify(e.snapshot),e.evidenceHash,e.originalCommitment]),error=>error.code==='23514');
      await assert.rejects(call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(e.snapshot),'s'.repeat(64),e.originalCommitment]),error=>error.code==='23514');
      await assert.rejects(call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(e.snapshot),e.evidenceHash,'s'.repeat(64)]),error=>error.code==='23514');
      assert.equal((await inspector.query('SELECT count(*)::int AS n FROM shadow9d.work')).rows[0].n,0);
    });
    await check('stop before capture/claim preserves work and prevents calls',async()=>{
      await stop(true);assert.equal(await enqueue('stopped'),null);assert.equal(await repo.claimNext(),null);
      await stop(false);const id=await enqueue('durable');await stop(true);assert.equal(await repo.claimNext(),null);
      assert.equal((await inspector.query('SELECT count(*)::int AS n FROM shadow9d.work WHERE id=$1',[id])).rows[0].n,1);
    });
    await check('SQL capture rejects impossible calendar observations before storage',async()=>{
      await reset();const e=fixture('invalid-calendar');
      for(const invalid of ['2026-02-30T16:00:00.000Z','2026-02-29T16:00:00.000Z','2026-13-12T16:00:00.000Z','2026-10-12T24:00:00.000Z','2026-10-12T25:00:00.000Z']){
        const snapshot=structuredClone(e.snapshot);snapshot.generatedAt=invalid;
        assert.equal(await call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',
          [e.evidenceHash,JSON.stringify(snapshot),e.evidenceHash,e.originalCommitment]),null);
      }
      assert.equal((await inspector.query('SELECT count(*)::int AS n FROM shadow9d.work')).rows[0].n,0);
    });
    await check('stop after claim, before analyst and before commit; epoch rejects late response',async()=>{
      await reset();await enqueue('claimed');const work=await repo.claimNext();assert.ok(work);
      await stop(true);let calls=0;
      const safe=guardedOfflineAnalyst(repo,{async analyzeResponsibilityCase(){calls++;return result}},{current:work});
      await assert.rejects(safe.analyzeResponsibilityCase({}),{code:'SHADOW_STOPPED'});assert.equal(calls,0);
      assert.equal((await repo.complete(work,result)).completed,false);
      await stop(false);assert.equal((await repo.complete(work,result)).completed,false);
      await advance(121);const recovered=await repo.claimNext();assert.equal(recovered.id,work.id);assert.notEqual(recovered.claimedAt,work.claimedAt);
      assert.equal(await repo.permit(recovered),true);assert.equal((await repo.complete(recovered,result)).completed,true);
      assert.equal((await repo.complete(recovered,result)).completed,false);
    });
    await check('stop during controlled offline timeout and abandoned lease recovery',async()=>{
      await reset();await enqueue('timeout');const work=await repo.claimNext();assert.equal(await repo.permit(work),true);
      let rejectModel,startModel;const entered=new Promise(resolve=>{startModel=resolve});const pending=new Promise((_resolve,reject)=>{rejectModel=reject});
      const offline=createJevV5ResponsibilityAnalyst({client:{async systemOne(){startModel();return pending}}});
      const adjudicator=createResponsibilityShadowAdjudicator({repository:repo,mode:'shadow',clock:{now:()=>new Date(at)},analyst:guardedOfflineAnalyst(repo,offline,{current:work})});
      const processing=adjudicator.processWork(work);await entered;await stop(true);rejectModel(Object.assign(new Error('synthetic timeout'),{code:'ETIMEDOUT'}));
      assert.equal((await processing).status,'RETRYABLE');
      assert.equal((await repo.complete(work,result)).completed,false);
      await stop(false);assert.equal(await repo.claimNext(),null);await advance(31);
      const recovered=await repo.claimNext();assert.equal(recovered.attemptCount,2);assert.equal((await repo.complete(recovered,result)).completed,true);
    });
    await check('multiple workers race and resource/cost quotas are independent SQL limits',async()=>{
      await reset();await enqueue('race');
      const target=new pg.Client({connectionString:logins.worker.url});await target.connect();connections.push(target);
      const other=createIsolatedShadowRepository(target);
      const claims=await Promise.all([repo.claimNext(),other.claimNext()]);assert.equal(claims.filter(Boolean).length,1);
      const work=claims.find(Boolean);await admin.query('UPDATE shadow9d.control SET request_budget=1');
      assert.equal(await repo.permit(work),true);assert.equal(await repo.permit(work),false);
      await enqueue('race2');await enqueue('race3');assert.ok(await repo.claimNext());assert.equal(await repo.claimNext(),null);
      await admin.query('UPDATE shadow9d.control SET queue_limit=1');assert.equal(await enqueue('backpressure'),null);
    });
    await check('retry exhaustion/manual review, stale lease and malformed capability fail safely',async()=>{
      await reset();await enqueue('retry');let work;
      for(let attempt=1;attempt<=4;attempt++){
        work=await repo.claimNext();assert.equal(work.attemptCount,attempt);
        await repo.fail(work,{errorCategory:'synthetic credential failure'});await advance(31);
      }
      assert.equal(await repo.claimNext(),null);
      assert.equal((await inspector.query('SELECT status FROM shadow9d.work WHERE id=$1',[work.id])).rows[0].status,'MANUAL_REVIEW');
      assert.equal((await repo.fail({...work,claimedAt:randomUUID()},{errorCategory:'evil'})).changed,false);
      assert.equal((await repo.complete({...work,claimedAt:randomUUID()},result)).completed,false);
    });
    await check('actual process termination/restart has only shadow login and offline V5',async()=>{
      await reset();await enqueue('process');
      const crashed=await childWorker(logins.worker.url,'claim_then_crash');assert.equal(crashed.claimed,true);
      await stop(true);await advance(121);
      const stopped=await childWorker(logins.worker.url,'resume');assert.equal(stopped.calls,0);
      await stop(false);
      const resumed=await childWorker(logins.worker.url,'resume');assert.equal(resumed.status,'COMPLETED');assert.equal(resumed.calls,1);assert.equal(resumed.privilegedSecretsPresent,false);
      const again=await childWorker(logins.worker.url,'resume');assert.equal(again.calls,0);
    });
    await check('actual worker rejects connection overrides, elevated login and inherited secrets before claim',async()=>{
      await reset();const id=await enqueue('startup-denial');
      const before=(await inspector.query('SELECT status,attempts FROM shadow9d.work WHERE id=$1',[id])).rows[0];
      for(const target of [logins.worker.url+'?user=shadow9d_ops',logins.worker.url+'?host=foreign.test']){
        assert.deepEqual(await childWorker(target,'resume',1),{status:'FAILED_CLOSED'});
      }
      assert.deepEqual(await childWorker(logins.worker.url,'resume',1,{CLERK_SECRET_KEY:'synthetic-only'}),{status:'FAILED_CLOSED'});
      await admin.query('ALTER ROLE shadow9d_worker CREATEROLE');
      try {assert.deepEqual(await childWorker(logins.worker.url,'resume',1),{status:'FAILED_CLOSED'})}
      finally {await admin.query('ALTER ROLE shadow9d_worker NOCREATEROLE')}
      assert.deepEqual((await inspector.query('SELECT status,attempts FROM shadow9d.work WHERE id=$1',[id])).rows[0],before);
    });
    await check('result minimization, append-only custody and authorized payload deletion',async()=>{
      await reset();const id=await enqueue('privacy');assert.equal(await enqueue('privacy'),id);
      const work=await repo.claimNext();
      assert.equal((await repo.complete(work,{...result,mode:'FINAL'})).completed,false);
      assert.equal((await repo.complete(work,{...result,confidence:2})).completed,false);
      assert.equal((await repo.complete(work,{...result,note:'x'.repeat(40000)})).completed,false);
      assert.equal(await call(ops,'SELECT shadow9d.delete_payload($1) AS value',[id]),false);
      assert.equal((await repo.complete(work,{...result,rawSecret:'Bearer synthetic-secret',factualValidation:{valid:'sk-synthetic-secret'}})).completed,true);
      const events=(await inspector.query('SELECT * FROM audit9d.events ORDER BY id')).rows;
      const text=JSON.stringify(events);assert.equal(text.includes('synthetic-secret'),false);assert.equal(text.includes('919999999999'),false);
      assert.equal(await call(ops,'SELECT shadow9d.delete_payload($1) AS value',[id]),true);
      const row=(await inspector.query('SELECT snapshot,result FROM shadow9d.work WHERE id=$1',[id])).rows[0];assert.deepEqual(row,{snapshot:null,result:null});
      assert.ok((await inspector.query("SELECT count(*)::int AS n FROM audit9d.events WHERE action='COMPLETE' AND work_id=$1",[id])).rows[0].n>0);
      witness.auditCount=events.length;
    });
    await check('database disconnection and revoked login leave durable lease without consequence',async()=>{
      await reset();await enqueue('disconnect');
      const doomed=new pg.Client({connectionString:logins.worker.url});await doomed.connect();
      const doomedRepo=createIsolatedShadowRepository(doomed);const work=await doomedRepo.claimNext();await doomed.end();
      await assert.rejects(doomedRepo.complete(work,result));await advance(121);assert.equal((await repo.claimNext()).id,work.id);
      await admin.query('ALTER ROLE shadow9d_worker NOLOGIN');
      const denied=new pg.Client({connectionString:logins.worker.url,connectionTimeoutMillis:2000});
      await assert.rejects(denied.connect(),e=>e.code==='28000');await denied.end();
      await admin.query('ALTER ROLE shadow9d_worker LOGIN');
      // NOLOGIN prevents new connections; already-open sessions require stop epoch/termination.
      await stop(true);assert.equal((await repo.complete(work,result)).completed,false);
    });
    await check('kill switch and commits serialize on database control lock',async()=>{
      await reset();await enqueue('stop-commit-race');let work=await repo.claimNext();
      await admin.query('BEGIN');
      await admin.query('UPDATE shadow9d.control SET stopped=true,epoch=epoch+1');
      const committing=repo.complete(work,result);
      await admin.query('COMMIT');
      assert.equal((await committing).completed,false);
      await reset();await enqueue('commit-stop-race');work=await repo.claimNext();
      await worker.query('BEGIN');
      assert.equal((await repo.complete(work,result)).completed,true);
      const stopping=stop(true);
      await worker.query('COMMIT');
      await stopping;
      assert.equal((await inspector.query('SELECT status FROM shadow9d.work WHERE id=$1',[work.id])).rows[0].status,'COMPLETED');
      assert.equal(await repo.claimNext(),null);
    });
    await check('targeted SQL mutations expose forbidden isolated behavior and originals are restored',async()=>{
      witness.sqlMutations=[];
      const mutations=[
        {name:'capture-stop',fn:'enqueue',from:'IF c.stopped THEN',to:'IF false THEN',prepare:async()=>{await reset();await stop(true)},probe:async()=>!!await enqueue('mutated-capture'),baseline:false},
        {name:'claim-stop',fn:'claim',from:'IF c.stopped THEN',to:'IF false THEN',prepare:async()=>{await reset();await enqueue('mutated-claim');await stop(true)},probe:async()=>!!await repo.claimNext(),baseline:false},
        {name:'privacy-bypass',fn:'enqueue',from:'IF NOT shadow9d.valid_snapshot(snapshot) THEN',to:'IF false THEN',prepare:reset,probe:async()=>{const e=fixture('mutated-privacy');e.snapshot.timeline[0].value={phone:'synthetic-private-field'};return !!await call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(e.snapshot),e.evidenceHash,e.originalCommitment])},baseline:false},
        {name:'epoch',fn:'complete',from:'w.epoch<>c.epoch OR',to:'',prepare:async()=>{await reset();await enqueue('mutated-epoch');mutationWork=await repo.claimNext();await stop(true);await stop(false)},probe:async()=>(await repo.complete(mutationWork,result)).completed,baseline:false},
        {name:'expired-lease',fn:'complete',from:'w.lease_until<=c.now_at OR',to:'',prepare:async()=>{await reset();await enqueue('mutated-expiry');mutationWork=await repo.claimNext();await advance(121)},probe:async()=>(await repo.complete(mutationWork,result)).completed,baseline:false},
        {name:'wrong-capability',fn:'complete',from:'w.lease_token IS DISTINCT FROM token OR',to:'',prepare:async()=>{await reset();await enqueue('mutated-capability');mutationWork=await repo.claimNext();mutationWork.claimedAt=randomUUID()},probe:async()=>(await repo.complete(mutationWork,result)).completed,baseline:false},
        {name:'quota',fn:'permit',from:'c.used_requests>=c.request_budget',to:'false',prepare:async()=>{await reset();await enqueue('mutated-quota');mutationWork=await repo.claimNext();await admin.query('UPDATE shadow9d.control SET request_budget=0')},probe:async()=>await repo.permit(mutationWork),baseline:false},
        {name:'calendar-validation',fn:'valid_instant',from:"AND pg_input_is_valid(v #>> '{}', 'timestamp with time zone')",to:'',prepare:reset,
          probe:async()=>{const e=fixture('mutated-calendar');e.snapshot.generatedAt='2026-02-30T16:00:00.000Z';return !!await call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(e.snapshot),e.evidenceHash,e.originalCommitment])},baseline:false},
        {name:'hour-24-normalization',fn:'valid_instant',from:'([01][0-9]|2[0-3])',to:'[0-9]{2}',prepare:reset,
          probe:async()=>{const e=fixture('mutated-hour');e.snapshot.generatedAt='2026-10-12T24:00:00.000Z';return !!await call(capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) AS value',[e.evidenceHash,JSON.stringify(e.snapshot),e.evidenceHash,e.originalCommitment])},baseline:false},
      ];
      let mutationWork;
      for(const mutation of mutations){
        const original=(await admin.query("SELECT pg_get_functiondef(p.oid) AS source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='shadow9d' AND p.proname=$1",[mutation.fn])).rows[0].source;
        assert.ok(original.includes(mutation.from));
        await mutation.prepare();assert.equal(await mutation.probe(),mutation.baseline,mutation.name+' original');
        await mutation.prepare();
        try {await admin.query(original.replace(mutation.from,mutation.to));assert.notEqual(await mutation.probe(),mutation.baseline,mutation.name+' mutant must be detected');witness.sqlMutations.push({name:mutation.name,status:'Killed',originalFunctionSha256:hash(original)})}
        finally {await admin.query(original)}
      }
      await reset();
    });
    await check('independent audit outage rolls back claim and preserves queue',async()=>{
      await reset();const id=await enqueue('audit-outage');
      const before=(await inspector.query('SELECT status,attempts FROM shadow9d.work WHERE id=$1',[id])).rows[0];
      await admin.query('REVOKE EXECUTE ON FUNCTION audit9d.append(text,bigint,jsonb) FROM shadow9d_owner');
      try {await assert.rejects(repo.claimNext(),e=>e.code==='42501')}
      finally {await admin.query('GRANT EXECUTE ON FUNCTION audit9d.append(text,bigint,jsonb) TO shadow9d_owner')}
      assert.deepEqual((await inspector.query('SELECT status,attempts FROM shadow9d.work WHERE id=$1',[id])).rows[0],before);
      await recorder.query("SELECT audit9d.append('AUDIT_OUTAGE_DENIED',NULL,'{}')");
      assert.equal((await repo.claimNext()).id,Number(id));
    });
    await check('actual frozen analyst and independent guard reject hostile minimized evidence',async()=>{
      await reset();await enqueue('attack');const work=await repo.claimNext();let calls=0;
      const analyst=createJevV5ResponsibilityAnalyst({client:{async systemOne(request){
        calls++;assert.equal(JSON.stringify(request.state).includes('refund'),false);
        const answers=Object.fromEntries(Object.keys(evidenceCriteriaV5Questions()).map(k=>[k,{choice:k==='responsibility'?'DRIVER_CAUSED':['evidenceSufficient','ordinaryDriverFailure'].includes(k)?'YES':'NO',confidence:1}]));
        return {model:'jev-1.13.0',answers,usage:{input_tokens:0,output_tokens:0}};
      }}});
      const adjudicator=createResponsibilityShadowAdjudicator({repository:repo,mode:'shadow',analyst:guardedOfflineAnalyst(repo,analyst,{current:work})});
      const outcome=await adjudicator.processWork(work);assert.equal(outcome.status,'COMPLETED');assert.equal(outcome.route,'NEEDS_ADMIN_REVIEW');assert.equal(calls,1);
    });
    assert.equal(witness.initialApplicationSnapshot,await applicationSnapshot(admin,witness.tables));
    witness.finalApplicationStateUnchanged=true;witness.status=witness.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';witness.noConsequenceAuthority=true;
  } finally {
    await writeFile(resolve(process.env.PHASE9D_OUTPUT,'isolation-'+Date.now()+'-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
    await Promise.allSettled(connections.map(c=>c.end()));
    await admin.end();await database.close();
  }
});
