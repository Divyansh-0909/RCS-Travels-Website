import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {readJson,hash,atomicJson} from '../../handoff/core.mjs';import {run,out,receipt,upload} from './drive.mjs';
const baseline=readJson(path.join(run.directory,'product-source-before.json'));assert(baseline.every(f=>hash(fs.readFileSync(f.file))===f.sha256),'Product source changed');
const functional=readJson(path.join(out,'P06-functional-evidence.json')),matrix=readJson(path.join(out,'P06-responsive-accessibility-evidence.json')),controls=readJson(path.join(out,'P06-control-evidence.json')),viewer=readJson(path.join(out,'P06-viewer-verification.json'));
assert.equal(functional.status,'AUDIT_REPRODUCTIONS_COMPLETE');assert.equal(functional.findings.length,8);assert.equal(matrix.rows.length,30);assert.equal(controls.status,'PASS');assert.equal(viewer.status,'PASS');assert.equal(readJson(path.join(out,'P06-network-safety.json')).status,'PASS');
atomicJson(path.join(out,'P06-source-preservation.json'),{phase:'P06',at:new Date().toISOString(),unchanged:baseline.length,allUnchanged:true,files:baseline});
const files=['P06-functional-evidence.json','P06-responsive-accessibility-evidence.json','P06-control-evidence.json','P06-viewer-verification.json','P06-network-safety.json','P06-browser-trace.json','P06-source-preservation.json',...functional.screenshots,...matrix.screenshots,...controls.screenshots,...viewer.screenshots,'P06-functional-attempt1.json','P06-responsive-accessibility-evidence-attempt1.json','P06-control-evidence-attempt1.json','P06-browser-trace-attempt1.json'];
for(const name of [...new Set(files)])await upload(name);
console.log(JSON.stringify({evidenceReady:true,artifacts:receipt.artifacts.length,evidenceFolder:receipt.evidenceFolder.url}));
