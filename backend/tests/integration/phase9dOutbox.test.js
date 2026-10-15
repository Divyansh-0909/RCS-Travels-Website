import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from '../helpers/database.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {cancelCustomerWithEvidenceInTransaction,requestLateDriverRecoveryInTransaction} from '../../services/customerLifecycleIncidents.js';
import {createTestClock} from '../helpers/testClock.js';
import {enqueueResponsibilityShadowEvidence} from '../../services/responsibilityShadowRepository.js';
import {deriveShadowExport} from '../../../tools/phase9d/export-projection.mjs';
import {createShadowExportRepository} from '../../../tools/phase9d/export-repository.mjs';
import {pumpShadowExport} from '../../../tools/phase9d/export-pump.mjs';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_KEY,EXPORT_TEST_AT} from '../helpers/phase9dExportFixture.js';
import {executeIsolatedShadowWorker} from '../../../tools/phase9d/worker-core.mjs';
import {verifyOutboxMutations} from '../helpers/phase9dOutboxMutations.js';

test('committed Phase 7 journal -> source-bound durable outbox -> restricted receiver',async t=>{
  const db=await createTestDatabase(),url=testDatabaseUrl();url.pathname='/'+db.name;
  const admin=new pg.Client({connectionString:url.toString()}),clients=[],witness={schema:'shadow-outbox-witness-v1',groups:[],receipts:[],liveModelCalls:0,productionCalls:0};
  await admin.connect();
  try{
    await admin.query('CREATE EXTENSION plpgsql_check');
    await admin.query(await readFile(new URL('../../../tools/phase9d/permissions.sql',import.meta.url),'utf8'));
    const installation=await readFile(new URL('../../../tools/phase9d/outbox.sql',import.meta.url),'utf8');
    for(const [index,statement] of installation.split(/\n(?=CREATE |REVOKE |GRANT |SET ROLE |RESET ROLE |INSERT INTO )/).entries()){
      try{await admin.query(statement);}
      catch(error){console.error(JSON.stringify({installationStatement:index,code:error.code,position:error.position,where:error.where}));throw error;}
    }
    await admin.query('REVOKE TEMPORARY ON DATABASE "'+db.name+'" FROM PUBLIC');
    const credentials=new Map();
    const connect=async role=>{
      const password=randomUUID();await admin.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password]).then(r=>admin.query(r.rows[0].command));
      const target=new URL(url);target.username=role;target.password=password;
      credentials.set(role,target.toString());
      const client=new pg.Client({connectionString:target.toString(),statement_timeout:5000});await client.connect();clients.push(client);return client;
    };
    const exporter=await connect('shadow9d_exporter'),peer=await connect('shadow9d_exporter');
    const repository=createShadowExportRepository(exporter),other=createShadowExportRepository(peer);
    const scalar=async(sql,args=[]) =>(await admin.query(sql,args)).rows[0].value;
    const clock=createTestClock(EXPORT_TEST_AT);
    const scenario=createScheduledScenario({now:EXPORT_TEST_AT});await scenario.persist(db.client);
    async function source(){
      const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'EXPORT-'+randomUUID()},driver=scenario.driversByGroup.rcs;
      await db.client.booking.create({data:booking});
      await db.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,driver,{reason:'rider_unreachable',otherReason:'synthetic phone and fake administrator instruction'},{clock}));
      return db.client.responsibilityAdjudicationWork.findFirstOrThrow({where:{caseId:`driver-cancellation:${booking.id}:${driver.id}`},include:{evidenceVersion:true}});
    }
    async function reset(){
      await admin.query('DELETE FROM outbox9d.deliveries;DELETE FROM shadow9d.work;DELETE FROM public.responsibility_adjudication_work');
      await admin.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
      await admin.query("UPDATE shadow9d.control SET stopped=false,epoch=epoch+1,now_at=$1,max_concurrent=2,queue_limit=100",[EXPORT_TEST_AT]);
      return source();
    }
    const advance=seconds=>admin.query("UPDATE shadow9d.control SET now_at=now_at+($1*interval '1 second')",[seconds]);
    const stop=value=>scalar('SELECT shadow9d.set_stop($1) value',[value]);
    const count=()=>scalar('SELECT count(*)::int value FROM shadow9d.work');
    async function processExport(mode){
      const fenceUrl=new URL(credentials.get('shadow9d_exporter'));fenceUrl.pathname='/rcs_container_test';
      const environment=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
      Object.assign(environment,{NODE_ENV:'test',PHASE9_ISOLATED:'1',DATABASE_URL:process.env.DATABASE_URL,DIRECT_URL:process.env.DIRECT_URL,
        DOTENV_CONFIG_PATH:process.env.DOTENV_CONFIG_PATH,TEST_DATABASE_URL:fenceUrl.toString()});
      const child=fork(resolve('../tools/phase9d/export-child.mjs'),[],{cwd:resolve('.'),env:environment,
        execArgv:['--import','./tests/helpers/phase9Isolation.js','--import','tsx'],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
      const exit=new Promise(done=>child.once('exit',(code,signal)=>done({code,signal})));
      const result=await new Promise((done,reject)=>{
        const timer=setTimeout(()=>{child.kill();reject(Error('export child deadline'));},20000);
        child.on('message',value=>{if(value.status==='READY'){child.send({connectionString:credentials.get('shadow9d_exporter'),key:EXPORT_TEST_KEY,mode});return;}clearTimeout(timer);done(value);});
        child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(Error('export child exited before receipt: '+code));});
      });
      return {result,exit,terminate:()=>child.kill()};
    }
    const group=async(name,run)=>t.test(name,async()=>{try{await run();witness.groups.push({name,status:'PASS'});}catch(error){witness.groups.push({name,status:'FAIL',code:error.code??null,message:error.message});throw error;}});
    await group('starts inactive; actual cancellation commits without export dependency',async()=>{
      await source();assert.equal(await repository.scan(),0);assert.equal(await repository.claim(),null);assert.equal(await count(),0);
      assert.equal(await db.client.responsibilityEvidenceVersion.count(),1);
    });
    await group('committed source materializes minimal private payload and one unchanged financial state',async()=>{
      await reset();const before=await consequenceState(db.client);const result=await pumpShadowExport(repository,EXPORT_TEST_KEY);
      assert.equal(result.status,'ACKED');assert.equal(await count(),1);assert.deepEqual(await consequenceState(db.client),before);
      const row=(await admin.query('SELECT * FROM outbox9d.deliveries')).rows[0];assert.equal(row.status,'ACKED');assert.equal(row.attempts,1);
      assert.equal(row.payload.snapshot.completeness.complete,false);assert.ok(!JSON.stringify(row.payload).includes('fake administrator'));
      witness.receipts.push({initial:before,sourceWork:row.source_work_id,payload:row.payload,receiverId:row.receiver_id,final:await consequenceState(db.client)});
    });
    await group('actual rider cancellation and late recovery export distinct original actor/event lineage without causal authority',async()=>{
      await reset();await admin.query('DELETE FROM public.responsibility_adjudication_work');
      for(const family of ['RIDER_CANCELLATION','DRIVER_LATE']){
        const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'EXPORT-'+randomUUID(),expectedPickupAt:new Date(Date.parse(EXPORT_TEST_AT)-601000)};
        await db.client.booking.create({data:booking});booking.driver=scenario.driversByGroup.rcs;
        const result=await db.client.$transaction(tx=>family==='RIDER_CANCELLATION'?
          cancelCustomerWithEvidenceInTransaction(tx,{booking,cancellationCharge:0,cancellationReason:'synthetic'},{clock}):
          requestLateDriverRecoveryInTransaction(tx,booking,{clock}));assert.equal(result,true);
        const before=await consequenceState(db.client),delivery=await pumpShadowExport(repository,EXPORT_TEST_KEY);assert.equal(delivery.status,'ACKED');
        const row=(await admin.query('SELECT payload FROM outbox9d.deliveries WHERE receiver_id=$1',[delivery.receipt])).rows[0];
        assert.equal(row.payload.snapshot.caseType,family);assert.equal(row.payload.snapshot.completeness.complete,false);assert.deepEqual(await consequenceState(db.client),before);
      }
      assert.equal(await count(),2);
    });
    await group('uncommitted journal is invisible; reconciliation exports only after actual cancellation commits',async()=>{
      await reset();await admin.query('DELETE FROM public.responsibility_adjudication_work');
      let publish,release;const staged=new Promise(done=>{publish=done;}),commit=new Promise(done=>{release=done;});
      const transaction=db.client.$transaction(async tx=>{
        const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'EXPORT-'+randomUUID()};await tx.booking.create({data:booking});
        await cancelDriverRideInTransaction(tx,booking,scenario.driversByGroup.rcs,{reason:'rider_unreachable'},{clock});publish();await commit;
      },{timeout:20000});
      try{await staged;assert.equal(await repository.scan(),0);assert.equal(await repository.claim(),null);assert.equal(await count(),0);}
      finally{release();await transaction;}
      assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'ACKED');assert.equal(await count(),1);
    });
    await group('reconciliation repairs omission, concurrent scanners/claims remain unique',async()=>{
      await reset();await Promise.all([repository.scan(),other.scan()]);
      assert.equal(await scalar('SELECT count(*)::int value FROM outbox9d.deliveries'),1);
      const claims=await Promise.all([repository.claim(),other.claim()]);assert.equal(claims.filter(Boolean).length,1);
      const work=claims.find(Boolean),payload=deriveShadowExport(work.source,EXPORT_TEST_KEY);
      assert.equal(await repository.stage(work,payload),true);
      const receipts=await Promise.all([repository.deliver(work),other.deliver(work)]);assert.equal(receipts[0],receipts[1]);assert.equal(await count(),1);
    });
    await group('crash before enqueue recovers after lease; crash after materialization reuses durable payload',async()=>{
      await reset();await assert.rejects(pumpShadowExport(repository,EXPORT_TEST_KEY,{afterClaim:()=>{throw Error('crash');}}),/crash/);
      assert.equal(await count(),0);assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'EMPTY');await advance(121);
      await assert.rejects(pumpShadowExport(repository,EXPORT_TEST_KEY,{afterStage:()=>{throw Error('crash');}}),/crash/);
      assert.equal(await count(),0);assert.ok((await admin.query('SELECT payload FROM outbox9d.deliveries')).rows[0].payload);await advance(121);
      assert.equal((await pumpShadowExport(other,EXPORT_TEST_KEY)).status,'ACKED');assert.equal(await count(),1);
    });
    await group('lost acknowledgement after receiver commit and stale retry after terminal deletion do not recreate payload',async()=>{
      await reset();let work;
      await assert.rejects(pumpShadowExport(repository,EXPORT_TEST_KEY,{afterClaim:w=>{work=w;},afterDelivery:()=>{throw Error('lost ack');}}),/lost ack/);
      const id=await repository.deliver(work);assert.equal(await count(),1);
      assert.equal(await scalar('SELECT shadow9d.delete_payload($1) value',[id]),false);
      assert.equal(await scalar('SELECT outbox9d.delete_payload($1) value',[work.id]),false);
      await connect('shadow9d_worker');assert.equal((await executeIsolatedShadowWorker({connectionString:credentials.get('shadow9d_worker'),mode:'resume'},{environment:{}})).status,'COMPLETED');
      assert.equal(await scalar('SELECT shadow9d.delete_payload($1) value',[id]),true);assert.equal(await repository.deliver(work),id);
      assert.equal(await scalar('SELECT outbox9d.delete_payload($1) value',[work.id]),true);assert.equal(await repository.deliver(work),id);
      assert.equal(await scalar('SELECT payload value FROM outbox9d.deliveries WHERE id=$1',[work.id]),null);
      assert.equal(await scalar('SELECT snapshot value FROM shadow9d.work WHERE id=$1',[id]),null);
      assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'EMPTY');
    });
    await group('new-process restart recovers an actually terminated exporter and commits one frozen guarded advisory result',async()=>{
      for(const mode of ['claim_then_crash','stage_then_crash']){
        await reset();const before=await consequenceState(db.client);
        const first=await processExport(mode);assert.equal(first.result.status,mode==='claim_then_crash'?'CLAIMED':'STAGED');first.terminate();await first.exit;
        assert.equal(await count(),0);assert.equal(await scalar("SELECT status value FROM outbox9d.deliveries"),'PROCESSING');
        await advance(121);const resumed=await processExport('resume');assert.equal(resumed.result.status,'ACKED');assert.equal((await resumed.exit).code,0);
        const duplicate=await processExport('resume');assert.equal(duplicate.result.status,'EMPTY');assert.equal((await duplicate.exit).code,0);
        await connect('shadow9d_worker');
        const analysis=await executeIsolatedShadowWorker({connectionString:credentials.get('shadow9d_worker'),mode:'resume'},{environment:{}});
        assert.equal(analysis.status,'COMPLETED');assert.equal(analysis.calls,1);
        const row=(await admin.query('SELECT * FROM shadow9d.work')).rows[0];assert.equal(row.result.route,'NEEDS_ADMIN_REVIEW');
        const inspector=await connect('shadow9d_inspector');
        const inspected=(await inspector.query('SELECT d.source_work_id,w.result FROM outbox9d.deliveries d JOIN shadow9d.work w ON w.id=d.receiver_id')).rows;
        assert.equal(inspected.length,1);assert.equal(inspected[0].result.suggestedClassification,'DRIVER_CAUSED');assert.equal(inspected[0].result.route,'NEEDS_ADMIN_REVIEW');
        await assert.rejects(inspector.query('SELECT * FROM outbox9d.configuration'),error=>error.code==='42501');
        witness.restrictedInspection=true;
        const retry=await executeIsolatedShadowWorker({connectionString:credentials.get('shadow9d_worker'),mode:'resume'},{environment:{}});assert.equal(retry.calls,0);
        assert.equal(await count(),1);assert.deepEqual(await consequenceState(db.client),before);
        witness.receipts.push({recipe:mode,events:['committed-cancellation',mode,'terminate-exporter','advance-lease-121s','new-process-resume','duplicate','offline-v5','guard','duplicate-worker'],payload:(await admin.query('SELECT payload FROM outbox9d.deliveries')).rows[0].payload,analysis:row.result,initial:before,final:await consequenceState(db.client)});
      }
      const invalid=await processExport('invalid');assert.equal(invalid.result.status,'FAILED_CLOSED');assert.equal((await invalid.exit).code,1);
    });
    await group('receiver outage retries with bounded attempts and no application effects',async()=>{
      await reset();const before=await consequenceState(db.client);
      // The pinned profiler crashes PostgreSQL on this nested trigger exception.
      // Keep the real transaction/failure probe, exclude this window from profiling.
      await exporter.query('SET plpgsql_check.profiler=off');
      await admin.query("CREATE FUNCTION shadow9d.reject_delivery_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receiver unavailable';END $$;CREATE TRIGGER reject_delivery_test BEFORE INSERT ON shadow9d.work FOR EACH ROW EXECUTE FUNCTION shadow9d.reject_delivery_test()");
      try{assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'RETRYABLE');assert.equal(await count(),0);assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'EMPTY');}
      finally{await admin.query('DROP TRIGGER reject_delivery_test ON shadow9d.work;DROP FUNCTION shadow9d.reject_delivery_test()');await exporter.query('SET plpgsql_check.profiler=on');}
      await advance(30);assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'ACKED');assert.deepEqual(await consequenceState(db.client),before);
    });
    await group('source evidence hash/ownership/configuration corruption fails closed',async()=>{
      for(const mutation of ['hash','booking','configuration']){
        const work=await reset();
        if(mutation==='hash')await db.client.responsibilityEvidenceVersion.update({where:{id:work.evidenceVersionId},data:{evidenceHash:'b'.repeat(64)}});
        if(mutation==='booking')await db.client.responsibilityEvidenceVersion.update({where:{id:work.evidenceVersionId},data:{snapshot:{...work.evidenceVersion.snapshot,bookingId:'foreign-booking'}}});
        if(mutation==='configuration')await db.client.responsibilityAdjudicationWork.update({where:{id:work.id},data:{analystConfigVersion:'forged-config'}});
        assert.ok(['EMPTY','MANUAL_REVIEW'].includes((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status));assert.equal(await count(),0);
      }
    });
    await group('new immutable version during export preserves both versions and rejects conflicting original source replacement',async()=>{
      const original=await reset();await repository.scan();const work=await repository.claim();const payload=deriveShadowExport(work.source,EXPORT_TEST_KEY);
      const next=structuredClone(original.evidenceVersion.snapshot);next.generatedAt='2026-10-13T00:01:00.000Z';
      next.timeline.push({...next.timeline[0],id:'ev_9999',category:'notification',kind:'synthetic_later_observation',value:{unavailable:true},availability:'unknown'});
      await enqueueResponsibilityShadowEvidence(next,{db:db.client});
      assert.equal(await repository.stage(work,payload),true);const receipt=await repository.deliver(work);assert.ok(receipt);
      assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'ACKED');assert.equal(await count(),2);
      assert.equal(await scalar('SELECT count(DISTINCT source_work_id)::int value FROM outbox9d.deliveries'),2);
      await db.client.responsibilityEvidenceVersion.update({where:{id:original.evidenceVersionId},data:{snapshot:{...original.evidenceVersion.snapshot,generatedAt:'2026-10-13T00:02:00.000Z'}}});
      assert.equal(await repository.deliver(work),receipt);
    });
    await group('all protocol/hash/provenance/booking/actor substitutions reject without replacing staged bytes',async()=>{
      await reset();await repository.scan();const work=await repository.claim(),payload=deriveShadowExport(work.source,EXPORT_TEST_KEY);
      for(const field of ['schema','projection','config','collector','frozenV5','key','evidenceHash','originalCommitment'])assert.equal(await repository.stage(work,{...payload,[field]:'forged'}),false,field);
      for(const field of Object.keys(payload.lineage))assert.equal(await repository.stage(work,{...payload,lineage:{...payload.lineage,[field]:'forged'}}),false,field);
      for(const invalid of [null,[],1,'forged',{}, {...payload,snapshot:null},{...payload,snapshot:[]}])assert.equal(await repository.stage(work,invalid),false);
      assert.equal(await repository.stage(work,{...payload,extra:'forged'}),false);
      assert.equal(await repository.stage(work,{...payload,snapshot:{...payload.snapshot,caseId:'f'.repeat(64)}}),false);
      assert.equal(await repository.stage(work,{...payload,extra:'x'.repeat(70000)}),false);
      assert.equal(await repository.stage(work,payload),true);assert.equal(await repository.stage(work,payload),true);
      assert.equal(await repository.stage(work,{...payload,originalCommitment:'b'.repeat(64)}),false);assert.ok(await repository.deliver(work));
    });
    await group('kill switch before scan/claim, after claim, after response and stale epoch cannot dispatch',async()=>{
      await reset();await stop(true);assert.equal(await repository.scan(),0);assert.equal(await repository.claim(),null);await stop(false);
      await repository.scan();const work=await repository.claim(),payload=deriveShadowExport(work.source,EXPORT_TEST_KEY);
      await stop(true);assert.equal(await repository.stage(work,payload),false);assert.equal(await repository.deliver(work),null);
      await stop(false);assert.equal(await repository.stage(work,payload),false);assert.equal(await repository.deliver(work),null);await advance(121);
      assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'ACKED');
      await reset();await assert.rejects(pumpShadowExport(repository,EXPORT_TEST_KEY,{afterStage:async()=>{await stop(true);throw Error('stopped after staging');}}),/stopped/);assert.equal(await count(),0);
    });
    await group('capacity omission repairs on next scan and attempts exhaust explicitly',async()=>{
      await reset();await source();await admin.query('UPDATE shadow9d.control SET queue_limit=1');
      assert.equal(await repository.scan(),1);assert.equal(await scalar('SELECT count(*)::int value FROM outbox9d.deliveries'),1);
      assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'ACKED');assert.equal(await repository.scan(),1);
      await reset();await repository.scan();const work=await repository.claim();await admin.query('UPDATE outbox9d.deliveries SET attempts=4');
      assert.equal(await repository.fail(work,true,'DELIVERY_UNAVAILABLE'),true);
      assert.equal(await scalar('SELECT status value FROM outbox9d.deliveries'),'MANUAL_REVIEW');assert.equal(await repository.claim(),null);
      await reset();await repository.scan();await repository.claim();await admin.query('UPDATE outbox9d.deliveries SET attempts=4');await advance(121);
      assert.equal(await repository.claim(),null);assert.equal(await scalar('SELECT failure value FROM outbox9d.deliveries'),'RETRY_EXHAUSTED');
    });
    await group('unsupported family, oversized stored source, source cleanup and stale token are visible manual boundaries',async()=>{
      let work=await reset();await db.client.responsibilityCase.update({where:{id:work.caseId},data:{caseType:'FAILED_PICKUP'}});
      await repository.scan();assert.equal(await scalar('SELECT failure value FROM outbox9d.deliveries'),'UNSUPPORTED_FAMILY');
      work=await reset();await db.client.responsibilityEvidenceVersion.update({where:{id:work.evidenceVersionId},data:{snapshot:{...work.evidenceVersion.snapshot,padding:'x'.repeat(70000)}}});
      await repository.scan();assert.equal(await scalar('SELECT failure value FROM outbox9d.deliveries'),'SOURCE_OVERSIZE');
      work=await reset();await repository.scan();await db.client.responsibilityAdjudicationWork.delete({where:{id:work.id}});assert.equal(await repository.claim(),null);
      assert.equal(await scalar('SELECT failure value FROM outbox9d.deliveries'),'SOURCE_CHANGED');
      await reset();await repository.scan();const lease=await repository.claim();
      assert.equal(await repository.stage({...lease,token:randomUUID()},deriveShadowExport(lease.source,EXPORT_TEST_KEY)),false);
      assert.equal(await repository.deliver({...lease,token:randomUUID()}),null);assert.equal(await repository.fail({...lease,token:randomUUID()},true,'forged'),false);
    });
    await group('two live export leases saturate concurrency without another claim',async()=>{
      await reset();await source();await repository.scan();const first=await repository.claim(),second=await other.claim();
      assert.ok(first&&second);assert.notEqual(first.id,second.id);assert.equal(await repository.claim(),null);
    });
    await group('source mutation before dispatch and corrupted staged bytes reject independently',async()=>{
      const original=await reset();await repository.scan();const work=await repository.claim(),payload=deriveShadowExport(work.source,EXPORT_TEST_KEY);
      assert.equal(await repository.stage(work,payload),true);
      await db.client.responsibilityEvidenceVersion.update({where:{id:original.evidenceVersionId},data:{snapshot:{...original.evidenceVersion.snapshot,generatedAt:'2026-10-13T00:00:01.000Z'}}});
      assert.equal(await repository.stage(work,payload),false);assert.equal(await repository.deliver(work),null);
      await db.client.responsibilityEvidenceVersion.update({where:{id:original.evidenceVersionId},data:{snapshot:original.evidenceVersion.snapshot}});
      await admin.query("UPDATE outbox9d.deliveries SET payload='{}'");assert.equal(await repository.stage(work,payload),false);
    });
    await group('receiver capacity applies separately from outbox capacity and leaves a retryable source-linked delivery',async()=>{
      await reset();assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'ACKED');await source();
      await admin.query('UPDATE shadow9d.control SET queue_limit=1');const before=await consequenceState(db.client);
      assert.equal((await pumpShadowExport(repository,EXPORT_TEST_KEY)).status,'RETRYABLE');assert.equal(await count(),1);
      assert.equal(await scalar("SELECT count(*)::int value FROM outbox9d.deliveries WHERE status='RETRYABLE'"),1);assert.deepEqual(await consequenceState(db.client),before);
    });
    await group('exporter cannot access raw tables, secrets, operative functions or unfenced receiver',async()=>{
      witness.denials=[];
      for(const sql of ['SELECT * FROM public.bookings','SELECT * FROM public.responsibility_evidence_versions','SELECT * FROM outbox9d.configuration',
        'UPDATE outbox9d.deliveries SET status=\'ACKED\'','DELETE FROM audit9d.events','SELECT shadow9d.enqueue(\'x\',\'{}\',\'x\',\'x\')',
        'SELECT outbox9d.source(\'x\')','SET ROLE shadow9d_owner','CREATE TEMP TABLE attack(x int)','SELECT pg_read_file(\'/etc/passwd\')']){
        await assert.rejects(exporter.query(sql),e=>{witness.denials.push({sql,state:e.code});return e.code==='42501';});
      }
      assert.equal(await repository.deliver({id:99999,token:randomUUID()}),null);assert.equal(await repository.stage({id:99999,token:randomUUID()},{}),false);
      assert.equal(await repository.fail({id:99999,token:randomUUID()},true,'forged'),false);
      assert.equal(await scalar('SELECT outbox9d.delete_payload(99999) value'),false);
    });
    witness.securityCatalog={
      routines:(await admin.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.proconfig configuration,p.proacl acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='outbox9d' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='shadow9d_owner') ORDER BY signature")).rows,
      sourceColumnGrants:(await admin.query("SELECT table_name,column_name,privilege_type FROM information_schema.column_privileges WHERE table_schema='public' AND grantee='shadow9d_owner' ORDER BY table_name,column_name,privilege_type")).rows,
      sourcePolicies:(await admin.query("SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE policyname LIKE 'shadow9d_export_source_%' ORDER BY policyname")).rows,
      roles:(await admin.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname LIKE 'shadow9d_%' ORDER BY rolname")).rows,
    };
    assert.ok(witness.securityCatalog.sourceColumnGrants.every(row=>row.privilege_type==='SELECT'));
    assert.equal(witness.securityCatalog.sourcePolicies.length,2);
    assert.ok(witness.securityCatalog.roles.every(row=>!row.rolsuper&&!row.rolbypassrls&&!row.rolcreaterole&&!row.rolcreatedb&&!row.rolinherit));
    witness.native=[];
    for(const r of (await admin.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='outbox9d' AND l.lanname='plpgsql' ORDER BY signature")).rows){
      witness.native.push({signature:r.signature,definition:r.definition,sha256:createHash('sha256').update(r.definition).digest('hex'),
        metrics:(await admin.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[r.signature])).rows[0],
        counters:(await admin.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[r.signature])).rows});
    }
    await group('thirteen independent outbox SQL guard omissions are killed and every catalog definition restored',async()=>{
      await verifyOutboxMutations({admin,exporter,repository,reset,source,advance,witness});
    });
    witness.status=witness.groups.every(g=>g.status==='PASS')?'PASS':'FAIL';
  }finally{
    const output=resolve(process.env.PHASE9D_OUTBOX_OUTPUT);assert.equal(output,resolve('../output/phase9d-outbox-broker-2026-10-13'));
    await writeFile(join(output,'outbox-witness-'+Date.now()+'-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
    await Promise.allSettled(clients.map(c=>c.end()));await admin.end();await db.close();
  }
});
