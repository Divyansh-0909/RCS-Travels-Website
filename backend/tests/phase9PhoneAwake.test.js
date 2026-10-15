import test from 'node:test';
import assert from 'node:assert/strict';
import { awakeValue,setUsbAwake,createFileStore } from '../../tools/phase9-native/phone-awake-core.mjs';
import { mkdtemp,rm,writeFile,readFile,access } from 'node:fs/promises';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';

function fixture(previous) {
  let value=previous; let state=null;
  const actions=[];
  const store={ read:async () => state,write:async input => { state=input; } };
  const device={ serial:'SYNTHETICUSB',adb:async (...args) => {
    assert.deepEqual(args.slice(0,2),['shell','settings']);
    assert.equal(args[3],'global'); assert.equal(args[4],'stay_on_while_plugged_in');
    actions.push(args);
    if (args[2] === 'get') return value;
    if (args[2] === 'delete') value='null';
    else { assert.equal(args[2],'put'); value=args[5]; }
    return '';
  } };
  return { device,store,actions,get value() { return value; },get state() { return state; },change(input) { value=input; } };
}
test('USB awake preserves other charging flags and rejects malformed settings', () => {
  for (const [before,after] of [['0','2'],['1','3'],['2','2'],['4','6'],['7','7'],['null','2'],['2147483647','2147483647']]) assert.equal(awakeValue(before),after);
  for (const bad of ['','-1','x','1;unsafe','2147483648','9007199254740992']) assert.throws(() => awakeValue(bad));
  assert.throws(() => awakeValue(' 0'),/Unexpected Android awake setting/);
  assert.throws(() => awakeValue('2147483648'),/Invalid Android awake flags/);
});
test('USB awake saves before modifying, reuses its lease and restores the exact prior value', async () => {
  for (const previous of ['0','1','null']) {
    const f=fixture(previous);
    const write=f.store.write;
    f.store.write=async state => { assert.equal(f.value,state.phase === 'PREPARED' ? previous : state.applied); await write(state); };
    assert.equal((await setUsbAwake(f.device,f.store,'enable')).enabled,true);
    f.store.write=write;
    assert.equal(f.state.previous,previous); assert.equal(f.state.active,true);
    assert.equal(f.state.phase,'APPLIED');
    assert.equal(JSON.stringify(f.state).includes('SYNTHETICUSB'),false);
    const count=f.actions.filter(a => a[2] !== 'get').length;
    assert.deepEqual(await setUsbAwake(f.device,f.store,'enable'),{ enabled:true,reused:true });
    assert.equal(f.actions.filter(a => a[2] !== 'get').length,count);
    assert.deepEqual(await setUsbAwake(f.device,f.store,'restore'),{ enabled:false,restored:true });
    assert.equal(f.value,previous); assert.equal(f.state.active,false);
    if(previous === 'null') assert.ok(f.actions.some(a => a[2] === 'delete'));
    assert.deepEqual(await setUsbAwake(f.device,f.store,'restore'),{ enabled:false,changed:false });
  }
});

test('USB awake recovers a prepared request and rejects altered saved values before any write', async () => {
  for (const mode of ['restore','enable']) {
    const f=fixture('0');
    const adb=f.device.adb;
    f.device.adb=async (...args) => { if (args[2] === 'put') throw new Error('Controlled disconnect'); return adb(...args); };
    await assert.rejects(() => setUsbAwake(f.device,f.store,'enable'),/disconnect/);
    assert.equal(f.state.phase,'PREPARED'); assert.equal(f.value,'0');
    f.device.adb=adb;
    const prepared={...f.state}; const writes=f.actions.filter(a => a[2] !== 'get').length;
    const result=await setUsbAwake(f.device,f.store,mode);
    if(mode === 'restore') {
      assert.deepEqual(result,{enabled:false,changed:false});
      assert.deepEqual(f.state,{...prepared,active:false});
      assert.equal(f.actions.filter(a => a[2] !== 'get').length,writes);
    } else assert.equal(result.enabled,true);
  }
  const f=fixture('0'); await setUsbAwake(f.device,f.store,'enable');
  const count=f.actions.length;
  f.state.previous='0;unsafe';
  await assert.rejects(() => setUsbAwake(f.device,f.store,'restore'),/Unexpected/);
  assert.equal(f.actions.length,count+1); assert.equal(f.value,'2');
  f.state.previous='0';f.state.applied='7';
  await assert.rejects(() => setUsbAwake(f.device,f.store,'restore'),/Invalid saved awake setting/);
});

test('USB awake trims ADB replies and rejects prepared or applied manual changes', async () => {
  const f=fixture('0');const adb=f.device.adb;
  f.device.adb=async (...args) => args[2] === 'get' ? '\r\n'+await adb(...args)+'\r\n' : adb(...args);
  assert.deepEqual(await setUsbAwake(f.device,f.store,'enable'),{enabled:true,previous:'0',applied:'2'});
  assert.deepEqual(await setUsbAwake(f.device,f.store,'restore'),{enabled:false,restored:true});
  for(const phase of ['PREPARED','APPLIED']) {
    const g=fixture('0');await setUsbAwake(g.device,g.store,'enable');
    g.state.phase=phase;g.change(phase === 'PREPARED' ? '7':'0');
    const saved={...g.state};
    await assert.rejects(() => setUsbAwake(g.device,g.store,'restore'),/changed outside/);
    assert.deepEqual(g.state,saved);
  }
});

test('awake state file writes are atomic and malformed records remain errors', async t => {
  const directory=await mkdtemp(join(tmpdir(),'rcs-awake-unit-'));
  t.after(async () => { assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep)); await rm(directory,{ recursive:true,force:true }); });
  const file=join(directory,'nested/state.json'); const store=createFileStore(file);
  assert.equal(await store.read(),null);
  await store.write({ active:true }); assert.deepEqual(await store.read(),{ active:true });
  await store.write({ active:false }); assert.deepEqual(await store.read(),{ active:false });
  await writeFile(file,'invalid JSON'); await assert.rejects(() => store.read(),SyntaxError);
});
test('awake file store refuses colliding temporary files without overwriting them', async t => {
  const directory=await mkdtemp(join(tmpdir(),'rcs-awake-collision-'));
  t.after(async () => { assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep)); await rm(directory,{recursive:true,force:true}); });
  const file=join(directory,'state.json');const identity='217ad898-2a99-454e-ab79-82cfc583e182';
  const paths=[file+'.'+identity+'.tmp',file+identity+'.tmp',file+'.'+identity,file+identity];
  for(const path of paths)await writeFile(path,'untouched fixture');
  const original=crypto.randomUUID;
  try {
    crypto.randomUUID=()=>identity;syncBuiltinESMExports();
    await assert.rejects(() => createFileStore(file).write({active:true}),error => error.code === 'EEXIST');
  } finally {crypto.randomUUID=original;syncBuiltinESMExports();}
  for(const path of paths)assert.equal(await readFile(path,'utf8'),'untouched fixture');
  await assert.rejects(() => access(file));
});
test('USB awake preserves manual setting changes and refuses a different phone', async () => {
  const f=fixture('0');
  await setUsbAwake(f.device,f.store,'enable');
  await assert.rejects(() => setUsbAwake({ ...f.device,serial:'OTHERUSB' },f.store,'restore'),/another device/);
  f.change('7');
  await assert.rejects(() => setUsbAwake(f.device,f.store,'restore'),/changed outside/);
  assert.equal(f.value,'7');
  await assert.rejects(() => setUsbAwake(f.device,f.store,'invalid'),/enable or restore/);
});

test('USB awake requires confirmed writes and a valid saved schema', async () => {
  for (const mode of ['enable','restore']) {
    const f=fixture('0');
    if (mode === 'restore') await setUsbAwake(f.device,f.store,'enable');
    const adb=f.device.adb;
    let reads=0;
    f.device.adb=async (...args) => args[2] === 'get' && ++reads === 2 ? 'unexpected' : adb(...args);
    await assert.rejects(() => setUsbAwake(f.device,f.store,mode),/was not/);
  }
  const f=fixture('0'); await setUsbAwake(f.device,f.store,'enable');
  f.state.schema='unknown';
  await assert.rejects(() => setUsbAwake(f.device,f.store,'restore'),/Unknown awake state/);
});
