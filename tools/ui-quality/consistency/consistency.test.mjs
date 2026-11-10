import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {viewerHandler} from '../../handoff/viewer-server.mjs';import {families,previewOccurrence} from './catalog.mjs';import {catalogRevision,validateChoice} from './server.mjs';
const choice=(extra={})=>({familyId:'VC-B01-ACTIONS',choice:'A',screenIds:['W.BOOKING.ROUTE'],note:'Only the displayed route action',revision:0,catalogRevision,...extra});
test('choices bind one shown family, explicit screen subset and current catalog; nothing is implemented',()=>{
  assert.equal(validateChoice(choice()).implementationStatus,'NOT_CHANGED');
  for(const change of [{familyId:'unknown'},{screenIds:['W.HOME']},{screenIds:[]},{screenIds:['W.BOOKING.ROUTE','W.BOOKING.ROUTE']},{choice:'EXECUTE'},{catalogRevision:'stale'},{choice:'CUSTOM',note:''},{note:'x'.repeat(2001)},{revision:-1}])assert.equal(validateChoice(choice(change)),null);
  assert.equal(validateChoice(choice({choice:'CUSTOM',note:'Preserve all three purposes'})).ownerDecision,'OWNER_SELECTED');
});
test('comparison fixtures have a finite occurrence allowlist and supported preferences',()=>{
  assert.equal(families.flatMap(item=>item.occurrences).length,8);assert.equal(previewOccurrence('VCB01_PICKUP','dark').route,'/book');
  for(const id of ['../../.env','https://example.com','VCB01_UNKNOWN'])assert.equal(previewOccurrence(id),null);
  assert.equal(previewOccurrence('VCB01_PICKUP','arbitrary'),null);
});
test('review choices require same origin, reject stale updates and preserve excluded screens plus revision history',async()=>{
  const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'rcs-consistency-')),config={root:process.cwd(),runtime,port:0},server=http.createServer(viewerHandler(config,{state:{}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.port=server.address().port;const url='http://127.0.0.1:'+config.port;
  const post=(body,origin=url)=>fetch(url+'/api/consistency/decision',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await post(choice(),'https://external.example')).status,403);
    assert.equal((await fetch(url+'/api/consistency/decision',{method:'POST',body:'{}'})).status,403);
    assert.equal((await post(choice({note:'x'.repeat(9000)}))).status,413);
    assert.equal((await post(choice({screenIds:['A.ACCOUNT']}))).status,400);
    const saved=await post(choice());assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.revision,1);assert.deepEqual(result.saved.screenIds,['W.BOOKING.ROUTE']);assert.equal(result.saved.implementationStatus,'NOT_CHANGED');
    assert.equal((await post(choice())).status,409);
    assert.equal((await post(choice({revision:1,choice:'VARIANTS'}))).status,200);
    const catalog=await(await fetch(url+'/api/consistency')).json();assert.equal(catalog.registry.history.length,2);assert.equal(catalog.registry.decisions.length,1);assert.equal(catalog.registry.decisions[0].choice,'VARIANTS');assert(catalog.families.every(item=>item.occurrences.every(o=>o.sourceLine>0)));
    assert.equal((await fetch(url+'/api/status',{method:'POST'})).status,405);
  }finally{await new Promise(resolve=>server.close(resolve));const file=path.join(runtime,'consistency-decisions.json');if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(runtime);}
});
