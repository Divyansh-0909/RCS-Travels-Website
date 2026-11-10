import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {managementFixture} from '../helpers/phase9dManagementFixture.js';
import {installManagementRemaining,bindGuardedResource} from '../../../tools/phase9d/management-remaining.mjs';
import {value,capacityReport,digest} from '../../../tools/phase9d/management-adapters.mjs';
import {RetentionCoordinator} from '../../../tools/phase9d/management-retention.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
import {ownedContainerStorage,artifactUsage} from '../../../tools/phase9d/management-storage.mjs';

test('remaining isolated storage observations and actual-row hold fences',async t=>{
  const f=await managementFixture(),nodes=f.installations,[source,receiver,custodian]=nodes;
  const witness={schema:'phase9d-management-remaining-v1',groups:[],measurements:[],profiling:false,mutations:0,productionDeletion:false};
  const reconnectClients=[];
  const rows=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
  const members=()=>nodes.map(i=>({node:i.node,client:i.roles.management_coordinator,holdClient:i.roles.management_hold}));
  const coordinator=()=>new RetentionCoordinator(receiver.roles.management_coordinator,members(),receiver.roles.management_hold);
  const scope='actual-retained-synthetic-case';
  let request,evidence,originalSourcePayload,baselineAccounting,success=false;
  const operate=async action=>{
    const revision=await value(receiver.client,'SELECT revision value FROM broker9d.requests WHERE id=$1',[request]);
    return brokerCall(f.ops,'operate',[randomUUID(),request,action,revision,action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER']);
  };
  const group=async(name,fn)=>{
    let failed;
    await t.test(name,async()=>{try{await fn();await f.unchanged();witness.groups.push(name);}catch(e){failed=e;throw e;}});
    if(failed)throw failed;
  };
  const drain=async()=>{
    for(const stream of [{schema:'custody_export',owner:f.b,sender:f.sender,verifier:f.verifier},...f.streams.map(s=>({...s,schema:'custody_lineage'}))]){
      for(const row of await rows(stream.owner,'SELECT seq,hash FROM '+stream.schema+".events WHERE status<>'ACKED' ORDER BY seq")){
        const frame=await value(stream.sender,'SELECT '+stream.schema+'.frame($1) value',[row.seq]);
        const body=await value(f.ingest,'SELECT custody.ingest($1) value',[frame]);
        const receipt=await durableReceipt(f.signer,body,new Map([[f.keyId,f.keys.privateKey]]));
        assert.equal(historicalVerification(receipt,frame.event,await f.registry()).signatureValid,true);
        assert.equal(await value(stream.verifier,'SELECT '+stream.schema+'.ack($1,$2,$3) value',[row.seq,row.hash,receipt]),true);
      }
    }
  };
  const approveHold=async(reference,release)=>{
    for(const i of nodes)await i.client.query('INSERT INTO retention9d.hold_approvals VALUES($1,$2,$3,true)',[reference,scope,release]);
  };
  const observe=async label=>{
    const reconciliations=[];
    for(const i of nodes)reconciliations.push({node:i.node,...await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value')});
    witness.measurements.push({label,reconciliations,physical:await capacityReport(nodes)});
    return reconciliations;
  };
  try{
    await installManagementRemaining(nodes);
    await group('disabled defaults, restricted metadata and exact installed definitions',async()=>{
      witness.catalogs=[];
      for(const i of nodes){
        assert.notEqual(await value(i.client,"SELECT current_setting('plpgsql_check.profiler',true) value"),'on');
        assert.equal((await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value')).state,'DISABLED');
        assert.equal(await value(i.client,'SELECT production_execution value FROM retention9d.configuration'),false);
        await assert.rejects(i.roles.management_admission.query("SELECT capacity9d.record_external('x',0)"),{code:'42501'});
        await assert.rejects(i.roles.management_hold.query('DELETE FROM retention9d.guarded_rows'),{code:'42501'});
        witness.catalogs.push({node:i.node,definitions:await rows(i.client,"SELECT n.nspname,p.proname,p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname IN('capacity9d','retention9d') ORDER BY 1,2")});
      }
    });
    await group('original synthetic source receiver and signed custody identities are bound',async()=>{
      request=await f.register(0);evidence=f.message(0).payload.evidenceHash;
      assert.equal((await operate('TERMINATE')).status,'APPLIED');await drain();
      for(const i of nodes)assert.equal((await bindGuardedResource(i.client,i.node,scope,evidence)).terminal,true);
      originalSourcePayload=await value(source.client,'SELECT payload value FROM outbox9d.deliveries WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope]);
      baselineAccounting=await brokerCall(f.ops,'accounting',[]);
      witness.bindings=await Promise.all(nodes.map(async i=>({node:i.node,rows:await rows(i.client,'SELECT scope,relation_name,identity FROM retention9d.guarded_rows')})));
    });
    await group('missing external inventory and unknown physical quota fail closed',async()=>{
      for(const i of nodes){
        await i.client.query('UPDATE capacity9d.configuration SET enabled=true');
        assert.equal((await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value')).state,'UNKNOWN');
        await i.client.query("INSERT INTO capacity9d.external_sources VALUES('owned-logs','LOG','OWNED_FIXTURE_LOGS',true,300,NULL,NULL,'DECLARED_NON_OVERLAPPING_BYTES_NOT_GLOBAL_QUOTA')");
        assert.equal(await value(i.roles.management_sensor,"SELECT capacity9d.record_external('unknown',0) value"),false);
      }
      assert.ok((await observe('missing-inventory')).every(r=>r.state==='UNKNOWN'));
    });
    await group('bounded log artifact and synthetic-backup observations preserve coverage boundaries',async()=>{
      const logs=[process.env.CUSTODY_SOURCE_CONTAINER,process.env.CUSTODY_AUDIT_CONTAINER].map(id=>ownedContainerStorage(id,process.env.CUSTODY_OWNERSHIP_LABEL));
      const artifacts=await artifactUsage(process.env.CUSTODY_OUTPUT);
      for(const i of nodes){
        await i.client.query('UPDATE capacity9d.configuration SET require_quota=false');
        await value(i.roles.management_sensor,"SELECT capacity9d.record_external('owned-logs',$1) value",[i.node==='receiver'?0:logs[i.node==='source'?0:1].sanitizedLogDirectoryBytes]);
        if(i.node==='source'){
          await i.client.query("INSERT INTO capacity9d.external_sources VALUES('owned-artifacts','ARTIFACT','OWNED_OUTPUT_DIRECTORY',true,300,NULL,NULL,'DECLARED_NON_OVERLAPPING_BYTES_NOT_GLOBAL_QUOTA')");
          await value(i.roles.management_sensor,"SELECT capacity9d.record_external('owned-artifacts',$1) value",[artifacts.bytes]);
        }
      }
      assert.ok((await observe('declared-owned-external')).every(r=>r.state==='NORMAL'));
      await source.client.query("INSERT INTO capacity9d.external_sources VALUES('provider-backups','BACKUP','PROVIDER_TBD',true,300,NULL,NULL,'DECLARED_NON_OVERLAPPING_BYTES_NOT_GLOBAL_QUOTA')");
      assert.equal((await value(source.roles.management_sensor,'SELECT capacity9d.reconcile() value')).state,'UNKNOWN');
      // Restore the explicitly limited fixture inventory, never attest a provider backup.
      await source.client.query("DELETE FROM capacity9d.external_sources WHERE name='provider-backups'");
      witness.external={logs,artifacts,providerBackupMeasurement:'UNAVAILABLE_NOT_ATTESTED',mode:'MEASURED_ONLY_NOT_PHYSICAL_QUOTA'};
    });
    await group('warning critical stale inventory and reservation reconciliation are durable',async()=>{
      for(const i of nodes){
        await i.client.query('UPDATE capacity9d.observation_policy SET warning_bytes=1');
        assert.equal((await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value')).state,'WARNING');
        await i.client.query('UPDATE capacity9d.observation_policy SET critical_bytes=2');
        assert.equal((await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value')).state,'CRITICAL');
        await i.client.query('UPDATE capacity9d.observation_policy SET warning_bytes=536870912,critical_bytes=805306368');
        await i.client.query("UPDATE capacity9d.external_sources SET observed_at=clock_timestamp()-interval '301 seconds'");
        assert.equal((await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value')).state,'UNKNOWN');
        await i.client.query('UPDATE capacity9d.external_sources SET observed_at=clock_timestamp()');
        await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value');
        assert.equal((await value(i.roles.management_admission,"SELECT capacity9d.reserve('retained-hold',4096,'NORMAL') value")).status,'RESERVED');
        const result=await value(i.roles.management_sensor,'SELECT capacity9d.reconcile() value');
        assert.equal(Number(result.reserved_bytes),4096);assert.equal(BigInt(result.conservative_bytes),BigInt(result.measured_bytes)+4096n);
        assert.equal(await value(i.client,"SELECT status value FROM capacity9d.reservations WHERE operation='retained-hold'"),'RESERVED');
      }
      await observe('conservative-reservations-no-automatic-release');
    });
    await group('real admission refusal preserves STOP and committed request history',async()=>{
      await receiver.client.query('CREATE TRIGGER remaining_capacity_attempt BEFORE INSERT ON broker9d.attempts FOR EACH ROW EXECUTE FUNCTION capacity9d.admit_observed()');
      const active=await f.register(1),before=await rows(receiver.client,'SELECT id,status,binding FROM broker9d.requests ORDER BY id');
      await receiver.client.query("UPDATE capacity9d.external_sources SET observed_at=clock_timestamp()-interval '301 seconds'");
      await assert.rejects(brokerCall(f.exec,'reserve',[active]),{code:'54000'});
      assert.deepEqual(await rows(receiver.client,'SELECT id,status,binding FROM broker9d.requests ORDER BY id'),before);
      assert.equal((await f.control('STOP')).status,'APPLIED');
      await value(receiver.roles.management_sensor,'SELECT capacity9d.reconcile() value');
      assert.equal(await value(receiver.client,"SELECT severity value FROM capacity9d.signals WHERE reason='RECONCILIATION_UNKNOWN'"),'CRITICAL');
      await receiver.client.query('DROP TRIGGER remaining_capacity_attempt ON broker9d.attempts');
    });
    await group('PostgreSQL temporary-file limit refuses bounded work without losing committed rows',async()=>{
      const before=await rows(receiver.client,'SELECT id,status,binding FROM broker9d.requests ORDER BY id');
      try{
        await receiver.client.query("SET work_mem='64kB';SET temp_file_limit='256kB'");
        await assert.rejects(receiver.client.query("SELECT length(string_agg(repeat(md5(n::text),4),'' ORDER BY random())) FROM generate_series(1,20000) n"),{code:'53400'});
      }finally{await receiver.client.query('RESET work_mem;RESET temp_file_limit');}
      assert.deepEqual(await rows(receiver.client,'SELECT id,status,binding FROM broker9d.requests ORDER BY id'),before);
      await observe('after-bounded-temp-refusal');
    });
    await group('owned scratch tmpfs has a finite verified quota and bounded recovery',async()=>{
      const id=process.env.CUSTODY_SOURCE_CONTAINER,owner=process.env.CUSTODY_OWNERSHIP_LABEL;
      const command=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:10000});
      const inspected=JSON.parse(command(['inspect',id]))[0];
      assert.equal(inspected.Config.Labels['proofloop.owner'],owner);assert.equal(inspected.HostConfig.Memory,805306368);
      assert.equal(inspected.HostConfig.NanoCpus,750000000);assert.match(inspected.HostConfig.Tmpfs['/tmp/proofloop-capacity'],/size=8388608/);
      const before=command(['exec',id,'df','-B1','/tmp/proofloop-capacity']);
      assert.equal(Number(before.trim().split('\n').at(-1).trim().split(/\s+/)[1]),8388608);
      command(['exec',id,'sh','-c','dd if=/dev/zero of=/tmp/proofloop-capacity/probe bs=1048576 count=4 status=none']);
      const occupied=command(['exec',id,'df','-B1','/tmp/proofloop-capacity']);
      command(['exec',id,'truncate','-s','0','/tmp/proofloop-capacity/probe']);
      const after=command(['exec',id,'df','-B1','/tmp/proofloop-capacity']);
      const used=s=>Number(s.trim().split('\n').at(-1).trim().split(/\s+/)[2]);
      assert.ok(used(occupied)-used(before)>=4194304);assert.equal(used(after),used(before));
      witness.scratch={limitBytes:8388608,writtenBytes:4194304,before,occupied,after,postgresDataQuotaVerified:false,hostDiskExhausted:false};
    });
    await group('distributed hold acknowledgements fence actual cleanup and preserve commitments',async()=>{
      baselineAccounting=await brokerCall(f.ops,'accounting',[]);
      await approveHold('hold-actual',false);
      const unavailable=members();unavailable[2].holdClient=null;
      assert.equal((await new RetentionCoordinator(receiver.roles.management_coordinator,unavailable,receiver.roles.management_hold).hold(scope,false,'hold-actual')).status,'PARTIAL_HOLD');
      assert.equal((await coordinator().hold(scope,false,'hold-actual')).status,'HELD');
      await assert.rejects(operate('CLEAN'),{code:'55000'});
      await assert.rejects(source.client.query('UPDATE outbox9d.deliveries SET payload=NULL WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope]),{code:'55000'});
      await assert.rejects(custodian.client.query("UPDATE custody.events SET event=event||'{\"heldProbe\":true}'::jsonb WHERE receipt=(SELECT identity::uuid FROM retention9d.resources WHERE scope=$1)",[scope]),{code:'55000'});
      assert.deepEqual(await brokerCall(f.ops,'accounting',[]),baselineAccounting);
    });
    await group('approved local release permits only existing cleanup and atomically retains tombstones',async()=>{
      await approveHold('release-actual',true);assert.equal((await coordinator().hold(scope,true,'release-actual')).status,'RELEASED');
      await approveHold('hold-race',false);await approveHold('release-race',true);
      const holder=receiver.roles.management_hold,pid=await value(f.ops,'SELECT pg_backend_pid() value');
      let committed=false,pending;
      await holder.query('BEGIN');
      try{
        assert.equal((await value(holder,'SELECT retention9d.hold($1,false,$2) value',[scope,'hold-race'])).status,'HELD');
        pending=operate('CLEAN').then(()=>({code:'UNEXPECTED_CLEAN'}),e=>({code:e.code}));
        const deadline=Date.now()+3000;
        while(await value(receiver.client,"SELECT COALESCE((SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1),'') value",[pid])!=='Lock'){
          assert.ok(Date.now()<deadline,'HOLD_CLEANUP_LOCK_BARRIER');await new Promise(resolve=>setTimeout(resolve,10));
        }
        await holder.query('COMMIT');committed=true;
        assert.deepEqual(await pending,{code:'55000'});
      }finally{if(!committed)await holder.query('ROLLBACK');if(pending)await pending;}
      assert.equal((await value(holder,'SELECT retention9d.hold($1,true,$2) value',[scope,'release-race'])).status,'RELEASED');
      assert.equal((await operate('CLEAN')).status,'APPLIED');
      const terminal=await value(receiver.client,'SELECT transport9d.receive($1) value',[f.message(0).payload]);
      // Trusted fixture controller invokes the original function, without a new grant.
      assert.equal(await value(source.client,'SELECT outbox9d.remote_delete_payload($1,$2) value',[
        await value(source.client,'SELECT identity::bigint value FROM retention9d.resources WHERE scope=$1',[scope]),terminal]),true);
      for(const i of [source,receiver])assert.equal(await value(i.client,'SELECT tombstone value FROM retention9d.resources WHERE scope=$1',[scope]),true);
      assert.equal(await value(receiver.client,'SELECT cleaned value FROM broker9d.requests WHERE id=$1',[request]),true);
      witness.actualCleanup={sourcePayloadNull:true,receiverCleaned:true,custodianCommitmentsDeleted:false,originalPolicyFunctionsUnchanged:true};
    });
    await group('late holds stale payload restoration and identity deletion are explicitly refused',async()=>{
      await approveHold('late-actual',false);assert.equal((await coordinator().hold(scope,false,'late-actual')).status,'LATE_HOLD_CONFLICT');
      assert.equal((await coordinator().restoreDecision(scope)).status,'QUARANTINE');
      await assert.rejects(source.client.query('UPDATE outbox9d.deliveries SET payload=$2 WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope,originalSourcePayload]),{code:'55000'});
      await assert.rejects(source.client.query('DELETE FROM outbox9d.deliveries WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope]),{code:'55000'});
      await assert.rejects(source.client.query("UPDATE outbox9d.deliveries SET status='PENDING' WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)",[scope]),{code:'55000'});
      await source.client.query('BEGIN');
      try{await assert.rejects(source.client.query('TRUNCATE outbox9d.deliveries CASCADE'),{code:'55000'});}
      finally{await source.client.query('ROLLBACK');}
      assert.equal(await f.register(0),request);assert.equal(await brokerCall(f.exec,'reserve',[request]),null);
      assert.equal(await value(receiver.client,'SELECT count(*)::int value FROM broker9d.results'),0);
      const before=digest(await rows(custodian.client,'SELECT receipt,hash FROM custody.events ORDER BY custody_seq'));
      await assert.rejects(custodian.client.query('DELETE FROM custody.events WHERE receipt=(SELECT identity::uuid FROM retention9d.resources WHERE scope=$1)',[scope]),{code:'55000'});
      assert.equal(digest(await rows(custodian.client,'SELECT receipt,hash FROM custody.events ORDER BY custody_seq')),before);
      await observe('after-original-cleanup-and-quarantine');
      witness.audit=await Promise.all(nodes.map(async i=>({node:i.node,rows:await rows(i.client,'SELECT scope,actor,action,result FROM retention9d.audit ORDER BY id')})));
    });
    await group('graceful source receiver restart preserves actual fences tombstones accounting and endpoints',async()=>{
      const id=process.env.CUSTODY_SOURCE_CONTAINER;
      const command=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:40000});
      const inspection=JSON.parse(command(['inspect',id]))[0];
      assert.equal(inspection.Config.Labels['proofloop.owner'],process.env.CUSTODY_OWNERSHIP_LABEL);
      assert.equal(inspection.HostConfig.Memory,805306368);assert.equal(inspection.HostConfig.NanoCpus,750000000);
      const retained=async()=>({
        source:await rows(source.client,'SELECT id,status,source_binding,payload FROM outbox9d.deliveries ORDER BY id'),
        remote:await rows(source.client,'SELECT delivery_id,receipt FROM outbox9d.remote_receipts ORDER BY delivery_id'),
        broker:await rows(receiver.client,'SELECT id,status,receipt,binding,cleaned,payload FROM broker9d.requests ORDER BY id'),
        attempts:await rows(receiver.client,'SELECT * FROM broker9d.attempts ORDER BY id'),
        usage:await rows(receiver.client,'SELECT * FROM broker9d.usage_receipts ORDER BY receipt_id'),
        streams:await Promise.all([source,receiver].map(i=>rows(i.client,'SELECT seq,hash,event,status FROM custody_lineage.events ORDER BY seq'))),
        custody:await rows(custodian.client,'SELECT receipt,hash,event FROM custody.events ORDER BY custody_seq'),
        signatures:await rows(custodian.client,'SELECT * FROM custody.signatures ORDER BY receipt'),
        management:await Promise.all(nodes.map(async i=>({resources:await rows(i.client,'SELECT * FROM retention9d.resources ORDER BY scope'),guards:await rows(i.client,'SELECT * FROM retention9d.guarded_rows ORDER BY scope,relation_name,identity'),reservations:await rows(i.client,'SELECT * FROM capacity9d.reservations ORDER BY operation')}))),
      });
      const before=await retained(),starts=await Promise.all(nodes.map(i=>value(i.client,'SELECT pg_postmaster_start_time() value')));
      const parameters=nodes.map(i=>i.client.connectionParameters),roles=nodes.map(i=>Object.fromEntries(Object.entries(i.roles).map(([name,c])=>[name,c.connectionParameters]))),execParameters=f.exec.connectionParameters;
      await f.suspendOwnedConnectionsForRestart();
      for(const client of [...f.managementClients,f.sender,f.verifier,f.operator,f.sourceInspector,...f.streams.flatMap(s=>[s.sender,s.verifier,s.inspector]),f.ingest,f.signer])await client.end();
      command(['restart','--time','10',id]);
      const after=JSON.parse(command(['inspect',id]))[0],port=Number(after.NetworkSettings.Ports['5432/tcp'].find(p=>p.HostIp==='0.0.0.0').HostPort);
      const connect=async(p,targetPort)=>{
        for(let n=0;n<20;n++){
          const client=new pg.Client({...p,password:p.password,port:targetPort,connectionTimeoutMillis:2000});
          try{await client.connect();reconnectClients.push(client);return client;}catch(error){await client.end();if(n===19)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
        }
        throw Error('OWNED_RECONNECT_FAILED');
      };
      await f.source.resumeAfterRestart(port);await f.receiver.resumeAfterRestart(port);
      for(let n=0;n<2;n++)nodes[n].client=await connect(parameters[n],port);
      for(let n=0;n<3;n++)for(const [name,p] of Object.entries(roles[n]))nodes[n].roles[name]=await connect(p,n===2?p.port:port);
      assert.deepEqual(await retained(),before);
      const later=await Promise.all(nodes.map(i=>value(i.client,'SELECT pg_postmaster_start_time() value')));
      assert.notEqual(starts[0].toISOString(),later[0].toISOString());assert.notEqual(starts[1].toISOString(),later[1].toISOString());assert.equal(starts[2].toISOString(),later[2].toISOString());
      const execution=await connect(execParameters,port);
      assert.equal(await brokerCall(execution,'register',[JSON.stringify(f.message(0))]),request);
      assert.equal(await brokerCall(execution,'reserve',[request]),null);
      await assert.rejects(source.client.query('UPDATE outbox9d.deliveries SET payload=$2 WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope,originalSourcePayload]),{code:'55000'});
      assert.equal((await coordinator().restoreDecision(scope)).status,'QUARANTINE');
      witness.restart={kind:'GRACEFUL_SHARED_SOURCE_RECEIVER',oldPort:parameters[0].port,newPort:port,starts,later,retainedSha256:digest(before),custodianRestarted:false};
      await observe('after-source-receiver-restart');
    });
    success=true;witness.status='PASS';
  }finally{
    witness.status??='FAILED';
    await writeFile(join(process.env.CUSTODY_OUTPUT,'management-remaining-'+(success?'witness-':'failed-')+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
    await Promise.allSettled(reconnectClients.map(client=>client.end()));
    await f.close();
  }
});
