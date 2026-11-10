import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {Google} from '../../handoff/google.mjs';import {config} from '../../handoff/config.mjs';import {readJson,atomicJson,hash} from '../../handoff/core.mjs';import {batch,directory} from './catalog.mjs';
export const out=path.join(directory,'artifacts'),receiptFile=path.join(directory,'publication.json'),receipt=readJson(receiptFile,{batch,artifacts:[]}),google=new Google(config);
assert(!receipt.docVerified,'This audit was already published; retain the original checkpoint');
const name='Visual-consistency-B01-evidence',query=`'${config.folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${name}'`;
const existing=receipt.evidenceFolder||((await google.request('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(query)+'&fields=files(id)&pageSize=100')).files[0]);
const folder=await google.metadata(existing?.id||(await google.request('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[config.folderId]})})).id);
assert(folder.parents.includes(config.folderId));receipt.evidenceFolder={id:folder.id,url:folder.webViewLink};atomicJson(receiptFile,receipt);
const evidence=new Google({...config,folderId:folder.id});evidence.token=(...args)=>google.token(...args);
const types={'.json':'application/json','.md':'text/markdown','.csv':'text/csv','.png':'image/png'};
const secret=/-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
export async function upload(name,kind='evidence'){
  assert.equal(path.basename(name),name);const file=path.join(out,name),bytes=fs.readFileSync(file),mime=types[path.extname(name)];assert(mime&&bytes.length<16*1024*1024);
  if(mime!=='image/png')assert(!secret.test(bytes.toString()),'Potential credential in artifact');
  const client=kind==='report'?google:evidence,digest=hash(bytes),prior=receipt.artifacts.find(item=>item.name===name&&item.sha256===digest&&item.kind===kind);
  const artifact=prior?await client.verifyArtifact(prior.id):await client.upload(file,batch,mime);assert.equal(artifact.sha256,digest);const record={...artifact,kind};receipt.artifacts=[...receipt.artifacts.filter(item=>item.name!==name),record];atomicJson(receiptFile,receipt);console.log('Verified consistency '+kind+': '+name);return record;
}
