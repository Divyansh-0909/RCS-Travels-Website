import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve,relative} from 'node:path';
import {createScheduledScenario} from '../../backend/tests/helpers/scheduledScenario.js';
export const chronology=['commit-incident','scan-committed-lineage','outbox-transport','offline-broker','guard-and-usage','deliver-first','rotate-key','remote-commit-lost-ack','kill-sender','replace-and-reconcile','forged-and-conflicting-ack','server-permission-denial','independent-denial-delivery','stop','terminal-cleanup','reconcile-retained-commitments'];
export async function prepareCustodyReplay({path,output,sources}){
  if(!path){
    const initial=createScheduledScenario({now:'2026-10-13T00:00:00.000Z'});
    const recipe={schema:'custody-saved-input-v1',id:randomUUID(),at:initial.now.toISOString(),initial:initial.collections,
      journalIds:[randomUUID(),randomUUID(),randomUUID()],serviceId:randomUUID(),sourceId:randomUUID(),chronology,sources,
      signingEpochs:[1,2],keyMaterial:'fresh-disposable-per-reconstruction',provider:{fixture:'valid',input:128,output:32,minor:2},
      equivalence:'Generated database, request, attempt, dispatch, receipt, signing-key and backend-session identities are compared by verified relationships. Wall-clock commit time is excluded. Source initial rows, controlled clock, original journal identities, ordered actions, accounting and financial state must agree.'};
    const file=join(output,'custody-replay-input-'+recipe.id+'.json');await writeFile(file,JSON.stringify(recipe,null,2),{flag:'wx'});return file;
  }
  const file=resolve(path),inside=relative(output,file);assert.ok(!inside.startsWith('..')&&!inside.includes(':')&&inside.endsWith('.json'));
  const bytes=await readFile(file);assert.ok(bytes.length<=1048576);const recipe=JSON.parse(bytes);
  assert.equal(recipe.schema,'custody-saved-input-v1');assert.equal(recipe.at,'2026-10-13T00:00:00.000Z');
  assert.deepEqual(recipe.sources,sources,'REPLAY_SOURCE_DRIFT');assert.deepEqual(recipe.chronology,chronology);assert.deepEqual(recipe.signingEpochs,[1,2]);
  assert.deepEqual(recipe.provider,{fixture:'valid',input:128,output:32,minor:2});
  for(const id of [recipe.id,recipe.serviceId,recipe.sourceId,...recipe.journalIds])assert.match(id,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(recipe.journalIds.length,3);return file;
}
