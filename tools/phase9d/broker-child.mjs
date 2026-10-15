import assert from 'node:assert/strict';
import {takeCoverage} from 'node:v8';
import {brokerSession} from './broker-session.mjs';
import {executeBrokerAttempt} from './broker-execution.mjs';
import {commitGuardedBrokerResult} from './broker-guard.mjs';
process.once('message',async message=>{
  let client;
  try {
    assert.ok(Buffer.byteLength(JSON.stringify(message))<=4096);
    assert.equal(message.protocol,'broker-execution-v1');
    assert.ok(['execute','guard'].includes(message.mode));
    const fields=message.mode==='execute'?['protocol','mode','connectionString','requestId','fixture','pauseAt']:['protocol','mode','connectionString','id','token','pauseAt'];
    assert.ok(Object.keys(message).every(key=>fields.includes(key)));
    assert.ok(message.pauseAt===undefined||['reserved','admitted','send','provider','observed','guarded','committed'].includes(message.pauseAt));
    client=await brokerSession(message.connectionString,message.mode==='execute'?'broker9d_exec':'broker9d_guard');
    const stage=(name,work)=>{
      if(message.pauseAt===name){process.send({status:'PAUSED',stage:name,id:work.id,token:work.token});return new Promise(()=>{});}
      return Promise.resolve();
    };
    const result=message.mode==='execute'?await executeBrokerAttempt(client,message.requestId,message.fixture,stage):
      await commitGuardedBrokerResult(client,message.id,message.token,stage);
    process.send(result);
  }catch{process.send({status:'FAILED_CLOSED'});}
  finally{await client?.end();takeCoverage();process.disconnect();}
});
process.send({status:'READY'});
