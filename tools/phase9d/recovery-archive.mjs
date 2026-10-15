import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {hash} from './baseline.mjs';
const output='output/phase9d-broker-recovery-2026-10-14',directory=join(output,'historical-source','pre-acceptance-closure-'+Date.now());
await mkdir(directory,{recursive:true});const artifacts={};
for(const source of [output+'/manifest.json',output+'/acceptance-matrix.json',output+'/readiness-gates.json',output+'/continuation-state.json','docs/benchmarks/phase9d-broker-recovery-checkpoint-2026-10-14.md']){
  const bytes=await readFile(source),target=join(directory,source.split('/').at(-1));await writeFile(target,bytes,{flag:'wx'});artifacts[source]={copy:target,sha256:hash(bytes)};
}
await writeFile(output+'/acceptance-history.json',JSON.stringify({directory,artifacts},null,2));console.log(JSON.stringify({directory,artifacts:Object.keys(artifacts).length}));
