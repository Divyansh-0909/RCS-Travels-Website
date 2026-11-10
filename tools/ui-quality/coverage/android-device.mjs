import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { physicalDevice } from '../../phase9-native/device.mjs';
import { captureNativeHierarchy } from '../../../backend/tests/helpers/phase9NativeHierarchy.mjs';
import { readJson, atomicJson, hash } from '../../handoff/core.mjs';

export const directory='output/handoff/p05-android-followup-2026-10-23';
const out=path.join(directory,'artifacts'),pkg='com.rcstravels.driver.phase9',execute=promisify(execFile);
const baseline=readJson(path.join(directory,'product-source-before.json'));
assert(baseline.every(f=>hash(fs.readFileSync(f.file))===f.sha256),'Product source must remain unchanged');
const identity=readJson('output/handoff/native-preview-session/native-source-identities.json');
for(const f of baseline.filter(f=>f.file.startsWith('driver-app/'))){
  assert.equal(hash(fs.readFileSync(path.join(identity.runtimeApp,f.file.slice('driver-app/'.length)))),f.sha256,'Actual staged native source differs: '+f.file);
}
const device=await physicalDevice(),proof={phase:'P05',kind:'ANDROID_CONNECTED_FOLLOWUP',at:new Date().toISOString(),package:pkg,scope:'Read-only navigation/reachability and actual native hierarchy/screenshots; no comprehensive screen audit, business journey or spoken TalkBack',checks:[],screenshots:[],protectedSourceFiles:baseline.length};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const decode=x=>x.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const nodes=xml=>[...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])])));
async function gate(){
  const fixture=readJson('output/handoff/native-fixture.json');
  assert(fixture.active&&Date.now()-Date.parse(fixture.at)<15000,'Fresh isolated fixture required');
  assert.equal(fixture.package,pkg);
  assert.match(await device.adb('shell','dumpsys','activity','activities'),/(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//,'Only the foreground isolated test app may be controlled');
}
async function tree(){await gate();return nodes(await captureNativeHierarchy(device));}
const label=n=>n['content-desc']||n.text||'';
function control(list,name){return list.find(n=>n.clickable==='true'&&(label(n)===name||label(n).startsWith(name+',')));}
async function tap(name){
  assert(['Home','Market','Rides','Account','Appearance','Language','Legal'].includes(name),'Section navigation only');
  const n=control(await tree(),name);assert(n,'Visible native section control required: '+name);
  const [l,t,r,b]=n.bounds.match(/-?\d+/g).map(Number);assert(r>l&&b>t);
  await gate();await device.adb('shell','input','tap',String(Math.round((l+r)/2)),String(Math.round((t+b)/2)));await pause(900);
}
async function back(){await gate();await device.adb('shell','input','keyevent','KEYCODE_BACK');await pause(700);}
async function screenshot(name){
  await gate();const {stdout}=await execute('C:/Android/platform-tools/adb.exe',['-s',device.serial,'exec-out','screencap','-p'],{encoding:'buffer',windowsHide:true,timeout:10000,maxBuffer:8*1024*1024});await gate();
  assert.equal(stdout.toString('hex',0,8),'89504e470d0a1a0a');fs.writeFileSync(path.join(out,name+'.png'),stdout);proof.screenshots.push(name+'.png');
  return {width:stdout.readUInt32BE(16),height:stdout.readUInt32BE(20)};
}
async function observe(ids,name,{active,required=[]}={}){
  await pause(700);await gate();const xml=await captureNativeHierarchy(device),list=nodes(xml),labels=list.map(label).filter(Boolean);
  for(const text of required)assert(labels.some(l=>l===text||l.startsWith(text+',')),'Native content required: '+text);
  if(active){for(const tab of ['Home','Market','Rides','Account']){const n=control(list,tab);assert(n,'Named tab required: '+tab);assert.equal(n.selected,String(tab===active),'Actual active tab: '+tab);}}
  fs.writeFileSync(path.join(out,name+'.xml'),xml);const size=await screenshot(name);
  const check={ids,name,status:'PASS',...size,activeTab:active||null,labels,errorContent:labels.filter(l=>/can.t load|couldn.t|try again|something went wrong/i.test(l)),level:'NATIVE_NAVIGATION_REACHABILITY_ONLY'};
  proof.checks.push(check);console.log(JSON.stringify({name,ids,status:'PASS',errorContent:check.errorContent}));return check;
}
async function reveal(name){
  for(let attempt=0;attempt<5;attempt++){
    const {width=1080,height=2400}=readJson('output/handoff/native-screen.json',{});
    const n=control(await tree(),name);
    if(n&&Number(n.bounds.match(/-?\d+/g)[3])<height*.8)return;
    await gate();await device.adb('shell','input','swipe',String(Math.round(width*.93)),String(Math.round(height*.81)),String(Math.round(width*.93)),String(Math.round(height*.48)),'700');await pause(700);
  }
  throw Error('Section control not discoverable by bounded scroll: '+name);
}
async function revealTabs(){
  const {width=1080,height=2400}=readJson('output/handoff/native-screen.json',{});
  await gate();await device.adb('shell','input','swipe',String(Math.round(width*.5)),String(Math.round(height*.4)),String(Math.round(width*.5)),String(Math.round(height*.65)),'700');await pause(900);
}
let exitCode=1;
try{
  const initialLabels=(await tree()).map(label);
  if(initialLabels.includes('Use device setting')||initialLabels.includes('Hinglish'))await back();
  await revealTabs();
  for(const [tab,id]of [['Home','A.HOME'],['Market','A.MARKET'],['Rides','A.RIDES'],['Account','A.ACCOUNT']]){
    await tap(tab);await observe([id],'P05-android-'+tab.toLowerCase(),{active:tab});
  }
  await reveal('Appearance');await tap('Appearance');
  await observe(['A.ACCOUNT.APPEARANCE'],'P05-android-appearance',{required:['Use device setting','Light','Dark']});await back();
  await reveal('Language');await tap('Language');
  await observe(['A.ACCOUNT.LANGUAGE'],'P05-android-language',{required:['English','Hinglish']});await back();
  await reveal('Legal');await tap('Legal');
  await observe(['A.LEGAL'],'P05-android-legal',{required:['Legal']});await back();
  await revealTabs();
  await observe(['A.ACCOUNT'],'P05-android-account-return',{active:'Account'});
  assert(baseline.every(f=>hash(fs.readFileSync(f.file))===f.sha256),'Product source changed during verification');
  proof.status='PASS';proof.productSourceUnchanged=true;exitCode=0;
}catch(error){proof.status='FAIL';proof.failure=error.message.replaceAll(device.serial,'[device-serial-redacted]');throw error;}
finally{
  proof.completedAt=new Date().toISOString();atomicJson(path.join(out,'P05-android-device-verification.json'),proof);
  const file=path.join(directory,'checks.json');atomicJson(file,[...readJson(file,[]),{command:'node tools/ui-quality/coverage/android-device.mjs',exitCode,scope:proof.scope,at:new Date().toISOString()}]);
}
