import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {managementFixture} from '../helpers/phase9dManagementFixture.js';
import {installManagementRemaining,bindGuardedResource} from '../../../tools/phase9d/management-remaining.mjs';
import {installManagementCompletion,preserveRemaining,ManagementAlertRelay} from '../../../tools/phase9d/management-completion.mjs';
import {ownedBackup,inspectRestoredScopes} from '../../../tools/phase9d/management-backup.mjs';
import {value,digest} from '../../../tools/phase9d/management-adapters.mjs';
import {RetentionCoordinator} from '../../../tools/phase9d/management-retention.mjs';
import {durableReceipt} from '../../../tools/phase9d/closure-keys.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';

test('completion: preserved remaining copies durable alerts and quarantined logical restore',async t=>{
  const f=await managementFixture(),nodes=f.installations,[source,receiver]=nodes;
  const w={schema:'phase9d-management-completion-v1',groups:[],profiling:false,mutations:0,productionDeletion:false,liveCalls:0};
  const scope='completion-actual-copy',reference='SYNTHETIC_PRESERVE_REMAINING';
  const clients=[];let backup,restoredName,restored,request,success=false,sourcePayload;
  const rows=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
  const members=()=>nodes.map(i=>({node:i.node,client:i.roles.management_hold}));
  const group=async(name,fn)=>{
    let failure;await t.test(name,async()=>{try{await fn();await f.unchanged();w.groups.push(name);}catch(e){failure=e;throw e;}});
    if(failure)throw failure;
  };
  const bind=async(name)=>{
    for(const i of nodes)await i.client.query(`INSERT INTO retention9d.resources(scope,category,identity,commitment,terminal,payload_present,disposition,observed_at)
      VALUES($1,'pipeline-advisory',$2,$3,true,true,'MINIMIZE_PAYLOAD',clock_timestamp()-interval '120 seconds')`,[name,'synthetic:'+name,digest(name)]);
  };
  const approve=async(name,ref)=>{
    for(const i of nodes)await i.client.query('INSERT INTO retention9d.hold_approvals VALUES($1,$2,false,true)',[ref,name]);
  };
  const drain=async()=>{
    for(const stream of [{schema:'custody_export',owner:f.b,sender:f.sender,verifier:f.verifier},...f.streams.map(s=>({...s,schema:'custody_lineage'}))]){
      for(const row of await rows(stream.owner,'SELECT seq,hash FROM '+stream.schema+".events WHERE status<>'ACKED' ORDER BY seq")){
        const frame=await value(stream.sender,'SELECT '+stream.schema+'.frame($1) value',[row.seq]);
        const body=await value(f.ingest,'SELECT custody.ingest($1) value',[frame]);
        const receipt=await durableReceipt(f.signer,body,new Map([[f.keyId,f.keys.privateKey]]));
        assert.equal(await value(stream.verifier,'SELECT '+stream.schema+'.ack($1,$2,$3) value',[row.seq,row.hash,receipt]),true);
      }
    }
  };
  try{
    await installManagementRemaining(nodes);await installManagementCompletion(nodes);
    await group('disabled production defaults restricted preservation and alert grants',async()=>{
      w.catalogs=[];
      for(const i of nodes){
        assert.equal(await value(i.client,'SELECT production_execution value FROM retention9d.configuration'),false);
        assert.notEqual(await value(i.client,"SELECT current_setting('plpgsql_check.profiler',true) value"),'on');
        assert.equal((await value(i.roles.management_hold,"SELECT retention9d.preserve_remaining('missing','unapproved') value")).status,'INVALID');
        await assert.rejects(i.roles.management_coordinator.query("SELECT retention9d.preserve_remaining('missing','x')"),{code:'42501'});
        await assert.rejects(i.roles.management_reader.query('DELETE FROM retention9d.preservation_barriers'),{code:'42501'});
        await assert.rejects(i.roles.management_admission.query("SELECT capacity9d.claim_alert('test',$1)",[randomUUID()]),{code:'42501'});
        w.catalogs.push({node:i.node,routines:await rows(i.client,"SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('capacity9d','retention9d') ORDER BY 1")});
      }
    });
    await group('closed management receipt expression rejects independently malformed fields',async()=>{
      const valid={schema:'management-receipt-v1',operation:randomUUID(),status:'PREPARED',scope:'receipt-contract',epoch:'1',policyVersion:'1',node:'source',commitment:'a'.repeat(64)};
      const invalid=[null,[],false,{...valid,extra:'x'},...Object.keys(valid).map(k=>Object.fromEntries(Object.entries(valid).filter(([n])=>n!==k))),
        ...Object.keys(valid).map(k=>({...valid,[k]:1})),...Object.keys(valid).map(k=>({...valid,[k]:null})),
        {...valid,schema:'foreign'},{...valid,operation:'invalid'},{...valid,status:'FOREIGN'},{...valid,epoch:'0'},
        {...valid,epoch:'1000000000000000'},{...valid,policyVersion:'-1'},{...valid,node:'foreign'},{...valid,commitment:'z'.repeat(64)}];
      for(const i of nodes){
        assert.equal(await value(i.client,'SELECT retention9d.valid_receipt($1) value',[valid]),true);
        for(const item of invalid)assert.equal(await value(i.client,'SELECT retention9d.valid_receipt($1::jsonb) value',[JSON.stringify(item)]),false);
      }
      w.receiptCasesPerInstallation=invalid.length+1;
    });
    await group('three-node metadata preparation exact binding and no production commit',async()=>{
      await bind('late-metadata');await approve('late-metadata','PRESERVE_METADATA');
      for(const i of nodes)await i.client.query("UPDATE retention9d.policies SET approved=true,enabled=true,approval_reference='SYNTHETIC_ONLY'");
      const op=randomUUID(),c=new RetentionCoordinator(receiver.roles.management_coordinator,
        nodes.map(i=>({node:i.node,client:i.roles.management_coordinator,holdClient:i.roles.management_hold})),receiver.roles.management_hold);
      assert.equal((await c.run({operation:op,scope:'late-metadata',version:1,approval:'SYNTHETIC_ONLY',stopAfter:'commit:source'})).status,'PARTIAL_COMMIT');
      assert.equal(await value(source.client,"SELECT tombstone value FROM retention9d.resources WHERE scope='late-metadata'"),true);
      assert.equal(await value(receiver.client,"SELECT tombstone value FROM retention9d.resources WHERE scope='late-metadata'"),false);
      const decision=await preserveRemaining(members(),{scope:'late-metadata',approval:'PRESERVE_METADATA'});
      assert.equal(decision.status,'MANUAL_REVIEW_REQUIRED');assert.equal(decision.observations[0].status,'ERASED_COPY_CONFLICT');
      assert.equal((await c.run({operation:op,scope:'late-metadata',version:1,approval:'SYNTHETIC_ONLY'})).status,'HELD');
      assert.equal(await value(receiver.client,"SELECT tombstone value FROM retention9d.resources WHERE scope='late-metadata'"),false);
      for(const i of nodes)assert.equal((await value(i.roles.management_coordinator,'SELECT retention9d.local_commit($1,$2,1,1,true) value',[op,'late-metadata'])).status,'PRODUCTION_DELETION_DISABLED');
      w.lateMetadataDecision=decision;
    });
    await group('disconnected preservation explicit pending and retry protects remaining copies',async()=>{
      await bind('disconnected-case');await approve('disconnected-case','PRESERVE_DISCONNECTED');
      const partial=members();partial[2].client=null;
      assert.equal((await preserveRemaining(partial,{scope:'disconnected-case',approval:'PRESERVE_DISCONNECTED'})).status,'PARTIAL_PRESERVATION');
      assert.equal(await value(nodes[2].client,"SELECT held value FROM retention9d.resources WHERE scope='disconnected-case'"),false);
      assert.equal((await preserveRemaining(members(),{scope:'disconnected-case',approval:'PRESERVE_DISCONNECTED'})).status,'MANUAL_REVIEW_REQUIRED');
      for(const i of nodes)assert.equal(await value(i.client,"SELECT held value FROM retention9d.resources WHERE scope='disconnected-case'"),true);
      await assert.rejects(preserveRemaining([members()[0],members()[0],members()[2]],{scope:'disconnected-case',approval:'PRESERVE_DISCONNECTED'}),/THREE_DISTINCT_NODES/);
    });
    await group('preservation approvals idempotency expiry-free manual review and node identity',async()=>{
      for(const i of nodes){
        assert.equal((await value(i.roles.management_hold,"SELECT retention9d.preserve_remaining('disconnected-case','wrong') value")).status,'APPROVAL_REQUIRED');
        const before=await rows(i.client,"SELECT * FROM retention9d.preservation_barriers WHERE scope='disconnected-case'");
        await value(i.roles.management_hold,"SELECT retention9d.preserve_remaining('disconnected-case','PRESERVE_DISCONNECTED') value");
        assert.deepEqual(await rows(i.client,"SELECT * FROM retention9d.preservation_barriers WHERE scope='disconnected-case'"),before);
        await assert.rejects(i.client.query("UPDATE retention9d.resources SET held=false WHERE scope='disconnected-case'"),{code:'55000'});
        await assert.rejects(i.client.query("UPDATE retention9d.resources SET commitment=$1 WHERE scope='disconnected-case'",['b'.repeat(64)]),{code:'55000'});
      }
      const wrong=members();[wrong[0].client,wrong[1].client]=[wrong[1].client,wrong[0].client];
      await assert.rejects(preserveRemaining(wrong,{scope:'disconnected-case',approval:'PRESERVE_DISCONNECTED'}),/NODE_MISMATCH/);
    });
    await group('missing production alert destination retains durable pending work',async()=>{
      for(const i of nodes){
        await i.client.query("SELECT capacity9d.signal('SYNTHETIC_STORAGE_CRITICAL','CRITICAL')");
        assert.equal((await new ManagementAlertRelay(i.roles.management_operator).once()).status,'ROUTING_UNCONFIGURED');
        assert.equal(await value(i.client,"SELECT count(*)::int value FROM capacity9d.alert_delivery WHERE state='PENDING'"),1);
      }
    });
    await group('local synthetic delivery receipt persisted exact destination token and no duplicate',async()=>{
      const seen=[];
      for(const i of nodes){
        const relay=new ManagementAlertRelay(i.roles.management_operator,{destination:'synthetic-oncall',deliver:async item=>{
          seen.push({node:i.node,id:item.id,key:item.idempotencyKey});return {id:item.id,destination:'synthetic-oncall',receipt:'local-receipt:'+item.id};}});
        assert.equal((await relay.once()).status,'DELIVERED');assert.equal((await relay.once()).status,'EMPTY');
        const row=(await rows(i.client,'SELECT * FROM capacity9d.alert_delivery'))[0];
        assert.equal(await value(i.roles.management_operator,'SELECT capacity9d.finish_alert($1,$2,$3,$4) value',[row.id,randomUUID(),'foreign','forged']),false);
      }
      w.syntheticDeliveries=seen;
    });
    await group('lost alert acknowledgement reuses identity bounded attempts and review',async()=>{
      const i=source,operator=i.roles.management_operator;
      await i.client.query("SELECT capacity9d.signal('SYNTHETIC_STORAGE_CRITICAL','CRITICAL')");
      const lost=new ManagementAlertRelay(operator,{destination:'synthetic-oncall',deliver:async()=>{throw Error('SYNTHETIC_ACK_LOSS');}});
      await assert.rejects(lost.once(),/SYNTHETIC_ACK_LOSS/);
      const first=(await rows(i.client,"SELECT * FROM capacity9d.alert_delivery WHERE state='IN_FLIGHT'"))[0];
      assert.equal(first.attempts,1);
      await i.client.query("UPDATE capacity9d.alert_delivery SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.id]);
      const retried=await value(operator,"SELECT capacity9d.claim_alert('synthetic-oncall',$1) value",[randomUUID()]);
      assert.equal(retried.id,first.id);assert.equal(retried.attempt,2);
      await i.client.query("UPDATE capacity9d.alert_delivery SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.id]);
      assert.equal((await value(operator,"SELECT capacity9d.claim_alert('synthetic-oncall',$1) value",[randomUUID()])).attempt,3);
      await i.client.query("UPDATE capacity9d.alert_delivery SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.id]);
      assert.equal(await value(operator,"SELECT capacity9d.claim_alert('synthetic-oncall',$1) value",[randomUUID()]),null);
      assert.equal(await value(i.client,'SELECT state value FROM capacity9d.alert_delivery WHERE id=$1',[first.id]),'REVIEW');
    });
    await group('invalid alert claims stale acknowledgements and exhausted ledger stay visible',async()=>{
      const i=nodes[2],operator=i.roles.management_operator;
      for(const destination of [null,'','x'.repeat(101)])assert.equal(await value(operator,'SELECT capacity9d.claim_alert($1,$2) value',[destination,randomUUID()]),null);
      assert.equal(await value(operator,"SELECT capacity9d.claim_alert('synthetic',NULL) value"),null);
      await i.client.query("SELECT capacity9d.signal('SYNTHETIC_NEW_ALERT','CRITICAL')");
      await i.client.query('UPDATE capacity9d.configuration SET max_operations=1');
      const relay=new ManagementAlertRelay(operator,{destination:'synthetic',deliver:async()=>{throw Error('NO_SEND_EXPECTED');}});
      const blocked=await relay.once();assert.equal(blocked.status,'REVIEW_REQUIRED');assert.ok(blocked.backlog.unrepresented>0);
      assert.equal(await value(i.client,"SELECT count(*)::int value FROM capacity9d.signals WHERE reason='ALERT_LEDGER_LIMIT'"),1);
      await i.client.query('UPDATE capacity9d.configuration SET max_operations=1000');
      await value(operator,'SELECT capacity9d.queue_alerts() value');
      const token=randomUUID(),item=await value(operator,"SELECT capacity9d.claim_alert('synthetic',$1) value",[token]);
      for(const ack of [null,'','x'.repeat(201)])assert.equal(await value(operator,'SELECT capacity9d.finish_alert($1,$2,$3,$4) value',[item.id,token,'synthetic',ack]),false);
      assert.equal(await value(operator,'SELECT capacity9d.finish_alert($1,$2,$3,$4) value',[item.id,token,'foreign','receipt']),false);
      await i.client.query("UPDATE capacity9d.alert_delivery SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[item.id]);
      assert.equal(await value(operator,'SELECT capacity9d.finish_alert($1,$2,$3,$4) value',[item.id,token,'synthetic','receipt']),false);
      const substituted=new ManagementAlertRelay(operator,{destination:'synthetic',deliver:async item=>({id:item.id,destination:'foreign',receipt:'unbound'})});
      assert.equal((await substituted.once()).status,'RECEIPT_REJECTED');
    });
    await group('preservation ledger bounds refuse rather than claiming an unrecorded hold',async()=>{
      await bind('preservation-limit');await approve('preservation-limit','PRESERVE_LIMIT');
      await source.client.query('UPDATE retention9d.configuration SET max_operations=1');
      assert.equal((await value(source.roles.management_hold,"SELECT retention9d.preserve_remaining('preservation-limit','PRESERVE_LIMIT') value")).status,'OPERATION_LIMIT');
      assert.equal(await value(source.client,"SELECT held value FROM retention9d.resources WHERE scope='preservation-limit'"),false);
      await source.client.query('UPDATE retention9d.configuration SET max_operations=1000');
    });
    await group('actual original rows and independent signed custody bind a backup scope',async()=>{
      request=await f.register(0);
      const revision=await value(receiver.client,'SELECT revision value FROM broker9d.requests WHERE id=$1',[request]);
      assert.equal((await brokerCall(f.ops,'operate',[randomUUID(),request,'TERMINATE',revision,'UNRESOLVED_PROVIDER'])).status,'APPLIED');
      await drain();
      for(const i of nodes)await bindGuardedResource(i.client,i.node,scope,f.message(0).payload.evidenceHash);
      await approve(scope,reference);
      sourcePayload=await value(source.client,'SELECT payload value FROM outbox9d.deliveries WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope]);
      assert.ok(sourcePayload);
      backup=ownedBackup(process.env.CUSTODY_SOURCE_CONTAINER,process.env.CUSTODY_OWNERSHIP_LABEL,f.source.name);
      w.backup={bytes:backup.bytes,sha256:backup.sha256,fileLimitBytes:backup.fileLimitBytes,format:backup.format,scope:backup.scope};
    });
    await group('one trusted synthetic erasure preserves other actual payloads on late hold',async()=>{
      // Explicit owner-only fault fixture: simulate a copy already erased. This
      // is not a newly authorized application cleanup or a production policy.
      await source.client.query('UPDATE outbox9d.deliveries SET payload=NULL WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope]);
      assert.equal(await value(source.client,'SELECT tombstone value FROM retention9d.resources WHERE scope=$1',[scope]),true);
      const before=await value(receiver.client,'SELECT payload value FROM broker9d.requests WHERE id=$1',[request]);
      assert.ok(before);
      const decision=await preserveRemaining(members(),{scope,approval:reference});
      assert.equal(decision.observations[0].status,'ERASED_COPY_CONFLICT');assert.equal(decision.observations[1].status,'PRESERVED');
      await assert.rejects(receiver.client.query('UPDATE broker9d.requests SET payload=NULL WHERE id=$1',[request]),{code:'55000'});
      assert.deepEqual(await value(receiver.client,'SELECT payload value FROM broker9d.requests WHERE id=$1',[request]),before);
      await assert.rejects(source.client.query('UPDATE outbox9d.deliveries SET payload=$2 WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope,sourcePayload]),{code:'55000'});
      w.actualLateHold=decision;
    });
    await group('actual logical archive restores to fresh inaccessible quarantine database',async()=>{
      restoredName='rcs_archive_restore_'+randomUUID().replaceAll('-','');
      w.restore=await backup.restore(source.client,restoredName);
      restored=new pg.Client({...source.client.connectionParameters,password:source.client.connectionParameters.password,database:restoredName,connectionTimeoutMillis:3000});
      restored.on('error',()=>{});await restored.connect();clients.push(restored);
      assert.equal(await value(restored,'SELECT current_database() value'),restoredName);
      assert.equal(await value(restored,'SELECT tombstone value FROM retention9d.resources WHERE scope=$1',[scope]),false);
      assert.deepEqual(await value(restored,'SELECT payload value FROM outbox9d.deliveries WHERE id=(SELECT identity::bigint FROM retention9d.resources WHERE scope=$1)',[scope]),sourcePayload);
      assert.equal(await value(source.client,"SELECT has_database_privilege('broker9d_exec',$1,'CONNECT') value",[restoredName]),false);
      const denied=new pg.Client({...f.exec.connectionParameters,password:f.exec.connectionParameters.password,database:restoredName,connectionTimeoutMillis:3000});
      await assert.rejects(denied.connect(),{code:'42501'});await denied.end();
    });
    await group('newer authoritative hold tombstone detects stale archive and never releases traffic',async()=>{
      await source.client.query('UPDATE retention9d.policies SET enabled=false');
      const decision=await inspectRestoredScopes(source.client,restored);
      assert.equal(decision.status,'QUARANTINE');assert.ok(decision.conflictingScopes.includes(scope));
      assert.ok(decision.blockedByCurrentHoldOrTombstone.includes(scope));assert.equal(decision.trafficReleaseAuthorized,false);
      assert.equal(decision.policiesMatch,false);
      w.restoreDecision=decision;
      assert.equal(await value(source.client,'SELECT production_execution value FROM retention9d.configuration'),false);
      assert.equal(await value(receiver.client,'SELECT count(*)::int value FROM broker9d.results'),0);
      assert.equal(await f.register(0),request);
    });
    success=true;w.status='PASS';
  }finally{
    w.status??='FAILED';
    await Promise.allSettled(clients.map(c=>c.end()));
    if(restoredName)await source.client.query('DROP DATABASE IF EXISTS "'+restoredName+'" WITH (FORCE)').catch(e=>{w.restoreCleanupError=e.code;});
    if(backup)try{backup.dispose();}catch(e){w.backupCleanupError=e.message;}
    await writeFile(join(process.env.CUSTODY_OUTPUT,'management-completion-'+(success?'witness-':'failed-')+randomUUID()+'.json'),JSON.stringify(w,null,2),{flag:'wx'});
    await f.close();
  }
});
