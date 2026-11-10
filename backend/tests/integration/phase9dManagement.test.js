import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {managementFixture} from '../helpers/phase9dManagementFixture.js';
import {value,digest,selectResource,bindResource,capacityReport,acceptCapacityReport,CapacityCoordinator,quotaAttestation} from '../../../tools/phase9d/management-adapters.mjs';
import {RetentionCoordinator} from '../../../tools/phase9d/management-retention.mjs';
import {artifactUsage,ownedContainerStorage} from '../../../tools/phase9d/management-storage.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
const rows=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
test('owned capacity, real-schema metadata coordination and reconnectable recovery',async t=>{
  const f=await managementFixture(),w={schema:'phase9d-management-v1',groups:[],measurements:[],profiling:false,mutations:0,productionDeletion:false,liveCalls:0},extra=[];
  let success=false,request,evidence,retained,partialOperation;
  const nodes=f.installations,source=nodes[0],receiver=nodes[1],custodian=nodes[2];
  const connected=()=>nodes.map(i=>({node:i.node,client:i.roles.management_coordinator,holdClient:i.roles.management_hold}));
  const coordinator=()=>new RetentionCoordinator(receiver.roles.management_coordinator,connected(),receiver.roles.management_hold);
  const group=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();await f.unchanged();w.groups.push(name);}catch(e){failure=e;throw e;}});if(failure)throw failure;};
  const measure=async label=>{const r=await capacityReport(nodes);w.measurements.push({label,...r});return r;};
  const drain=async()=>{
    for(const s of [{schema:'custody_export',owner:f.b,sender:f.sender,verifier:f.verifier},...f.streams.map(s=>({...s,schema:'custody_lineage'}))]){
      for(const row of await rows(s.owner,'SELECT seq,hash FROM '+s.schema+".events WHERE status<>'ACKED' ORDER BY seq")){
        const frame=await value(s.sender,'SELECT '+s.schema+'.frame($1) value',[row.seq]);
        const body=await value(f.ingest,'SELECT custody.ingest($1) value',[frame]);
        const receipt=await durableReceipt(f.signer,body,new Map([[f.keyId,f.keys.privateKey]]));
        assert.equal(historicalVerification(receipt,frame.event,await f.registry()).signatureValid,true);
        assert.equal(await value(s.verifier,'SELECT '+s.schema+'.ack($1,$2,$3) value',[row.seq,row.hash,receipt]),true);
      }
    }
  };
  const reserve=(i,id,cost=1,kind='NORMAL')=>value(i.roles.management_admission,'SELECT capacity9d.reserve($1,$2,$3) value',[id,cost,kind]);
  const bind=async scope=>{for(const i of nodes)assert.equal(await bindResource(i.client,scope,await selectResource(i.client,i.node,evidence)),true);};
  const approve=async()=>{for(const i of nodes)await i.client.query("UPDATE retention9d.policies SET approved=true,enabled=true,approval_reference='SYNTHETIC_POLICY_1'");};
  const mature=async scope=>{for(const i of nodes)await i.client.query("UPDATE retention9d.resources SET observed_at=clock_timestamp()-interval '120 seconds' WHERE scope=$1",[scope]);};
  const holdApproval=async(scope,ref,release=false)=>{for(const i of nodes)await i.client.query('INSERT INTO retention9d.hold_approvals VALUES($1,$2,$3,true)',[ref,scope,release]);};
  const actual=async()=>({source:await rows(source.client,'SELECT id,status,source_binding,payload FROM outbox9d.deliveries ORDER BY id'),receiver:await rows(receiver.client,'SELECT id,status,cleaned,receipt,binding,payload FROM broker9d.requests ORDER BY id'),custodian:await rows(custodian.client,'SELECT source,seq,hash,event,receipt,key_id FROM custody.events ORDER BY custody_seq')});
  try{
    await group('disabled defaults, exact installed catalogs and restricted identities',async()=>{
      w.catalogs=[];
      for(const i of nodes){
        assert.notEqual(await value(i.client,"SELECT current_setting('plpgsql_check.profiler',true) value"),'on');
        assert.equal((await reserve(i,'inactive')).status,'DISABLED');
        assert.equal(await value(i.client,'SELECT production_execution value FROM retention9d.configuration'),false);
        w.catalogs.push({node:i.node,routines:await rows(i.client,"SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname IN('capacity9d','retention9d') ORDER BY 1,2")});
        await assert.rejects(i.roles.management_reader.query('UPDATE capacity9d.configuration SET enabled=true'),{code:'42501'});
        await assert.rejects(i.roles.management_coordinator.query("SELECT retention9d.hold('x',false,'x')"),{code:'42501'});
        await assert.rejects(i.roles.management_hold.query("SELECT retention9d.begin_delete($1,'x',1,'x')",[randomUUID()]),{code:'42501'});
        await assert.rejects(i.roles.management_coordinator.query('DELETE FROM retention9d.audit'),{code:'42501'});
      }
      assert.deepEqual(await quotaAttestation(null,{}),{verified:false,reason:'NO_INFRASTRUCTURE_ADAPTER'});
      await assert.rejects(quotaAttestation({inspect:async()=>({owner:'foreign'})},{owner:'ours',location:'owned'}),/INVALID_QUOTA_ATTESTATION/);
    });
    await group('real committed records independently signed with a fixed evidence scope',async()=>{
      // Reuse the established recovery fault recipe: COMMIT is durable while
      // simple-query completion is withheld by a SQL wait. An independent
      // observer terminates this owned backend; the client gets no success.
      const p=f.exec.connectionParameters,client=new pg.Client({...p,password:p.password});client.on('error',()=>{});await client.connect();extra.push(client);
      const pid=await value(client,'SELECT pg_backend_pid() value'),literal=await value(f.b,'SELECT quote_literal($1::text) value',[JSON.stringify(f.message(0))]);
      const pending=client.query('BEGIN; SELECT broker9d.register('+literal+'::jsonb); COMMIT; SELECT pg_sleep(30) /* management-lost-ack */').then(()=>{throw Error('EXPECTED_CONNECTION_INTERRUPTION');},e=>e.code);
      const deadline=Date.now()+5000;
      while(await value(f.b,'SELECT COALESCE((SELECT wait_event FROM pg_stat_activity WHERE pid=$1),\'\') value',[pid])!=='PgSleep'){assert.ok(Date.now()<deadline,'LOST_ACK_BARRIER_DEADLINE');await new Promise(ok=>setTimeout(ok,10));}
      const committed=await rows(f.b,'SELECT id FROM broker9d.requests');assert.equal(committed.length,1);
      assert.equal(await value(f.b,'SELECT pg_terminate_backend($1) value',[pid]),true);assert.equal(await pending,'57P01');
      request=await f.register(0);assert.equal(request,committed[0].id);
      w.lostAcknowledgement={method:'COMMIT_THEN_QUERY_COMPLETION_WAIT_AND_OWNED_BACKEND_TERMINATION',backendPid:pid,sqlstate:'57P01',request,requests:1,successReplyReceived:false};
      evidence=f.message(0).payload.evidenceHash;assert.ok(request);await drain();
      w.baseline=await actual();await measure('baseline');
      for(const i of nodes){await i.client.query('UPDATE capacity9d.configuration SET enabled=true');await value(i.roles.management_sensor,'SELECT capacity9d.observe() value');assert.equal((await reserve(i,'unknown-infrastructure')).status,'INFRASTRUCTURE_UNVERIFIED');}
      // Explicit measured-only mode; no quota is falsely attested for Docker's
      // shared backing disk. Hard-quota mode remains fail closed above.
      for(const i of nodes)await i.client.query('UPDATE capacity9d.configuration SET require_quota=false,external_complete=true');
    });
    await group('durable reservations, exact reuse, conflicts and operator signals',async()=>{
      for(const i of nodes){
        assert.equal((await reserve(i,'reservation',4096)).status,'RESERVED');
        assert.equal((await reserve(i,'reservation',4096)).status,'RESERVED');
        assert.equal((await reserve(i,'reservation',4097)).status,'CONFLICT');
        assert.equal(await value(i.roles.management_operator,"SELECT capacity9d.release('reservation') value"),true);
        assert.equal(await value(i.roles.management_operator,"SELECT capacity9d.release('reservation') value"),false);
        assert.equal(await value(i.roles.management_operator,"SELECT capacity9d.ack_signal('INFRASTRUCTURE_UNVERIFIED') value"),true);
        assert.equal((await rows(i.roles.management_reader,"SELECT ack_actor FROM capacity9d.signals WHERE reason='INFRASTRUCTURE_UNVERIFIED'"))[0].ack_actor,'management_operator');
      }
    });
    await group('global cluster accounting, fail-closed quota and partial reservation recovery',async()=>{
      const report=await measure('global-reservation');await acceptCapacityReport(receiver.client,report);
      await receiver.client.query('UPDATE capacity9d.global_configuration SET enabled=true');
      const all=nodes.map(i=>({node:i.node,client:i.roles.management_admission})),costs={source:1024,receiver:1024,custodian:1024};
      const cc=()=>new CapacityCoordinator(receiver.roles.management_admission,all);
      assert.equal((await cc().reserve('global-job',costs)).status,'GLOBAL_INFRASTRUCTURE_UNVERIFIED');
      await receiver.client.query('UPDATE capacity9d.global_configuration SET require_quota=false');
      all[2].client=null;assert.equal((await cc().reserve('global-job',costs)).status,'PARTIAL_RESERVATION');
      assert.equal(await value(receiver.client,"SELECT status value FROM capacity9d.global_reservations WHERE operation='global-job'"),'RESERVED');
      all[2].client=custodian.roles.management_admission;assert.equal((await cc().reserve('global-job',costs)).status,'RESERVED');
      assert.equal((await cc().reserve('global-job',costs)).status,'RESERVED');
      assert.equal((await cc().reserve('global-job',{...costs,source:2048})).status,'CONFLICT');
      await receiver.client.query('UPDATE capacity9d.global_configuration SET budget=(SELECT measured_bytes+1048576 FROM capacity9d.global_measurement)');
      assert.equal((await cc().reserve('too-large',costs)).status,'GLOBAL_CAPACITY_REFUSED');
      await receiver.client.query('UPDATE capacity9d.global_configuration SET budget=1073741824');
    });
    await group('bounded committed backlog, heap index TOAST and WAL growth observations',async()=>{
      for(const i of nodes){
        await i.client.query('CREATE TABLE capacity9d.probes(id int PRIMARY KEY,payload text)');
        for(let n=0;n<16;n++)await i.client.query('INSERT INTO capacity9d.probes VALUES($1,$2)',[n,randomBytes(12288).toString('hex')]);
      }
      for(const s of f.streams)for(let n=0;n<12;n++)await s.owner.query("SELECT audit9d.append('MANAGEMENT_BACKLOG',NULL,$1)",[{ordinal:n}]);
      const measured=await measure('backlog-and-toast');
      assert.equal(measured.physicalQuotaVerified,false);
      for(const r of measured.nodes){assert.ok(Number(r.measurement.toast_bytes)>0);assert.ok(Number(r.measurement.index_bytes)>0);assert.ok(Number(r.measurement.wal_generated)>0);}
      assert.equal(measured.nodes[1].measurement.wal_bytes,0);assert.equal(measured.nodes[0].cluster,measured.nodes[1].cluster);
      for(const i of nodes)assert.ok((await rows(i.client,"SELECT reason FROM capacity9d.signals WHERE reason='WAL_GROWTH'")).length);
      await source.client.query('UPDATE capacity9d.configuration SET max_pending=1');
      assert.equal((await reserve(source,'backlog-refused')).status,'BACKLOG_REFUSED');
      await source.client.query('UPDATE capacity9d.configuration SET max_pending=1000');
    });
    await group('actual admission trigger refuses new attempts and STOP preserves readable history',async()=>{
      await receiver.client.query('CREATE TRIGGER management_capacity_attempt BEFORE INSERT ON broker9d.attempts FOR EACH ROW EXECUTE FUNCTION capacity9d.admit()');
      const before=await rows(receiver.client,'SELECT id,status,receipt FROM broker9d.requests ORDER BY id');
      await receiver.client.query('UPDATE capacity9d.configuration SET budget=(SELECT measured_bytes+1048576 FROM capacity9d.measurement)');
      await assert.rejects(brokerCall(f.exec,'reserve',[request]),{code:'54000'});
      assert.deepEqual(await rows(receiver.client,'SELECT id,status,receipt FROM broker9d.requests ORDER BY id'),before);
      assert.equal((await reserve(receiver,'refused')).status,'CAPACITY_REFUSED');
      assert.equal((await reserve(receiver,'emergency-stop',1,'STOP')).status,'RESERVED');
      assert.equal((await f.control('STOP')).status,'APPLIED');
      assert.equal(await value(receiver.client,'SELECT stopped value FROM broker9d.control'),true);
      assert.ok((await rows(receiver.client,'SELECT seq,hash FROM custody_export.events')).length);
      await receiver.client.query('UPDATE capacity9d.configuration SET budget=1073741824');
    });
    await group('independent signed drain and restored measured admission without history deletion',async()=>{
      await drain();assert.equal((await f.control('RESUME')).status,'APPLIED');request=await f.register(1);
      await measure('signed-drain');const attempt=await brokerCall(f.exec,'reserve',[request]);assert.ok(attempt);
      assert.equal(await value(receiver.client,"SELECT status='RESERVED' value FROM broker9d.attempts WHERE id=$1",[attempt.attemptId??attempt.id]),true);
      w.reservation=attempt;
      // Close only the unsent attempt through the existing expiry path.
      await f.advance(121);assert.equal(await brokerCall(f.exec,'recover',[attempt.attemptId??attempt.id]),true);
    });
    await group('stale measurement, external growth and bounded ledger refusal',async()=>{
      const logMeasurements=[process.env.CUSTODY_SOURCE_CONTAINER,process.env.CUSTODY_AUDIT_CONTAINER].map(id=>ownedContainerStorage(id,process.env.CUSTODY_OWNERSHIP_LABEL));
      const artifacts=await artifactUsage(process.env.CUSTODY_OUTPUT);assert.ok(artifacts.files>0);w.externalMeasurements={containers:logMeasurements,artifacts};
      for(const i of nodes){
        await i.client.query("UPDATE capacity9d.measurement SET at=clock_timestamp()-interval '301 seconds'");assert.equal((await reserve(i,'stale')).status,'STALE_MEASUREMENT');
        const external=i.node==='receiver'?0:logMeasurements[i.node==='source'?0:1].sanitizedLogDirectoryBytes+(i.node==='source'?artifacts.bytes:0);
        await i.client.query('UPDATE capacity9d.configuration SET external_bytes=$1',[external]);await value(i.roles.management_sensor,'SELECT capacity9d.observe() value');
        if(external>0)
        assert.ok((await rows(i.roles.management_reader,"SELECT reason FROM capacity9d.signals WHERE reason='EXTERNAL_GROWTH'")).length);
        await i.client.query('UPDATE capacity9d.configuration SET max_operations=1');assert.equal((await reserve(i,'ledger-full')).status,'LEDGER_LIMIT');
        await i.client.query('UPDATE capacity9d.configuration SET max_operations=1000');
      }
      w.externalBoundary='Owned log-directory allocations and artifact logical sizes are measured; provider logs, backups, VHD overhead and other PGDATA bytes remain outside this catalog-plus-external total';
    });
    await group('existing terminal cleanup repeats without work recreation or accounting erasure',async()=>{
      for(const action of ['TERMINATE','CLEAN','CLEAN']){
        const revision=await value(f.b,'SELECT revision value FROM broker9d.requests WHERE id=$1',[request]);
        assert.equal((await brokerCall(f.ops,'operate',[randomUUID(),request,action,revision,action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER'])).status,'APPLIED');
      }
      await drain();assert.equal(await value(f.b,'SELECT cleaned value FROM broker9d.requests WHERE id=$1',[request]),true);
      assert.equal(await f.register(1),request);await measure('repeated-cleanup');
      retained=await actual();w.retainedActualSha256=digest(retained);
    });
    await group('real-schema metadata selection, disabled policy and active/unexpired eligibility',async()=>{
      await bind('eligibility');
      assert.equal((await coordinator().run({operation:randomUUID(),scope:'eligibility',version:1,approval:'SYNTHETIC_POLICY_1'})).status,'POLICY_DISABLED');
      await approve();const op=randomUUID();
      assert.equal((await coordinator().run({operation:op,scope:'eligibility',version:1,approval:'SYNTHETIC_POLICY_1'})).reason,'NOT_EXPIRED');
      await mature('eligibility');
      // Receiver's first registered request remains active; adapter correctly
      // refuses it even though the source is transport ACKED.
      assert.equal((await coordinator().run({operation:op,scope:'eligibility',version:1,approval:'SYNTHETIC_POLICY_1'})).reason,'ACTIVE');
      for(const action of ['TERMINATE','CLEAN']){const revision=await value(f.b,'SELECT revision value FROM broker9d.requests WHERE id=$1',[await f.register(0)]);assert.equal((await brokerCall(f.ops,'operate',[randomUUID(),await f.register(0),action,revision,action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER'])).status,'APPLIED');}
      await drain();retained=await actual();
    });
    await group('closed receipt identity and independent missing-node completion refusal',async()=>{
      await bind('receipt-contract');await mature('receipt-contract');
      const op=randomUUID(),c=receiver.roles.management_coordinator;
      const start=await value(c,'SELECT retention9d.begin_delete($1,$2,1,$3) value',[op,'receipt-contract','SYNTHETIC_POLICY_1']);
      const r=await value(source.roles.management_coordinator,'SELECT retention9d.local_prepare($1,$2,$3,1,$4) value',[op,'receipt-contract',start.epoch,'SYNTHETIC_POLICY_1']);assert.equal(r.status,'PREPARED');
      for(const bad of [null,[],1,{...r,extra:'x'},{...r,epoch:1},{...r,scope:'foreign'},{...r,operation:randomUUID()},Object.fromEntries(Object.entries(r).filter(([k])=>k!=='commitment'))])assert.equal(await value(c,'SELECT retention9d.ack_prepare($1,$2,$3) value',[op,'source',bad]),false);
      assert.equal(await value(c,'SELECT retention9d.ack_prepare($1,$2,$3) value',[op,'source',r]),true);
      assert.equal(await value(c,'SELECT retention9d.ack_prepare($1,$2,$3) value',[op,'source',r]),true);
      assert.equal((await value(c,'SELECT retention9d.authorize($1) value',[op])).status,'PENDING_ACKS');
    });
    await group('hold-before-decision fencing with durable partial propagation and release approval',async()=>{
      await bind('held');await mature('held');const op=randomUUID();
      assert.equal((await coordinator().run({operation:op,scope:'held',version:1,approval:'SYNTHETIC_POLICY_1',stopAfter:'source'})).status,'PARTIAL_PREPARE');
      assert.equal((await coordinator().hold('held',false,'unapproved')).status,'APPROVAL_REQUIRED');
      await holdApproval('held','hold-1');const incomplete=connected();incomplete[2].holdClient=null;
      assert.equal((await new RetentionCoordinator(receiver.roles.management_coordinator,incomplete,receiver.roles.management_hold).hold('held',false,'hold-1')).status,'PARTIAL_HOLD');
      assert.equal(await value(receiver.client,"SELECT count(*)::int value FROM retention9d.hold_targets WHERE reference='hold-1' AND status='PENDING'"),1);
      assert.equal((await coordinator().hold('held',false,'hold-1')).status,'HELD');
      assert.equal((await coordinator().run({operation:op,scope:'held',version:1,approval:'SYNTHETIC_POLICY_1'})).status,'HELD');
      await holdApproval('held','release-1',true);assert.equal((await coordinator().hold('held',true,'release-1')).status,'RELEASED');
      assert.equal((await coordinator().run({operation:randomUUID(),scope:'held',version:1,approval:'SYNTHETIC_POLICY_1'})).status,'COMPLETE');
    });
    await group('durable partial commit, lost-response idempotency and immutable application records',async()=>{
      await bind('restart-operation');await mature('restart-operation');partialOperation=randomUUID();
      const result=await coordinator().run({operation:partialOperation,scope:'restart-operation',version:1,approval:'SYNTHETIC_POLICY_1',stopAfter:'commit:source'});
      assert.equal(result.status,'PARTIAL_COMMIT');
      assert.equal(await value(receiver.client,'SELECT state value FROM retention9d.operations WHERE id=$1',[partialOperation]),'COMMITTING');
      assert.equal((await coordinator().run({operation:partialOperation,scope:'foreign',version:1,approval:'SYNTHETIC_POLICY_1'})).status,'INVALID');
      await holdApproval('restart-operation','late-hold');assert.equal((await coordinator().hold('restart-operation',false,'late-hold')).status,'LATE_HOLD_CONFLICT');
      for(const i of nodes)assert.equal((await value(i.roles.management_coordinator,'SELECT retention9d.local_commit($1,$2,1,1,true) value',[partialOperation,'restart-operation'])).status,'PRODUCTION_DELETION_DISABLED');
      assert.deepEqual(await actual(),retained);
    });
    await group('synthetic stale snapshot quarantined by authoritative tombstones',async()=>{
      assert.equal((await coordinator().restoreDecision('restart-operation')).status,'QUARANTINE');
      assert.equal(await value(source.roles.management_coordinator,"SELECT retention9d.restore_allowed('restart-operation') value"),false);
      const stale=await selectResource(source.client,'source',evidence);assert.equal(await bindResource(source.client,'restart-operation',stale),true);
      assert.equal(await value(source.client,"SELECT tombstone value FROM retention9d.resources WHERE scope='restart-operation'"),true);
      w.restore={syntheticStaleMetadata:'QUARANTINED',providerSnapshotRestore:'NOT_RUN',actualPayloadDeletion:false};
    });
    await group('bounded scratch cleanup VACUUM and physical reconciliation',async()=>{
      for(const i of nodes){await i.client.query('DELETE FROM capacity9d.probes');await i.client.query('VACUUM (ANALYZE) capacity9d.probes');await i.client.query('CHECKPOINT');}
      await measure('vacuum-checkpoint');
      w.physicalBoundary='Logical release and VACUUM do not imply physical shrinkage, old WAL erasure or backup deletion';
    });
    await group('owned source/receiver graceful restart closes hidden admin lifecycle and rediscovers endpoint',async()=>{
      const id=process.env.CUSTODY_SOURCE_CONTAINER;assert.match(id,/^[a-f0-9]{64}$/);
      const inspect=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',windowsHide:true}))[0];
      assert.equal(inspect.Config.Labels['proofloop.owner'],process.env.CUSTODY_OWNERSHIP_LABEL);assert.equal(inspect.HostConfig.Memory,805306368);
      const starts=await Promise.all(nodes.map(i=>value(i.client,'SELECT pg_postmaster_start_time() value')));
      const before=await actual(),ledgers=await Promise.all(nodes.map(i=>rows(i.client,'SELECT * FROM retention9d.operations ORDER BY id'))),parameters=nodes.map(i=>i.client.connectionParameters);
      const roleParameters=nodes.map(i=>Object.fromEntries(Object.entries(i.roles).map(([n,c])=>[n,c.connectionParameters]))),execParameters=f.exec.connectionParameters;
      await assert.rejects(f.source.resumeAfterRestart(1),/not prepared/);await f.suspendOwnedConnectionsForRestart();
      assert.throws(()=>f.source.connect(),/suspended/);await assert.rejects(f.source.resumeAfterRestart(0),/Invalid owned restart port/);
      for(const client of [...f.managementClients,f.sender,f.verifier,f.operator,f.sourceInspector,...f.streams.flatMap(s=>[s.sender,s.verifier,s.inspector])])await client.end();
      execFileSync('docker',['restart','--time','10',id],{timeout:40000,windowsHide:true});
      const after=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',windowsHide:true}))[0],port=Number(after.NetworkSettings.Ports['5432/tcp'].find(p=>p.HostIp==='0.0.0.0').HostPort);
      const connect=async p=>{for(let n=0;n<20;n++){const c=new pg.Client({...p,password:p.password,port,connectionTimeoutMillis:2000});try{await c.connect();extra.push(c);return c;}catch(e){await c.end();if(n===19)throw e;await new Promise(ok=>setTimeout(ok,250));}}throw Error('RECONNECT_FAILED');};
      await f.source.resumeAfterRestart(port);await f.receiver.resumeAfterRestart(port);
      for(let n=0;n<2;n++){nodes[n].client=await connect(parameters[n]);for(const [name,p]of Object.entries(roleParameters[n]))nodes[n].roles[name]=await connect(p);}
      // Custodian management clients were explicitly ended but its server and
      // owner connection were not restarted. Reconnect to its original port.
      for(const [name,p]of Object.entries(roleParameters[2])){const c=new pg.Client({...p,password:p.password});await c.connect();extra.push(c);custodian.roles[name]=c;}
      assert.deepEqual(await actual(),before);for(let n=0;n<3;n++)assert.deepEqual(await rows(nodes[n].client,'SELECT * FROM retention9d.operations ORDER BY id'),ledgers[n]);
      const later=await Promise.all(nodes.map(i=>value(i.client,'SELECT pg_postmaster_start_time() value')));
      assert.notEqual(starts[0].toISOString(),later[0].toISOString());assert.notEqual(starts[1].toISOString(),later[1].toISOString());assert.equal(starts[2].toISOString(),later[2].toISOString());
      const newExec=await connect(execParameters);assert.equal(await brokerCall(newExec,'register',[JSON.stringify(f.message(1))]),request);
      assert.equal(await brokerCall(newExec,'register',[JSON.stringify(f.message(0))]),w.lostAcknowledgement.request);
      w.restart={type:'GRACEFUL_SOURCE_RECEIVER_SHARED_CLUSTER',oldPort:parameters[0].port,newPort:port,before:starts,after:later,request,rowsSha256:digest(before),hiddenAdminClosed:true,custodianRestarted:false};
      await measure('after-source-receiver-restart');
    });
    await group('post-restart partial deletion simulation reconciliation never recreates work',async()=>{
      assert.equal((await coordinator().run({operation:partialOperation,scope:'restart-operation',version:1,approval:'SYNTHETIC_POLICY_1'})).status,'COMPLETE');
      assert.equal((await coordinator().run({operation:partialOperation,scope:'restart-operation',version:1,approval:'SYNTHETIC_POLICY_1'})).status,'COMPLETE');
      assert.deepEqual(await actual(),retained);
      w.operations=await rows(receiver.client,'SELECT id,scope,epoch,state,actor,approval_reference FROM retention9d.operations ORDER BY id');
      w.audit=await Promise.all(nodes.map(async i=>({node:i.node,rows:await rows(i.roles.management_reader,'SELECT operation,scope,actor,action,result FROM retention9d.audit ORDER BY id')})));
      assert.ok(w.audit.some(i=>i.rows.some(r=>r.actor==='management_hold')));assert.ok(w.audit.some(i=>i.rows.some(r=>r.actor==='management_coordinator')));
      w.status='PASS';
    });
    success=true;
  }finally{
    w.status??='FAILED';await writeFile(join(process.env.CUSTODY_OUTPUT,'management-'+(success?'witness-':'failed-')+randomUUID()+'.json'),JSON.stringify(w,null,2),{flag:'wx'});
    await Promise.allSettled(extra.map(c=>c.end()));await f.close();
  }
});
