import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {createScheduledScenario} from '../../backend/tests/helpers/scheduledScenario.js';
export const custodyReplayActions=['commit-incident','export-and-receive','register-broker','execute-offline-provider','reconcile-usage','commit-independent-guard','capture-journals','deliver-first-receipt','rotate-key','commit-next-lost-ack','terminate-sender','restart-reconcile','reject-forged-receipts','observe-real-permission-denial','stop-and-clean','reconcile-retained-history'];
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clock='2026-10-12T16:00:00.000Z';
function exact(value,keys){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...keys].sort());}
export function createCustodyReplayInput(sources){
  const scenario=createScheduledScenario({now:clock});
  const input={schema:'custody-closure-replay-v1',id:randomUUID(),at:clock,actions:custodyReplayActions,initial:JSON.parse(JSON.stringify(scenario.collections)),
    journalIds:[randomUUID(),randomUUID(),randomUUID()],transportServiceId:randomUUID(),sourceIds:{broker:randomUUID(),source:randomUUID(),receiver:randomUUID(),observer:randomUUID()},
    fixtureVersion:'synthetic-scheduled-v1',keyVersion:'regenerate-ed25519-per-run-v1',usage:{outcome:'SUCCESS',input:128,output:32,minor:2},sources};
  return {...input,inputHash:digest(input)};
}
export function validateCustodyReplayInput(recipe,sources){
  exact(recipe,['schema','id','at','actions','initial','journalIds','transportServiceId','sourceIds','fixtureVersion','keyVersion','usage','sources','inputHash']);
  assert.equal(recipe.schema,'custody-closure-replay-v1');assert.equal(recipe.at,clock);assert.match(recipe.id,uuid);assert.match(recipe.transportServiceId,uuid);
  assert.equal(recipe.fixtureVersion,'synthetic-scheduled-v1');assert.equal(recipe.keyVersion,'regenerate-ed25519-per-run-v1');assert.deepEqual(recipe.actions,custodyReplayActions);
  assert.deepEqual(recipe.usage,{outcome:'SUCCESS',input:128,output:32,minor:2});assert.deepEqual(recipe.sources,sources,'REPLAY_SOURCE_DRIFT');
  for(const [file,value]of Object.entries(recipe.sources)){assert.ok(!isAbsolute(file)&&!file.includes('..')&&!file.includes('\\')&&!file.includes(':'));assert.match(value,hash);}
  exact(recipe.sourceIds,['broker','source','receiver','observer']);for(const id of Object.values(recipe.sourceIds))assert.match(id,uuid);
  assert.ok(Array.isArray(recipe.journalIds)&&recipe.journalIds.length===3);for(const id of recipe.journalIds)assert.match(id,uuid);
  const identities=[recipe.id,recipe.transportServiceId,...Object.values(recipe.sourceIds),...recipe.journalIds];assert.equal(new Set(identities).size,identities.length);
  const layout=createScheduledScenario({now:clock}).collections;exact(recipe.initial,Object.keys(layout));
  assert.ok(Buffer.byteLength(JSON.stringify(recipe.initial))<=131072,'REPLAY_INITIAL_STATE_LIMIT');
  for(const [name,rows]of Object.entries(recipe.initial)){
    assert.ok(Array.isArray(rows)&&rows.length===layout[name].length);
    rows.forEach((row,index)=>{exact(row,Object.keys(layout[name][index]));if(Object.hasOwn(row,'id'))assert.match(row.id,uuid);});
  }
  const {inputHash,...input}=recipe;assert.match(inputHash,hash);assert.equal(inputHash,digest(input),'REPLAY_INPUT_INTEGRITY');return recipe;
}
export async function saveCustodyReplayInput(output,sources){
  const recipe=createCustodyReplayInput(sources);validateCustodyReplayInput(recipe,sources);
  const file=join(output,'custody-input-'+recipe.id+'.json');await writeFile(file,JSON.stringify(recipe,null,2),{flag:'wx'});return file;
}
export async function loadCustodyReplayInput(file,output,sources){
  const selected=await realpath(resolve(file)),directory=await realpath(resolve(output)),name=relative(directory,selected);assert.ok(name&&!name.startsWith('..')&&!isAbsolute(name)&&name.endsWith('.json'),'REPLAY_PATH_DENIED');
  const bytes=await readFile(selected);assert.ok(bytes.length<=1048576,'REPLAY_INPUT_LIMIT');return validateCustodyReplayInput(JSON.parse(bytes),sources);
}
