import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createScheduledScenario} from '../../backend/tests/helpers/scheduledScenario.js';
export const brokerReplayEvents=['committed-driver-cancellation','sender-stage-crash','lease-121s','receiver-durable-lost-ack','receiver-process-replacement','retry-31s','sender-ack','duplicate-export','broker-request','provider-response-observed-ack-lost','broker-process-termination','lease-61s','unsafe-retry-denied','authenticated-usage-reconciliation','stale-result-denied','manual-terminal-disposition','terminal-payload-cleanup','late-duplicate-usage-receipt','duplicate-receiver-tombstone'];
export async function prepareBrokerReplay({mode,path,output,sources}){
  if(mode==='record-replay'){
    const scenario=createScheduledScenario({now:'2026-10-13T00:00:00.000Z'}),id=randomUUID();
    const recipe={schema:'shadow-broker-recovery-replay-v1',id,serviceId:randomUUID(),at:scenario.now.toISOString(),events:brokerReplayEvents,
      keyVersion:'synthetic-fixture-v1',initial:scenario.collections,journalIds:[randomUUID(),randomUUID(),randomUUID()],sources};
    const destination=join(output,'recovery-input-'+id+'.json');await writeFile(destination,JSON.stringify(recipe,null,2),{flag:'wx'});return destination;
  }
  const selected=resolve(path),name=relative(output,selected);
  assert.ok(!name.startsWith('..')&&!name.includes(':')&&name.endsWith('.json'),'REPLAY_PATH_DENIED');
  const bytes=await readFile(selected);assert.ok(bytes.length<1048576,'REPLAY_OVERSIZE');const recipe=JSON.parse(bytes);
  assert.equal(recipe.schema,'shadow-broker-recovery-replay-v1');assert.equal(recipe.keyVersion,'synthetic-fixture-v1');assert.equal(recipe.at,'2026-10-13T00:00:00.000Z');
  assert.deepEqual(recipe.events,brokerReplayEvents);assert.deepEqual(recipe.sources,sources,'REPLAY_SOURCE_DRIFT');
  assert.match(recipe.id,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(recipe.serviceId,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.ok(recipe.journalIds.length===3&&recipe.journalIds.every(id=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)));
  return selected;
}
