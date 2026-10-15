import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createScheduledScenario} from '../../backend/tests/helpers/scheduledScenario.js';
export const replayEvents=['committed-driver-cancellation','export-stage','terminate-process','lease-121s','new-process-resume','duplicate-export','offline-frozen-v5','independent-review-gate','duplicate-worker'];
export async function prepareOutboxReplay({mode,path,output,sources}){
  if(mode==='record-replay'){
    const scenario=createScheduledScenario({now:'2026-10-13T00:00:00.000Z'}),id=randomUUID();
    const recipe={schema:'shadow-outbox-replay-v1',id,at:scenario.now.toISOString(),events:replayEvents,keyVersion:'synthetic-fixture-v1',
      initial:scenario.collections,journalIds:[randomUUID(),randomUUID(),randomUUID()],sources};
    const destination=join(output,'replay-input-'+id+'.json');await writeFile(destination,JSON.stringify(recipe,null,2),{flag:'wx'});return destination;
  }
  const selected=resolve(path);assert.equal(selected.startsWith(output+'\\'),true,'REPLAY_PATH_DENIED');
  const bytes=await readFile(selected);assert.ok(bytes.length<1048576,'REPLAY_OVERSIZE');const recipe=JSON.parse(bytes);
  assert.equal(recipe.schema,'shadow-outbox-replay-v1');assert.equal(recipe.keyVersion,'synthetic-fixture-v1');assert.equal(recipe.at,'2026-10-13T00:00:00.000Z');
  assert.deepEqual(recipe.events,replayEvents);assert.deepEqual(recipe.sources,sources,'REPLAY_SOURCE_DRIFT');
  assert.ok(recipe.journalIds.length===3&&recipe.journalIds.every(id=>/^[a-f0-9-]{36}$/.test(id)));
  return selected;
}
