import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
const output=resolve('output/phase9d-1-2026-10-12'),quality=join(tmpdir(),'rcs-phase1-quality-tools/node_modules');
const env={...process.env,RCS_QUALITY_SCOPED_FILES:'tools/phase9d/privacy.mjs,tools/phase9d/repository.mjs'};
const measure=spawnSync(process.execPath,['backend/tests/quality/measure.cjs','--coverage',join(output,'coverage/coverage-final.json'),'--output',join(output,'quality.json')],{env,windowsHide:true,stdio:'inherit'});assert.equal(measure.status,0);
const duplicates=spawnSync(process.execPath,[join(quality,'jscpd/run-jscpd.js'),'--min-lines','5','--min-tokens','50','--reporters','json','--output',join(output,'duplication'),'tools/phase9d/privacy.mjs','tools/phase9d/repository.mjs'],{windowsHide:true,stdio:'inherit'});assert.equal(duplicates.status,0);
