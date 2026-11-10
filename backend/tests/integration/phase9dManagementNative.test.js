import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {managementFixture} from '../helpers/phase9dManagementFixture.js';
import {installManagementRemaining} from '../../../tools/phase9d/management-remaining.mjs';
import {installManagementCompletion} from '../../../tools/phase9d/management-completion.mjs';
import {managementNative} from '../../../tools/phase9d/management-native.mjs';
import {value,digest} from '../../../tools/phase9d/management-adapters.mjs';

test('separate cache-off native management measurement with persisted assertions',async t=>{
  const f=await managementFixture(),nodes=f.installations;
  const w={schema:'phase9d-management-native-v1',profiling:true,mutations:0,productionDeletion:false,groups:[],native:[]};
  let success=false;
  const group=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();await f.unchanged();w.groups.push(name);}catch(e){error=e;throw e;}});if(error)throw error;};
  try{
    await installManagementRemaining(nodes);await installManagementCompletion(nodes);
    for(const i of nodes){
      await i.client.query('CREATE EXTENSION IF NOT EXISTS plpgsql_check');
      assert.equal(await value(i.client,"SELECT current_setting('plpgsql_check.profiler') value"),'on');
      assert.equal(await value(i.client,"SELECT current_setting('plpgsql_check.use_lxcache') value"),'off');
      await i.client.query('SELECT plpgsql_profiler_reset_all()');
    }
    await group('preservation missing approval exact replay conflicting replay and bounded ledger',async()=>{
      for(const i of nodes){
        const held=i.roles.management_hold;
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('missing','none') value")).status,'INVALID');
        for(const scope of ['native-preserve','native-limit'])await i.client.query(`INSERT INTO retention9d.resources(scope,category,identity,commitment,terminal,payload_present,disposition,observed_at)
          VALUES($1,'pipeline-advisory',$1,$2,true,true,'MINIMIZE_PAYLOAD',clock_timestamp())`,[scope,digest(scope)]);
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('native-preserve',NULL) value")).status,'INVALID');
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('native-preserve','missing') value")).status,'APPROVAL_REQUIRED');
        for(const [ref,scope]of [['native-ref','native-preserve'],['other-ref','native-preserve'],['limit-ref','native-limit']])await i.client.query('INSERT INTO retention9d.hold_approvals VALUES($1,$2,false,true)',[ref,scope]);
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('native-preserve','native-ref') value")).status,'PRESERVED');
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('native-preserve','native-ref') value")).status,'PRESERVED');
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('native-preserve','other-ref') value")).status,'REVIEW_REQUIRED');
        await i.client.query('UPDATE retention9d.configuration SET max_operations=1');
        assert.equal((await value(held,"SELECT retention9d.preserve_remaining('native-limit','limit-ref') value")).status,'OPERATION_LIMIT');
        await i.client.query('UPDATE retention9d.configuration SET max_operations=1000');
      }
    });
    await group('barrier unchanged update missing barrier permitted and unsafe clearing rejected',async()=>{
      for(const i of nodes){
        await i.client.query("UPDATE retention9d.resources SET observed_at=clock_timestamp() WHERE scope IN('native-preserve','native-limit')");
        await assert.rejects(i.client.query("UPDATE retention9d.resources SET held=false WHERE scope='native-preserve'"),{code:'55000'});
        assert.equal(await value(i.client,"SELECT held value FROM retention9d.resources WHERE scope='native-preserve'"),true);
      }
    });
    await group('empty alert cursor valid queue duplicate and hard ledger refusal',async()=>{
      for(const i of nodes){
        const op=i.roles.management_operator;
        assert.equal(await value(op,'SELECT capacity9d.queue_alerts() value'),0);
        assert.equal(await value(op,"SELECT capacity9d.claim_alert('native',$1) value",[randomUUID()]),null);
        await i.client.query("SELECT capacity9d.signal('NATIVE_ALERT','CRITICAL')");
        assert.equal(await value(op,'SELECT capacity9d.queue_alerts() value'),1);
        assert.equal(await value(op,'SELECT capacity9d.queue_alerts() value'),0);
        await i.client.query('UPDATE capacity9d.configuration SET max_operations=1');
        await i.client.query("SELECT capacity9d.signal('NATIVE_OVERFLOW','CRITICAL')");
        assert.equal(await value(op,'SELECT capacity9d.queue_alerts() value'),0);
        assert.equal(await value(i.client,"SELECT count(*)::int value FROM capacity9d.signals WHERE reason='ALERT_LEDGER_LIMIT'"),1);
        await i.client.query('UPDATE capacity9d.configuration SET max_operations=1000');
      }
    });
    await group('invalid claims token destination valid receipt and duplicate acknowledgement',async()=>{
      for(const i of nodes){
        const op=i.roles.management_operator;
        assert.equal(await value(op,'SELECT capacity9d.claim_alert(NULL,$1) value',[randomUUID()]),null);
        const token=randomUUID(),item=await value(op,"SELECT capacity9d.claim_alert('native',$1) value",[token]);
        assert.equal(await value(op,"SELECT capacity9d.finish_alert($1,$2,'native',NULL) value",[item.id,token]),false);
        assert.equal(await value(op,"SELECT capacity9d.finish_alert($1,$2,'foreign','receipt') value",[item.id,token]),false);
        assert.equal(await value(op,"SELECT capacity9d.finish_alert($1,$2,'native','receipt') value",[item.id,token]),true);
        assert.equal(await value(op,"SELECT capacity9d.finish_alert($1,$2,'native','receipt') value",[item.id,token]),false);
        assert.equal(await value(i.client,'SELECT state value FROM capacity9d.alert_delivery WHERE id=$1',[item.id]),'DELIVERED');
      }
    });
    await group('raw native trees statement and branch numerators denominators reconcile',async()=>{
      for(const i of nodes)w.native.push({node:i.node,version:await value(i.client,'SELECT version() value'),
        extension:await value(i.client,"SELECT extversion value FROM pg_extension WHERE extname='plpgsql_check'"),
        cache:await value(i.client,"SELECT current_setting('plpgsql_check.use_lxcache') value"),routines:await managementNative(i.client)});
    });
    success=true;w.status='PASS';
  }finally{
    w.status??='FAILED';
    await writeFile(join(process.env.CUSTODY_OUTPUT,'management-native-'+(success?'witness-':'failed-')+randomUUID()+'.json'),JSON.stringify(w,null,2),{flag:'wx'});
    await f.close();
  }
});
