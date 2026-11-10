import assert from 'node:assert/strict';
import {createPrivateKey,createHash} from 'node:crypto';
import {closureSession} from '../../../tools/phase9d/closure-session.mjs';
import {durableReceipt} from '../../../tools/phase9d/closure-keys.mjs';
import {canonical,signReceipt} from '../../../tools/phase9d/custody-protocol.mjs';
// Disposable signer-only IPC. Credentials/private material are never logged.
process.once('message',async configuration=>{
  let client;
  try{
    assert.ok(['before-store','after-store','complete'].includes(configuration.mode));
    client=await closureSession(configuration.uri,'custody_signer');
    const keys=new Map(configuration.privateKeys.map(([id,pem])=>[id,createPrivateKey(pem)]));
    if(configuration.mode==='before-store'){
      const state=(await client.query('SELECT custody.signable($1) state',[configuration.body.receipt])).rows[0].state;
      assert.equal(state.signature,null);assert.equal(state.signerStatus,'ACTIVE');assert.equal(canonical(state.body),canonical(configuration.body));
      const signed=signReceipt(state.body,keys.get(state.body.keyId));
      process.send({status:'SIGNED_NOT_STORED',actor:'custody_signer',signatureHash:createHash('sha256').update(signed.signature).digest('hex')});return;
    }
    const receipt=await durableReceipt(client,configuration.body,keys);
    if(configuration.mode==='after-store'){process.send({status:'STORED_REPLY_WITHHELD',actor:'custody_signer',receiptId:receipt.body.receipt});return;}
    await client.end();process.send({status:'COMPLETE',actor:'custody_signer',receipt});process.disconnect();
  }catch(error){await client?.end();process.send({status:'FAILED_CLOSED',code:error.code??'SIGNER_CHILD_FAILED'});process.disconnect();process.exitCode=1;}
});
