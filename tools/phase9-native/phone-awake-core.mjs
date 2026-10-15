import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from './stage.mjs';

const setting = 'stay_on_while_plugged_in';
export function awakeValue(previous) {
  assert.match(previous,/^(?:null|\d+)$/,'Unexpected Android awake setting');
  const value = previous === 'null' ? 0 : Number(previous);
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 2147483647,'Invalid Android awake flags');
  return String(value | 2);
}
export async function setUsbAwake(device,store,mode) {
  assert.ok(mode === 'enable' || mode === 'restore','Use enable or restore');
  let state = await store.read();
  const current = (await device.adb('shell','settings','get','global',setting)).trim();
  if (state?.active) {
    assert.equal(state.schema,'rcs-usb-awake-v1','Unknown awake state');
    assert.equal(awakeValue(state.previous),state.applied,'Invalid saved awake setting');
    assert.equal(hash(state.nonce + device.serial),state.deviceHash,'Awake state belongs to another device');
    if (state.phase === 'PREPARED' && current === state.previous) {
      await store.write({ ...state,active:false });
      if (mode === 'restore') return { enabled:false,changed:false };
    } else {
      assert.equal(current,state.applied,'Awake setting changed outside this script; preserving it');
      if (mode === 'enable') return { enabled:true,reused:true };
    }
  } else if (mode === 'restore') return { enabled:false,changed:false };
  if (mode === 'enable') {
    const nonce = randomUUID();
    state = { schema:'rcs-usb-awake-v1',active:true,phase:'PREPARED',nonce,deviceHash:hash(nonce + device.serial),
      previous:current,applied:awakeValue(current),at:new Date().toISOString() };
    await store.write(state);
    await device.adb('shell','settings','put','global',setting,state.applied);
    assert.equal((await device.adb('shell','settings','get','global',setting)).trim(),state.applied,'USB awake setting was not applied');
    await store.write({ ...state,phase:'APPLIED' });
    return { enabled:true,previous:state.previous,applied:state.applied };
  }
  if (state.previous === 'null') await device.adb('shell','settings','delete','global',setting);
  else await device.adb('shell','settings','put','global',setting,state.previous);
  assert.equal((await device.adb('shell','settings','get','global',setting)).trim(),state.previous,'Original awake setting was not restored');
  await store.write({ ...state,active:false,restoredAt:new Date().toISOString() });
  return { enabled:false,restored:true };
}
export function createFileStore(file) {
  return {
    async read() { try { return JSON.parse(await readFile(file,'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async write(state) {
      await mkdir(dirname(file),{ recursive:true });
      const temporary=file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary,JSON.stringify(state,null,2),{ flag:'wx' });
      await rename(temporary,file);
    },
  };
}
