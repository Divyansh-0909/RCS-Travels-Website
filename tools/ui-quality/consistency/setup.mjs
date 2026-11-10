import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {readJson,atomicJson,hash} from '../../handoff/core.mjs';import {directory,batch} from './catalog.mjs';
fs.mkdirSync(path.join(directory,'artifacts'),{recursive:true});
const file=path.join(directory,'baseline.json');assert(!fs.existsSync(file),'Baseline already exists; retain it unchanged');
const original=readJson(path.join(readJson('output/handoff/state.json').run.directory,'product-source-before.json'));
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0);return r.stdout.trim();};
atomicJson(file,{batch,at:new Date().toISOString(),approval:'Owner explicitly said do it after reading the visual-consistency addendum. Bounded audit and reviewer tools authorized; no product treatment selected.',protectedFiles:original.map(item=>({file:item.file,sha256:hash(fs.readFileSync(item.file))})),coverageSha256:hash(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv')),head:git(['rev-parse','HEAD']),index:git(['ls-files','--stage'])});
console.log(JSON.stringify({batch,protectedFiles:original.length,status:'BASELINE_RECORDED'}));
