import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {physicalDevice} from '../phase9-native/device.mjs';import {readJson,atomicJson} from './core.mjs';
const s=readJson('output/handoff/state.json');assert.equal(s.run.phase,'P04');
const name=process.argv[2];assert.match(name,/^[a-z0-9-]{1,70}$/);
const out=path.join(s.run.directory,'artifacts/P04-evidence'), file=path.join(out,name+'.yaml');assert(fs.existsSync(file));
assert.match(fs.readFileSync(file,'utf8'),/^appId: com\.rcstravels\.driver\.phase9\r?\n/);
const fixture=readJson('output/handoff/native-fixture.json');assert(fixture.active&&Date.now()-Date.parse(fixture.at)<15000);
const device=await physicalDevice();assert.match(await device.adb('shell','dumpsys','activity','activities'),/(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//);
let output='',exitCode=1;
try{exitCode=await new Promise((resolve,reject)=>{const c=spawn('C:/Program Files/Java/jdk-17.0.2/bin/java.exe',['--enable-native-access=ALL-UNNAMED','-classpath','C:/maestro/lib/*','maestro.cli.AppKt','--device',device.serial,'test','--debug-output',out,'--test-output-dir',path.join(s.run.directory,'debug/maestro-artifacts'),file],{windowsHide:true});c.stdout.on('data',b=>{output+=b;});c.stderr.on('data',b=>{output+=b;});const timer=setTimeout(()=>{spawn('C:/Windows/System32/taskkill.exe',['/pid',String(c.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});},240000);c.once('error',e=>{clearTimeout(timer);reject(e);});c.once('close',code=>{clearTimeout(timer);resolve(code??1);});});}
finally{fs.writeFileSync(path.join(out,name+'.log'),output.replaceAll(device.serial,'[device-serial-redacted]'));const f=path.join(s.run.directory,'checks.json');atomicJson(f,[...readJson(f,[]),{command:'node tools/handoff/p04-maestro.mjs '+name,exitCode,scope:'Actual Maestro physical native Account/Appearance/tab/back flow',at:new Date().toISOString()}]);console.log(JSON.stringify({name,exitCode,log:name+'.log'}));}
process.exitCode=exitCode;
