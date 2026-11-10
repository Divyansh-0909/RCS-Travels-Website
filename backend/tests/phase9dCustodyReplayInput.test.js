import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,unlink,rmdir,symlink} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCustodyReplayInput,validateCustodyReplayInput,saveCustodyReplayInput,loadCustodyReplayInput} from '../../tools/phase9d/closure-replay-input.mjs';
import {prepareCustodyReplay} from '../../tools/phase9d/audit-replay.mjs';
const sources={'tools/phase9d/closure-contract.mjs':'a'.repeat(64)};
test('custody saved inputs bind explicit initial state, identities, chronology and source epoch before database setup',()=>{
  const recipe=createCustodyReplayInput(sources);assert.equal(validateCustodyReplayInput(recipe,sources),recipe);
  for(const edit of [r=>{r.actions.reverse();},r=>{r.initial.bookings[0].id='invalid';},r=>{delete r.initial.customers;},r=>{r.journalIds[0]=r.id;},r=>{r.keyVersion='live';},r=>{r.usage.minor=3;},r=>{r.initial.bookings[0].extra='untrusted';},r=>{r.at='2026-10-15T00:00:00.000Z';},r=>{r.inputHash='0'.repeat(64);},r=>{r.extra=true;}]){
    const changed=structuredClone(recipe);edit(changed);assert.throws(()=>validateCustodyReplayInput(changed,sources));
  }
  assert.throws(()=>validateCustodyReplayInput(recipe,{'different.mjs':'b'.repeat(64)}),/REPLAY_SOURCE_DRIFT/);
});
test('custody replay input loader confines paths, enforces size and preserves saved state',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'rcs-custody-replay-input-'));let file;
  try{
    file=await saveCustodyReplayInput(directory,sources);const recipe=await loadCustodyReplayInput(file,directory,sources);assert.equal(recipe.schema,'custody-closure-replay-v1');
    assert.deepEqual(recipe,JSON.parse(await readFile(file,'utf8')));await assert.rejects(loadCustodyReplayInput(join(directory,'..','outside.json'),directory,sources));
    await writeFile(file,' '.repeat(1048577));await assert.rejects(loadCustodyReplayInput(file,directory,sources),/REPLAY_INPUT_LIMIT/);
    await writeFile(file,'malformed');await assert.rejects(loadCustodyReplayInput(file,directory,sources));
  }finally{if(file)await unlink(file);await rmdir(directory);}
});
test('custody replay rejects a directory junction escaping the approved output',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'rcs-custody-input-root-')),outside=await mkdtemp(join(tmpdir(),'rcs-custody-input-outside-'));
  const target=join(outside,'outside.json'),link=join(directory,'escape');let linked=false;
  try{await writeFile(target,'synthetic-private-marker',{flag:'wx'});await symlink(outside,link,process.platform==='win32'?'junction':'dir');linked=true;
    await assert.rejects(loadCustodyReplayInput(join(link,'outside.json'),directory,sources),/REPLAY_PATH_DENIED/);
  }finally{if(linked)await rmdir(link);await unlink(target);await rmdir(outside);await rmdir(directory);}
});

test('actual custody database replay loader confines resolved paths before admitting saved inputs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'rcs-custody-runner-input-')),outside=await mkdtemp(join(tmpdir(),'rcs-custody-runner-outside-'));
  const link=join(directory,'escape');let file,linked=false;
  try{
    file=await prepareCustodyReplay({output:outside,sources});
    assert.equal(await prepareCustodyReplay({path:file,output:outside,sources}),file);
    await symlink(outside,link,process.platform==='win32'?'junction':'dir');linked=true;
    await assert.rejects(prepareCustodyReplay({path:join(link,basename(file)),output:directory,sources}),/REPLAY_PATH_DENIED/);
    await assert.rejects(prepareCustodyReplay({path:file,output:directory,sources}),/REPLAY_PATH_DENIED/);
    assert.equal(await prepareCustodyReplay({path:join(link,basename(file)),output:link,sources}),file);
  }finally{if(linked)await rmdir(link);if(file)await unlink(file);await rmdir(directory);await rmdir(outside);}
});

test('actual custody public comparison rejects outside and junction observations before reading them',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'rcs-custody-comparison-root-')),outside=await mkdtemp(join(tmpdir(),'rcs-custody-comparison-outside-'));
  const target=join(outside,'observation.json'),link=join(directory,'escape');let linked=false;
  const compare=(output,path)=>spawnSync(process.execPath,[fileURLToPath(new URL('../../tools/phase9d/audit-replay-compare.mjs',import.meta.url)),path,path],{encoding:'utf8',env:{...process.env,CUSTODY_OUTPUT:output},timeout:10000});
  try{
    await writeFile(target,JSON.stringify({status:'OWNED_SYNTHETIC_OUTSIDE_OBSERVATION'}),{flag:'wx'});
    await symlink(outside,link,process.platform==='win32'?'junction':'dir');linked=true;
    for(const path of [join(link,'observation.json'),target]){
      const result=compare(directory,path);assert.equal(result.error,undefined);assert.notEqual(result.status,0);
      assert.match(result.stderr,/REPLAY_OBSERVATION_PATH_DENIED/);assert.doesNotMatch(result.stderr,/OWNED_SYNTHETIC_OUTSIDE_OBSERVATION/);
    }
    const admitted=compare(link,join(link,'observation.json'));assert.equal(admitted.error,undefined);
    assert.doesNotMatch(admitted.stderr,/REPLAY_OBSERVATION_PATH_DENIED/);assert.match(admitted.stderr,/ERR_ASSERTION/);
  }finally{if(linked)await rmdir(link);await unlink(target);await rmdir(outside);await rmdir(directory);}
});
