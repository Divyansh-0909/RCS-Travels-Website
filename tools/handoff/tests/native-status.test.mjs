import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nativeStatus } from '../native-status.mjs';
import { atomicJson } from '../core.mjs';

test('device frames require connection, foreground app, live fixture and fresh capture', t => {
  const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'rcs-native-status-'));t.after(()=>fs.rmSync(runtime,{recursive:true,force:true}));
  const timestamp=Date.now(), at=new Date(timestamp).toISOString();
  fs.writeFileSync(path.join(runtime,'native-screen.png'),'test-only-image-presence');
  const meta={at,source:'DEVICE',connected:true,foreground:true,package:'com.rcstravels.driver.phase9',width:1080,height:2400};
  atomicJson(path.join(runtime,'native-fixture.json'),{active:true,at});
  atomicJson(path.join(runtime,'native-screen.json'),meta);
  assert.equal(nativeStatus(runtime,timestamp).live,true);
  assert.equal(nativeStatus(runtime,timestamp+15001).live,false);
  for(const replacement of [{connected:false},{foreground:false},{package:'another.app'}]){
    atomicJson(path.join(runtime,'native-screen.json'),{...meta,...replacement});assert.equal(nativeStatus(runtime,timestamp).live,false);
  }
  atomicJson(path.join(runtime,'native-screen.json'),meta);
  atomicJson(path.join(runtime,'native-fixture.json'),{active:false,at});
  assert.equal(nativeStatus(runtime,timestamp).status,'NO ACTIVE FIXTURE');
  assert.equal(nativeStatus(runtime,timestamp).interaction,'VIEW-ONLY');
  atomicJson(path.join(runtime,'native-fixture.json'),{active:true,at:new Date(timestamp-15001).toISOString()});
  assert.equal(nativeStatus(runtime,timestamp).live,false);
});
