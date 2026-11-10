import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {lstat,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
// Bounded metadata-only observations. Inspect neither file contents nor
// credentials, and reject links that could escape the owned artifact tree.
export async function artifactUsage(directory,{maxFiles=10000}={}){
  const pending=[resolve(directory)];let bytes=0,files=0;
  while(pending.length){
    const path=pending.pop(),s=await lstat(path);
    if(s.isSymbolicLink())throw Error('ARTIFACT_LINK_REFUSED');
    if(s.isDirectory()){for(const entry of await readdir(path))pending.push(join(path,entry));}
    else {if(++files>maxFiles)throw Error('ARTIFACT_INSPECTION_LIMIT');bytes+=s.size;}
  }
  return {bytes,files,measurement:'LOGICAL_FILE_BYTES_NOT_ALLOCATED_VOLUME_BLOCKS'};
}
export function ownedContainerStorage(id,ownership){
  assert.match(id,/^[a-f0-9]{64}$/);assert.ok(ownership.startsWith('closure-'));
  const command=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:10000});
  const inspected=JSON.parse(command(['inspect',id]))[0];assert.equal(inspected.Config.Labels['proofloop.owner'],ownership);
  const values=command(['exec',id,'du','-sk','/var/lib/postgresql/data','/tmp/custody-logs']).trim().split('\n').map(line=>Number(line.trim().split(/\s+/)[0])*1024);
  assert.ok(values.every(Number.isSafeInteger));
  return {container:id,ownership,pgdataAllocatedBytes:values[0],sanitizedLogDirectoryBytes:values[1],
    destination:'/var/lib/postgresql/data',volumeQuotaVerified:false,hostBackingLocation:'DOCKER_MANAGED_LOCATION_NOT_ATTESTED',
    coverage:'DU_BLOCKS_ARE_A_SEPARATE_MEASURE_NOT_ADDITIVE_TO_DATABASE_PLUS_WAL'};
}
