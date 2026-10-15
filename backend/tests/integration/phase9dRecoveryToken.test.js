import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {recoveryFixture} from '../helpers/phase9dRecoveryFixture.js';
import {brokerCall,executeBrokerAttempt} from '../../../tools/phase9d/broker-execution.mjs';
test('duplicate observation must retain exact actor and attempt token admission',async()=>{
  const f=await recoveryFixture(1);
  try{
    await f.reset();const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid');assert.equal(observed.status,'RESPONSE_OBSERVED');const before=await f.row(observed.id),response=before.attempt.response;
    for(const token of [randomUUID(),null])assert.equal(await brokerCall(f.exec,'observe',[observed.id,token,response]),false);
    assert.equal(await brokerCall(f.b,'observe',[observed.id,observed.token,response]),false);
    assert.equal(await brokerCall(f.exec,'observe',[observed.id,observed.token,response]),true);
    assert.deepEqual(await f.row(observed.id),before);await f.unchanged();
  }finally{await f.close();}
});
