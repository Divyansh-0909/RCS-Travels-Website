import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from '../helpers/database.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
import {brokerProcess} from '../helpers/phase9dBrokerProcesses.js';
import {issueOfflineUsage} from '../../../tools/phase9d/recovery-receipt.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('saved recovery inputs execute lost acknowledgement, signed accounting and manual terminal tombstones',async()=>{
  const recipe=JSON.parse(await readFile(process.env.PHASE9D_REPLAY_INPUT,'utf8'));
  const source=await createTestDatabase(),receiver=await createTestDatabase({migrations:false}),processes=[];
  const base=testDatabaseUrl(),target=name=>{const value=new URL(base);value.pathname='/'+name;return value;};
  const a=new pg.Client({connectionString:target(source.name).toString()}),b=new pg.Client({connectionString:target(receiver.name).toString()});await a.connect();await b.connect();
  try{
    const asset=name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8');
    const permissions=await asset('permissions.sql');await a.query(permissions);await a.query(await asset('outbox.sql'));await a.query(await asset('transport-sender.sql'));
    await b.query(permissions.replace(/^CREATE ROLE .*;\r?\n/gm,''));await b.query(await asset('transport-receiver.sql'));
    await b.query(await asset('broker.sql'));await b.query(await asset('broker-recovery.sql'));
    const usageKey='synthetic-recovery-replay-issuer-key-at-least-thirty-two';await b.query('INSERT INTO broker9d.usage_authority VALUES($1,$2)',['offline-issuer-v1',usageKey]);
    for(const [owner,name] of [[a,source.name],[b,receiver.name]])await owner.query('REVOKE TEMPORARY ON DATABASE "'+name+'" FROM PUBLIC');
    const scenario=createScheduledScenario({now:recipe.at}),revive=(key,value)=>typeof value==='string'&&key.endsWith('At')?new Date(value):value;
    const collections=JSON.parse(JSON.stringify(recipe.initial),revive);
    for(const [name,rows] of Object.entries(collections)){assert.equal(rows.length,scenario.collections[name].length);rows.forEach((row,i)=>Object.assign(scenario.collections[name][i],row));}
    await scenario.persist(source.client);
    for(const [i,table] of ['driver_cancellations','responsibility_evidence_versions','responsibility_adjudication_work'].entries()){
      const id=recipe.journalIds[i];assert.match(id,/^[a-f0-9-]{36}$/);
      await a.query(`CREATE FUNCTION public.transport_identity_${i}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.id='${id}';RETURN NEW;END$$;
        REVOKE ALL ON FUNCTION public.transport_identity_${i}() FROM PUBLIC;CREATE TRIGGER transport_identity_${i} BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.transport_identity_${i}()`);
    }
    const initial=await consequenceState(source.client),clock=createTestClock(recipe.at);
    await source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,scenario.bookingStates.current,scenario.driversByGroup.rcs,{reason:'rider_unreachable'},{clock}));
    const committed=await consequenceState(source.client);
    const requestKey='synthetic-replay-request-key-at-least-thirty-two',receiptKey='synthetic-replay-receipt-key-at-least-thirty-two';
    await a.query('INSERT INTO outbox9d.transport_configuration(service_id,receipt_key) VALUES($1,$2)',[recipe.serviceId,receiptKey]);
    await b.query('INSERT INTO transport9d.configuration(service_id,receipt_key) VALUES($1,$2)',[recipe.serviceId,receiptKey]);
    await a.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
    for(const owner of [a,b])await owner.query('UPDATE shadow9d.control SET stopped=false,now_at=$1',[recipe.at]);
    const passwords=new Map();for(const role of ['shadow9d_capture','shadow9d_exporter','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler']){
      const password=randomUUID();passwords.set(role,password);await a.query((await a.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
    }
    const login=(name,role)=>{const value=target(name);value.username=role;value.password=passwords.get(role);return value.toString();};
    let service;const endpoint=()=>`http://127.0.0.1:${service.result.port}/v1/shadow/deliveries`;
    const start=async fault=>{service=await transportProcess({mode:'receiver',connectionString:login(receiver.name,'shadow9d_capture'),requestKey,fault});processes.push(service);};
    const sender=async crashAfterStage=>{const child=await transportProcess({mode:'sender',connectionString:login(source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint:endpoint(),crashAfterStage});processes.push(child);if(crashAfterStage)await child.kill();else assert.equal((await child.exited).code,0);return child.result;};
    await start('lost-ack');assert.equal((await sender(true)).status,'STAGED');await a.query("UPDATE shadow9d.control SET now_at=now_at+interval '121 seconds'");
    assert.equal((await sender(false)).status,'RETRYABLE');assert.equal((await b.query('SELECT count(*)::int n FROM transport9d.receipts')).rows[0].n,1);
    await service.close();await start();await a.query("UPDATE shadow9d.control SET now_at=now_at+interval '31 seconds'");
    assert.equal((await sender(false)).status,'ACKED');assert.equal((await sender(false)).status,'EMPTY');
    const delivery=(await a.query('SELECT payload,status,attempts FROM outbox9d.deliveries')).rows[0];
    const terminal=await sendShadowDelivery(endpoint(),requestKey,delivery.payload);
    await b.query('UPDATE broker9d.control SET now_at=$1',[recipe.at]);await b.query('SELECT broker9d.set_stop(false)');
    const message={protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:terminal.body.receipt,payload:delivery.payload};
    const requestId=(await b.query('SELECT broker9d.register($1) id',[JSON.stringify(message)])).rows[0].id;
    const run=async configuration=>{const child=await brokerProcess(configuration);processes.push(child);return child;};
    const execute=pauseAt=>run({mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId,fixture:'valid',...(pauseAt?{pauseAt}:{})});
    const crashed=await execute('observed');assert.equal(crashed.result.status,'PAUSED');await crashed.kill();
    const attempt=(await b.query('SELECT * FROM broker9d.attempts')).rows[0],request=(await b.query('SELECT * FROM broker9d.requests')).rows[0];
    assert.equal(attempt.usage_state,'UNKNOWN');assert.equal(attempt.may_have_escaped,true);
    await b.query("UPDATE broker9d.control SET now_at=now_at+interval '61 seconds'");
    const duplicate=await execute();await duplicate.exited;assert.equal(duplicate.result.status,'NOT_RESERVED');
    const receipt=issueOfflineUsage({receiptId:recipe.journalIds[0],requestId,attemptId:attempt.id,dispatchId:attempt.dispatch_id,configurationHash:request.configuration_hash,generation:String(attempt.generation),responseHash:attempt.response_hash},{outcome:'SUCCESS',input:128,output:32,minor:2},usageKey);
    const reconcile=new pg.Client({connectionString:login(receiver.name,'broker9d_reconciler')}),ops=new pg.Client({connectionString:login(receiver.name,'broker9d_ops')});await reconcile.connect();await ops.connect();
    try{
      assert.equal(await brokerCall(reconcile,'reconcile',[JSON.stringify(receipt)]),'ACCEPTED');
      const guarded=await run({mode:'guard',connectionString:login(receiver.name,'broker9d_guard'),id:attempt.id,token:attempt.token});await guarded.exited;assert.equal(guarded.result.status,'FENCED');
      for(const action of ['TERMINATE','CLEAN']){
        const q=(await b.query('SELECT revision FROM broker9d.requests')).rows[0];
        assert.equal((await brokerCall(ops,'operate',[randomUUID(),requestId,action,q.revision,action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER'])).status,'APPLIED');
      }
      assert.equal(await brokerCall(reconcile,'reconcile',[JSON.stringify(receipt)]),'DUPLICATE');
    }finally{await reconcile.end();await ops.end();}
    assert.equal((await b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,0);
    const work={status:'TERMINAL',cleaned:true,usage:'CONFIRMED',minor:2};
    const repeated=await sendShadowDelivery(endpoint(),requestKey,delivery.payload);assert.equal(repeated.body.receipt,terminal.body.receipt);
    assert.deepEqual(await consequenceState(source.client),committed);
    const outcome={initial,committed,events:recipe.events,delivery,receiver:work,
      receipt:{...terminal.body,receipt:'generated-receipt-1'},broker:{configuration:(await b.query('SELECT * FROM broker9d.configuration')).rows,
        attempts:(await b.query('SELECT number,generation,status,usage_state,input_reserved,output_reserved,minor_reserved,input_used,output_used,minor_used,admitted_at,send_at,may_have_escaped FROM broker9d.attempts ORDER BY number')).rows,
        request:(await b.query('SELECT logical_key,binding,evidence_hash,configuration,configuration_hash,generation,status,cleaned,revision FROM broker9d.requests')).rows,
        operations:(await b.query('SELECT action,reason,actor FROM broker9d.operations ORDER BY at,action')).rows,
        events:(await b.query('SELECT action,actor FROM broker9d.events ORDER BY id')).rows,
        usage:(await b.query("SELECT body-ARRAY['requestId','attemptId','dispatchId'] body,disposition FROM broker9d.usage_receipts")).rows,
        resultCount:(await b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n},
      final:await consequenceState(source.client),fakeAnalystCalls:1,liveCalls:0};
    const out=resolve(process.env.PHASE9D_BROKER_OUTPUT);await writeFile(join(out,'recovery-replay-outcome-'+recipe.id+'-'+randomUUID()+'.json'),JSON.stringify({recipeId:recipe.id,recipeSha256:digest(recipe),outcome,outcomeSha256:digest(outcome),rawReceipt:terminal},null,2),{flag:'wx'});
  }finally{await Promise.allSettled(processes.map(child=>child.close?.()??child.kill()));await a.end();await b.end();await receiver.close();await source.close();}
});
