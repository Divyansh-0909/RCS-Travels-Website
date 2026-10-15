import assert from 'node:assert/strict';
import {verificationRegistry} from './closure-keys.mjs';
// Only the trusted custodian operator holds this client. Validate before mutation.
export async function rotateCustodyKey(client,{keyId,publicKey,expectedEpoch}){
  verificationRegistry([{keyId,publicKey,status:'ACTIVE'}]);
  assert.ok(Number.isSafeInteger(expectedEpoch)&&expectedEpoch>0);
  const result=await client.query('SELECT custody.rotate($1,$2,$3) accepted',[keyId,publicKey,expectedEpoch]);
  assert.equal(result.rows[0].accepted,true);return keyId;
}
