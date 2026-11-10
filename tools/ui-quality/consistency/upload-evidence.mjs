import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {out,upload} from './publication.mjs';
for(const file of ['viewer-verification.json','quality.json','measurements.json','component-consistency-inventory.json','source-preservation.json','owner-approved-patterns.json'])assert(fs.existsSync(path.join(out,file)),'Missing completed evidence: '+file);
for(const name of fs.readdirSync(out).sort().filter(name=>/\.(png|json)$/.test(name)||name==='tool-tests.md'))await upload(name);
