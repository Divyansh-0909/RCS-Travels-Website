import assert from 'node:assert/strict';
import {createPublicKey} from 'node:crypto';
import {canonical,keyIdentity,signReceipt,verifyReceipt} from './custody-protocol.mjs';
export function verificationRegistry(rows){
  const keys=new Map(),statuses=new Map();
  for(const row of rows){
    const key=createPublicKey(row.publicKey);assert.equal(key.asymmetricKeyType,'ed25519');assert.equal(keyIdentity(key),row.keyId);
    assert.ok(['ACTIVE','RETIRED','COMPROMISED'].includes(row.status));assert.ok(!keys.has(row.keyId));
    keys.set(row.keyId,key);statuses.set(row.keyId,row.status);
  }
  return {keys,statuses};
}
export function historicalVerification(receipt,event,registry){
  const body=verifyReceipt(receipt,event,registry.keys),status=registry.statuses.get(body.keyId);
  assert.ok(status,'UNKNOWN_SIGNER');
  return {body,signatureValid:true,signerStatus:status,currentlyTrusted:status!=='COMPROMISED',currentlyIssuing:status==='ACTIVE'};
}
export async function durableReceipt(signer,body,privateKeys){
  const state=(await signer.query('SELECT custody.signable($1) state',[body.receipt])).rows[0].state;
  assert.ok(state,'UNCOMMITTED_RECEIPT');assert.equal(canonical(state.body),canonical(body));
  if(state.signature!==null)return {body,signature:state.signature};
  assert.equal(state.signerStatus,'ACTIVE','SIGNER_NOT_ISSUING');
  const privateKey=privateKeys.get(body.keyId);assert.ok(privateKey,'SIGNER_EPOCH_UNAVAILABLE');
  assert.equal(keyIdentity(createPublicKey(privateKey)),body.keyId,'SIGNER_KEY_MISMATCH');
  const receipt=signReceipt(body,privateKey);
  const signature=(await signer.query('SELECT custody.store_signature($1,$2) signature',[body.receipt,receipt.signature])).rows[0].signature;
  assert.equal(signature,receipt.signature);return receipt;
}
