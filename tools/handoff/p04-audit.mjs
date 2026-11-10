// P04 capture reuses the tested USB and private temporary hierarchy helpers.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {physicalDevice} from '../phase9-native/device.mjs';
import {captureNativeHierarchy} from '../../backend/tests/helpers/phase9NativeHierarchy.mjs';
import {readJson,atomicJson} from './core.mjs';
const execute=promisify(execFile), state=readJson('output/handoff/state.json');
assert.equal(state.run.phase,'P04');
const out=path.join(state.run.directory,'artifacts/P04-evidence');fs.mkdirSync(out,{recursive:true});
const [name='baseline',action,...args]=process.argv.slice(2);assert.match(name,/^[a-z0-9-]{1,80}$/);
let code=0;
try {
 const fixture=readJson('output/handoff/native-fixture.json');
 assert(fixture.active && Date.now()-Date.parse(fixture.at)<15000,'Fresh isolated fixture required');
 const device=await physicalDevice();
 const foreground=async()=>assert.match(await device.adb('shell','dumpsys','activity','activities'),/(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//);
 await foreground();
 if(action){
  assert(args.every(v=>/^\d{1,4}$/.test(v)),'Only bounded numeric inputs');
  if(action==='tap'){assert.equal(args.length,2);await device.adb('shell','input','tap',...args);}
  else if(action==='swipe'){assert.equal(args.length,5);await device.adb('shell','input','swipe',...args);}
  else if(action==='key'){assert.deepEqual(args,['4']);await device.adb('shell','input','keyevent','4');}
  else throw Error('Unsupported audit action');
  await new Promise(r=>setTimeout(r,900));
 }
 const xml=await captureNativeHierarchy(device);await foreground();
 const {stdout:png}=await execute('C:/Android/platform-tools/adb.exe',['-s',device.serial,'exec-out','screencap','-p'],{encoding:'buffer',windowsHide:true,timeout:10000,maxBuffer:8*1024*1024});
 await foreground();assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
 fs.writeFileSync(path.join(out,name+'.xml'),xml);fs.writeFileSync(path.join(out,name+'.png'),png);
 const nodes=[...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
 const report={name,at:new Date().toISOString(),package:'com.rcstravels.driver.phase9',source:'PHYSICAL USB DEVICE',model:(await device.adb('shell','getprop','ro.product.model')).trim(),size:(await device.adb('shell','wm','size')).trim(),density:(await device.adb('shell','wm','density')).trim(),fontScale:(await device.adb('shell','settings','get','system','font_scale')).trim(),nodes:nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds,clickable:n.clickable,class:n.class,focusable:n.focusable,focused:n.focused,selected:n.selected}))};
 atomicJson(path.join(out,name+'.json'),report);console.log(JSON.stringify({...report,nodes:report.nodes.filter(n=>/Appearance|System|Light|Dark|Home|Close|Account/.test(n.label||n.text))}));
}catch(e){code=1;console.error(e.message);}
finally{const f=path.join(state.run.directory,'checks.json');atomicJson(f,[...readJson(f,[]),{command:`node tools/handoff/p04-audit.mjs ${process.argv.slice(2).join(' ')}`,exitCode:code,scope:'Foreground isolated native app, bounded action, private hierarchy cleanup and PNG capture',at:new Date().toISOString()}]);}
process.exitCode=code;
