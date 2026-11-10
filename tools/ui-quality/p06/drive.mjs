import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {Google} from '../../handoff/google.mjs';import {config} from '../../handoff/config.mjs';import {readJson,atomicJson,hash} from '../../handoff/core.mjs';
export const run=readJson('output/handoff/state.json').run,out=path.join(run.directory,'artifacts'),receiptFile=path.join(run.directory,'publication.json');assert.equal(run.phase,'P06');
export const google=new Google(config),receipt=readJson(receiptFile,{phase:'P06',runId:run.id,promptHash:run.hash,artifacts:[]});
assert(!receipt.docVerified,'P06 review checkpoint is already published; preserve the verified files');
let folder=receipt.evidenceFolder;
if(folder){folder=await google.metadata(folder.id);assert(folder.parents?.includes(config.folderId)&&folder.name==='P06-evidence');}
else{
  const q="'"+config.folderId+"' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='P06-evidence'";
  const matches=await google.request('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id)&pageSize=100');
  const id=matches.files[0]?.id||(await google.request('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'P06-evidence',mimeType:'application/vnd.google-apps.folder',parents:[config.folderId]})})).id;
  folder=await google.metadata(id);assert(folder.parents.includes(config.folderId));
}
receipt.evidenceFolder={id:folder.id,url:folder.webViewLink};atomicJson(receiptFile,receipt);
const evidence=new Google({...config,folderId:folder.id});evidence.token=(...args)=>google.token(...args);
const types={'.md':'text/markdown','.csv':'text/csv','.json':'application/json','.png':'image/png'};
const secret=/-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
export async function upload(name,kind='evidence'){
  assert.equal(path.basename(name),name);const file=path.join(out,name),bytes=fs.readFileSync(file),mime=types[path.extname(name)];assert(mime&&bytes.length<30*1024*1024);
  if(mime!=='image/png')assert(!secret.test(bytes.toString()),'Potential credential in artifact: '+name);
  const client=kind==='report'?google:evidence,digest=hash(bytes),existing=receipt.artifacts.find(a=>a.name===name&&a.sha256===digest&&a.kind===kind);
  const result=existing?await client.verifyArtifact(existing.id):await client.upload(file,run.id,mime);
  assert.equal(result.sha256,digest);const artifact={...result,kind};receipt.artifacts=[...receipt.artifacts.filter(a=>a.name!==name),artifact];atomicJson(receiptFile,receipt);console.log('Verified P06 '+kind+': '+name);return artifact;
}
