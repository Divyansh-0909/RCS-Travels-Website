import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {execFileSync} from 'node:child_process';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {storageSnapshot,clusterSnapshot} from '../helpers/phase9dStorageMetrics.js';
import {commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {deliverCustody} from '../../../tools/phase9d/custody-delivery.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const scalar=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0].value;
test('bounded storage observations and TEST ONLY retention hold prototype',async t=>{
  const f=await custodyLineageFixture(),clients=[],w={schema:'phase9d-storage-retention-v1',groups:[],snapshots:[],clusters:[],retention:[],routineReplacementOperations:0,profiling:false,liveCalls:0};let saved=false,request;
  const installations=[{name:'source',client:f.a},{name:'receiver',client:f.b},{name:'custodian',client:f.audit}];
  const take=async label=>{
    for(const i of installations)w.snapshots.push({...await storageSnapshot(i.client,label),installation:i.name});
    // Source and receiver share one physical cluster: WAL is sampled once.
    for(const [name,c]of [['source-receiver',f.a],['independent-custodian',f.audit]])w.clusters.push({...await clusterSnapshot(c,label),installation:name});
  };
  const group=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();await f.unchanged();w.groups.push(name);}catch(e){failure=e;throw e;}});if(failure)throw failure;};
  const keys=new Map([[f.keyId,f.keys.privateKey]]),streams=[{schema:'custody_export',owner:f.b,sender:f.sender,verifier:f.verifier},...f.streams.map(s=>({...s,schema:'custody_lineage'}))];
  const drain=async()=>{
    for(const s of streams){
      const pending=(await s.owner.query('SELECT seq,hash FROM '+s.schema+'.events WHERE status<>\'ACKED\' ORDER BY seq')).rows;
      for(const r of pending){
        const frame=await scalar(s.sender,'SELECT '+s.schema+'.frame($1) value',[r.seq]);assert.equal(commitment(frame.event),r.hash);
        const body=await scalar(f.ingest,'SELECT custody.ingest($1) value',[frame]),receipt=await durableReceipt(f.signer,body,keys);
        assert.equal(historicalVerification(receipt,frame.event,await f.registry()).signatureValid,true);
        assert.equal(await scalar(s.verifier,'SELECT '+s.schema+'.ack($1,$2,$3) value',[r.seq,r.hash,receipt]),true);
      }
    }
  };
  try{
    await group('inventory and bounded baseline on three databases and two physical clusters',async()=>{
      for(const i of installations)assert.notEqual(await scalar(i.client,"SELECT current_setting('plpgsql_check.profiler',true) value"),'on');
      request=await f.register(0);assert.ok(request);await take('baseline');
      assert.equal(w.snapshots[0].database.cluster,w.snapshots[1].database.cluster);assert.notEqual(w.snapshots[0].database.cluster,w.snapshots[2].database.cluster);
    });
    await group('ordinary ingestion and increased retained lineage volume',async()=>{
      for(const count of [4,12,16]){
        for(const stream of f.streams)for(let n=0;n<count;n++)await stream.owner.query("SELECT audit9d.append('SYNTHETIC_STORAGE',NULL,$1)",[{ordinal:n,batch:count,minimized:true}]);
        if(count===4)await drain();await take(count===4?'ordinary-signed':count===12?'increased-backlog':'larger-backlog');
      }
      w.volume={newAuditEventsPerInstallation:32,retainedHistoryDeleted:0};
    });
    await group('bounded real failed HTTP delivery REVIEW recovery and retained history',async()=>{
      assert.equal((await f.control('STOP')).status,'APPLIED');assert.equal((await f.control('RESUME')).status,'APPLIED');request=await f.register(1);assert.ok(request);
      const before=(await f.b.query('SELECT seq,local_id,event,hash FROM custody_export.events ORDER BY seq')).rows;
      for(let cycle=0;cycle<2;cycle++){
        for(let n=0;n<3;n++)assert.equal((await deliverCustody(f.sender,'http://127.0.0.1:1','synthetic-offline-only')).status,'PENDING_OR_REVIEW');
        assert.equal((await deliverCustody(f.sender,'http://127.0.0.1:1','synthetic-offline-only')).status,'STOPPED_OR_REVIEW');
        const first=(await f.b.query("SELECT seq,attempts,recoveries,status FROM custody_export.events WHERE status<>'ACKED' ORDER BY seq LIMIT 1")).rows[0];assert.equal(first.status,'REVIEW');assert.equal(first.attempts,3);
        await take('review-cycle-'+cycle);
        assert.equal(await scalar(f.operator,'SELECT custody_export.retry($1,$2,3) value',[randomUUID(),first.seq]),true);
      }
      assert.deepEqual((await f.b.query('SELECT seq,local_id,event,hash FROM custody_export.events ORDER BY seq')).rows,before);await take('recovered-backlog');
    });
    await group('test-limit refusal and restored admission after independent signed drain',async()=>{
      const limit=(await f.b.query('SELECT max_unacknowledged FROM custody_export.limits')).rows[0].max_unacknowledged;
      await f.b.query('UPDATE custody_export.limits SET max_unacknowledged=1');
      try{
        await assert.rejects(brokerCall(f.exec,'reserve',[request]),{code:'54000'});
        await drain();assert.equal((await f.b.query('SELECT custody_export.pressure() pressure')).rows[0].pressure.unacknowledgedCount,0);
        await f.exec.query('BEGIN');try{assert.ok(await brokerCall(f.exec,'reserve',[request]));}finally{await f.exec.query('ROLLBACK');}
      }finally{await f.b.query('UPDATE custody_export.limits SET max_unacknowledged=$1',[limit]);}
      await take('signed-drained-admission-restored');
    });
    await group('legal terminal payload cleanup retains journals signatures and tombstones',async()=>{
      const counts=async()=>({source:(await f.a.query('SELECT count(*)::int n FROM outbox9d.deliveries')).rows[0].n,signatures:(await f.audit.query('SELECT count(*)::int n FROM custody.signatures')).rows[0].n});
      const before=await counts();
      for(const action of ['TERMINATE','CLEAN']){const row=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[request])).rows[0];assert.equal((await brokerCall(f.ops,'operate',[randomUUID(),request,action,row.revision,action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER'])).status,'APPLIED');}
      await drain();const after=await counts();assert.equal(after.source,before.source);assert.ok(after.signatures>=before.signatures);await take('terminal-cleaned');
    });
    const prototype=await readFile(new URL('../helpers/phase9dSyntheticRetention.sql',import.meta.url),'utf8'),record=randomUUID(),hold=randomUUID(),payload=randomBytes(12288).toString('hex');
    await group('install isolated synthetic retention policy no real duration or deletion activation',async()=>{
      for(const i of installations){
        await i.client.query(prototype);i.roles={};
        for(const role of ['retention_test_delete','retention_test_hold','retention_test_reader']){
          const password=randomUUID();await i.client.query((await i.client.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) sql",[role,password])).rows[0].sql);
          const p=i.client.connectionParameters,c=new pg.Client({host:p.host,port:p.port,database:p.database,user:role,password,statement_timeout:5000});c.on('error',()=>{});await c.connect();clients.push(c);i.roles[role]=c;
        }
        await i.client.query("INSERT INTO retention_test.records(id,state,expires_at,payload,commitment) VALUES($1,'TERMINAL','2026-10-18T00:01:00Z',$2,$3)",[record,payload,hash(payload)]);
        assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,1,1) value',[record]),'POLICY_DENIED');
        await i.client.query('UPDATE retention_test.policy SET approved_test_policy=true');
        assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,1,1) value',[record]),'NOT_EXPIRED');
      }
      await take('synthetic-retention-payloads');
    });
    await group('unauthorized deletion hold release policy and audit tampering denied',async()=>{
      for(const i of installations){
        for(const sql of ['DELETE FROM retention_test.records','UPDATE retention_test.policy SET approved_test_policy=true','DELETE FROM retention_test.audit','SELECT retention_test.hold(\''+record+'\',\''+hold+'\',\'SYNTHETIC_DISPUTE\',false)'])await assert.rejects(i.roles.retention_test_delete.query(sql),{code:'42501'});
        await assert.rejects(i.roles.retention_test_hold.query('SELECT retention_test.purge($1,1,1)',[record]),{code:'42501'});
        await assert.rejects(i.roles.retention_test_reader.query('SELECT retention_test.restore_payload($1,$2)',[record,payload]),{code:'42501'});
      }
    });
    await group('expiry active state stale revision policy and legal hold eligibility',async()=>{
      for(const i of installations){
        await i.client.query("UPDATE retention_test.policy SET now_at='2026-10-18T00:02:00Z'");
        assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,1,2) value',[record]),'POLICY_DENIED');
        await i.client.query("UPDATE retention_test.records SET state='ACTIVE' WHERE id=$1",[record]);assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,1,1) value',[record]),'ACTIVE');
        await i.client.query("UPDATE retention_test.records SET state='TERMINAL' WHERE id=$1",[record]);
        assert.equal(await scalar(i.roles.retention_test_hold,"SELECT retention_test.hold($1,$2,'SYNTHETIC_DISPUTE',false) value",[record,hold]),'HELD');
        assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,1,1) value',[record]),'STALE');
        assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,2,1) value',[record]),'HELD');
        assert.equal(await scalar(i.roles.retention_test_hold,"SELECT retention_test.hold($1,$2,'SYNTHETIC_DISPUTE',true) value",[record,randomUUID()]),'RELEASE_DENIED');
        assert.equal(await scalar(i.roles.retention_test_hold,"SELECT retention_test.hold($1,$2,'SYNTHETIC_DISPUTE',true) value",[record,hold]),'RELEASED');
      }
    });
    await group('cross-system partial deletion late hold and explicit reconciliation',async()=>{
      const purge=async i=>scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,3,1) value',[record]);
      assert.equal(await purge(installations[0]),'PURGED');
      for(const i of installations){const r=await scalar(i.roles.retention_test_hold,"SELECT retention_test.hold($1,$2,'SYNTHETIC_DISPUTE',false) value",[record,hold]);w.retention.push({installation:i.name,lateHold:r});assert.equal(r,i.name==='source'?'ALREADY_PURGED_HOLD_INCOMPLETE':'HELD');}
      assert.equal(await scalar(installations[1].roles.retention_test_delete,'SELECT retention_test.purge($1,4,1) value',[record]),'HELD');
      for(const i of installations.slice(1)){assert.equal(await scalar(i.roles.retention_test_hold,"SELECT retention_test.hold($1,$2,'SYNTHETIC_DISPUTE',true) value",[record,hold]),'RELEASED');assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.purge($1,5,1) value',[record]),'PURGED');}
      assert.equal(await purge(installations[0]),'ALREADY_PURGED');
      w.retentionBoundary={currentCopies:'RECONCILED',globalAtomicHold:false,lateHoldCannotRestorePurgedPayload:true,backups:'PENDING_POLICY_AND_REAL_BACKUP_IMPLEMENTATION'};
      await take('synthetic-retention-purged');
    });
    await group('synthetic stale backup cannot resurrect tombstoned payload commitments remain',async()=>{
      for(const i of installations){assert.equal(await scalar(i.roles.retention_test_delete,'SELECT retention_test.restore_payload($1,$2) value',[record,payload]),false);
        const row=(await i.roles.retention_test_reader.query('SELECT state,payload,commitment,tombstone,held FROM retention_test.records WHERE id=$1',[record])).rows[0];assert.equal(row.payload,null);assert.equal(row.commitment,hash(payload));assert.equal(row.state,'TERMINAL');assert.equal(row.tombstone,true);assert.equal(row.held,false);
        const audit=(await i.roles.retention_test_reader.query('SELECT actor,action,result,revision FROM retention_test.audit ORDER BY id')).rows;assert.ok(audit.some(r=>r.actor==='retention_test_hold'&&r.result==='HELD'));assert.ok(audit.some(r=>r.actor==='retention_test_delete'&&r.result==='PURGED'));w.retention.push({installation:i.name,audit});}
    });
    await group('rollback vacuum checkpoint and retained metric reconciliation',async()=>{
      const before=(await f.a.query('SELECT count(*)::int n FROM audit9d.events')).rows[0].n;await f.a.query('BEGIN');await f.a.query("SELECT audit9d.append('ROLLED_BACK_STORAGE',NULL,'{}')");await f.a.query('ROLLBACK');assert.equal((await f.a.query('SELECT count(*)::int n FROM audit9d.events')).rows[0].n,before);
      for(const i of installations){await i.client.query('VACUUM (ANALYZE)');await i.client.query('CHECKPOINT');}await take('vacuum-checkpoint');
      for(const name of ['source-receiver','independent-custodian']){const a=w.clusters.find(r=>r.installation===name),b=w.clusters.filter(r=>r.installation===name).at(-1),c=name==='source-receiver'?f.a:f.audit;w.clusters.push({installation:name,label:'wal-generated-total',bytes:await scalar(c,'SELECT pg_wal_lsn_diff($1::pg_lsn,$2::pg_lsn)::text value',[b.insert_lsn,a.insert_lsn])});}
      assert.ok(w.snapshots.filter(s=>s.label==='vacuum-checkpoint').every(s=>s.database.temp_files===0));
    });
    await group('owned custodian graceful replacement preserves committed records and deletion tombstones',async()=>{
      const queries={source:'SELECT seq,hash,status,receipt FROM custody_lineage.events ORDER BY seq',receiver:'SELECT seq,hash,status,receipt FROM custody_export.events ORDER BY seq',custodian:'SELECT source,seq,hash,receipt,key_id FROM custody.events ORDER BY source,seq'};
      const before=[];
      for(const i of installations){before.push({installation:i.name,parameters:i.client.connectionParameters,rows:(await i.client.query(queries[i.name])).rows,retention:(await i.client.query('SELECT id,payload,commitment,tombstone,held FROM retention_test.records ORDER BY id')).rows,start:(await i.client.query('SELECT pg_postmaster_start_time() started')).rows[0].started});if(i.name==='custodian')await i.client.end();}
      const identities=[process.env.CUSTODY_AUDIT_CONTAINER];let custodyPort;
      for(const id of identities){assert.match(id,/^[a-f0-9]{64}$/);const inspect=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',windowsHide:true}))[0];assert.equal(inspect.Config.Labels['proofloop.owner'],process.env.CUSTODY_OWNERSHIP_LABEL);assert.equal(inspect.HostConfig.Memory,768*1024*1024);execFileSync('docker',['restart','--time','10',id],{timeout:30000,windowsHide:true});const restarted=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',windowsHide:true}))[0];custodyPort=Number(restarted.NetworkSettings.Ports['5432/tcp'].find(p=>p.HostIp==='0.0.0.0').HostPort);assert.ok(custodyPort>0&&custodyPort<65536);}
      w.restart=[];w.restartBoundary='Only the independent custodian restarts. Source/receiver live admin lifecycle requires a separately owned reconnectable fixture; prior failed attempt retained.';
      for(const b of before){let c=b.installation==='custodian'?null:installations.find(i=>i.name===b.installation).client;for(let n=0;!c&&n<15;n++){c=new pg.Client({...b.parameters,password:b.parameters.password,port:custodyPort,connectionTimeoutMillis:2000});c.on('error',()=>{});try{await c.connect();break;}catch(e){w.restartConnectionErrors??=[];w.restartConnectionErrors.push({code:e.code??null,name:e.name});await c.end();c=null;await new Promise(ok=>setTimeout(ok,400));}}assert.ok(c);clients.push(c);
        assert.deepEqual((await c.query(queries[b.installation])).rows,b.rows);assert.deepEqual((await c.query('SELECT id,payload,commitment,tombstone,held FROM retention_test.records ORDER BY id')).rows,b.retention);const start=(await c.query('SELECT pg_postmaster_start_time() started')).rows[0].started;if(b.installation==='custodian')assert.notEqual(start.toISOString(),b.start.toISOString());else assert.equal(start.toISOString(),b.start.toISOString());w.restart.push({installation:b.installation,records:b.rows.length,rowsSha256:hash(JSON.stringify(b.rows)),before:b.start,after:start,tombstonesRetained:true,oldPort:b.parameters.port,readbackPort:b.installation==='custodian'?custodyPort:b.parameters.port});w.snapshots.push({...await storageSnapshot(c,'after-graceful-restart'),installation:b.installation});if(b.installation!=='receiver')w.clusters.push({...await clusterSnapshot(c,'after-graceful-restart'),installation:b.installation==='source'?'source-receiver':'independent-custodian'});
      }
    });
    w.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,'storage-retention-witness-'+randomUUID()+'.json'),JSON.stringify(w,null,2),{flag:'wx'});saved=true;
  }finally{if(!saved)await writeFile(join(process.env.CUSTODY_OUTPUT,'storage-retention-failed-'+randomUUID()+'.json'),JSON.stringify(w,null,2),{flag:'wx'});await Promise.allSettled(clients.map(c=>c.end()));await f.close();}
});
