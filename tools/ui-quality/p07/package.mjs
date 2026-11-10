import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const out='output/handoff/P07-2026-10-29';
const reports=JSON.parse(fs.readFileSync(out+'/deliverables.json')).reports;
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name).replaceAll('\\','/')]);
const rootEvidence=fs.readdirSync(out).filter(f=>/\.(json|png|txt)$/.test(f)&&!['package-inputs.json','manifest.json','publication.json','uploaded-files.json','doc-before.json'].includes(f)).map(f=>out+'/'+f);
const files=[...new Set([...rootEvidence,...walk(out+'/matrix'),...walk(out+'/matrix-language-attempt'),...reports,...walk('tools/ui-quality/p07'),
  'tools/ui-quality/coverage/master-ui-coverage.csv','tools/ui-quality/coverage/registered-surfaces.json','tools/ui-quality/coverage/issues.json','docs/ui-quality/component-consistency-inventory.json'])].sort();
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(out+'/package-inputs.json',JSON.stringify({files:files.map(file=>({file,sha256:sha(file),bytes:fs.statSync(file).size})),excluded:'Vite cache, empty-env, raw runtime logs, .env and credentials; no real data. Failed-attempt JSON/PNGs retained where listed; earlier interrupted animation directory remains local.'},null,2));
const r=spawnSync('python',['-c','import json,sys,zipfile; d=json.load(open(sys.argv[1],encoding="utf-8")); z=zipfile.ZipFile(sys.argv[2],"w",compression=zipfile.ZIP_DEFLATED); [z.write(x["file"],x["file"]) for x in d["files"]]; z.write(sys.argv[1],sys.argv[1]); z.close()',out+'/package-inputs.json',out+'/P07-evidence.zip'],{encoding:'utf8'});
if(r.status!==0)throw new Error(r.stderr||'zip failed');
console.log(JSON.stringify({files:files.length,zipBytes:fs.statSync(out+'/P07-evidence.zip').size,zipSha256:sha(out+'/P07-evidence.zip')}));
