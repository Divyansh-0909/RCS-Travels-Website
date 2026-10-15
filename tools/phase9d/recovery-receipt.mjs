import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
export const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:1)):item);
// Fixture issuing authority only. Never imported by the broker execution child.
export function issueOfflineUsage(binding,usage,key){
  assert.equal(typeof key,'string');assert.ok(key.length>=32);
  assert.deepEqual(Object.keys(binding).sort(),['receiptId','requestId','attemptId','dispatchId','configurationHash','generation','responseHash'].sort());
  assert.deepEqual(Object.keys(usage).sort(),['outcome','input','output','minor'].sort());
  assert.ok(['SUCCESS','BILLED_FAILURE','NO_DISPATCH'].includes(usage.outcome));
  for(const name of ['input','output','minor'])assert.ok(Number.isSafeInteger(usage[name])&&usage[name]>=0&&usage[name]<=999999999);
  const body={schema:'offline-usage-v1',issuer:'independent-offline-provider',keyId:'offline-issuer-v1',
    frozen:'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75',provider:'typesafe-ai',model:'jev-1.13.0',...binding,...usage};
  return {body,mac:createHmac('sha256',key).update('offline-usage-v1\n'+canonical(body)).digest('hex')};
}
