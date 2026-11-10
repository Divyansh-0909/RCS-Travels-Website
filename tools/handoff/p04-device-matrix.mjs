import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {physicalDevice} from '../phase9-native/device.mjs';import {readJson,atomicJson} from './core.mjs';
const run=readJson('output/handoff/state.json').run,out=path.join(run.directory,'artifacts/P04-evidence'), d=await physicalDevice(), execute=promisify(execFile);
const original={};for(const key of ['font_scale','accelerometer_rotation','user_rotation'])original[key]=(await d.adb('shell','settings','get','system',key)).trim();
atomicJson(path.join(out,'device-settings-before.json'),original);
const capture=async(name,...args)=>{await execute(process.execPath,['tools/handoff/p04-audit.mjs',name,...args],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});return readJson(path.join(out,name+'.json'));};
const proof={at:new Date().toISOString(),original,checks:[]};
try{
 await d.adb('shell','input','keyevent','61');const focus=await capture('keyboard-tab-focus');proof.checks.push({name:'hardware-Tab focus',focused:focus.nodes.filter(n=>n.focused==='true')});
 await d.adb('shell','settings','put','system','font_scale','1.3');await new Promise(r=>setTimeout(r,1400));
 await capture('font-130-top');const large=await capture('font-130-scrolled','swipe','540','1900','540','700','550');
 proof.checks.push({name:'font1.3 scroll',font:large.fontScale,appearance:large.nodes.find(n=>n.label.startsWith('Appearance,'))||null});
 await d.adb('shell','settings','put','system','accelerometer_rotation','0');await d.adb('shell','settings','put','system','user_rotation','1');await new Promise(r=>setTimeout(r,1000));
 await capture('rotation-request-landscape');const png=fs.readFileSync(path.join(out,'rotation-request-landscape.png'));proof.checks.push({name:'rotation',requested:'landscape',pngWidth:png.readUInt32BE(16),pngHeight:png.readUInt32BE(20),policy:'App configuration portrait; no unsupported orientation override'});
}finally{
 for(const [key,value] of Object.entries(original))await d.adb('shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));
 proof.restored={};for(const key of Object.keys(original))proof.restored[key]=(await d.adb('shell','settings','get','system',key)).trim();
 proof.restoredExactly=JSON.stringify(original)===JSON.stringify(proof.restored);atomicJson(path.join(out,'device-matrix.json'),proof);console.log(JSON.stringify(proof));
}
