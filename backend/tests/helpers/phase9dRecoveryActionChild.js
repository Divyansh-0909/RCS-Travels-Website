// Test-only controlled process. It has no application route or deployed entry point.
import assert from 'node:assert/strict';
import pg from 'pg';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
let client;
process.once('message',async configuration=>{
  try{
    const uri=new URL(configuration.connectionString);
    assert.ok(['127.0.0.1','localhost','[::1]'].includes(uri.hostname));assert.match(uri.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);assert.equal(uri.search,'');assert.equal(uri.hash,'');
    assert.ok(['broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'].includes(uri.username));
    assert.ok(['reserve','admit','begin_send','observe','recover','commit_result','reconcile','operate'].includes(configuration.routine));
    client=new pg.Client({connectionString:uri.toString(),statement_timeout:15000});client.on('error',()=>{});await client.connect();
    const {rows:[identity]}=await client.query('SELECT session_user actor,current_user effective,current_database() database,pg_backend_pid() pid');
    assert.equal(identity.actor,uri.username);assert.equal(identity.effective,uri.username);assert.equal(identity.database,uri.pathname.slice(1));
    process.send({status:'CONNECTED',pid:identity.pid});
    process.once('message',async message=>{
      try{assert.equal(message,'GO');const value=await brokerCall(client,configuration.routine,configuration.args);process.send({status:'DONE',value});}
      catch(error){process.send({status:'ERROR',code:error.code??'TEST_ACTION_FAILED'});process.exitCode=1;}
      finally{await client.end();process.disconnect();}
    });
  }catch{await client?.end();process.send({status:'FAILED_CLOSED'});process.exitCode=1;process.disconnect();}
});
