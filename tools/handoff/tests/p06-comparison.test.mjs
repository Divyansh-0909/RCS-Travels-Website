import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {viewerHandler} from '../viewer-server.mjs';
test('P06 comparison serves only fixed owned screenshots and enforces phase, host, method and run-root bounds',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rcs-p06-preview-')),runtime=path.join(root,'output','handoff'),directory=path.join('output','handoff','runs','synthetic-run'),runRoot=path.join(root,directory),beforeDir=path.join(runRoot,'artifacts'),afterDir=path.join(runRoot,'fixes-2026-10-24','artifacts');fs.mkdirSync(beforeDir,{recursive:true});fs.mkdirSync(afterDir,{recursive:true});
  const before=path.join(beforeDir,'P06-B01-01-race-390.png'),after=path.join(afterDir,'P06-fix-B01-01-race-390.png');fs.writeFileSync(before,'synthetic-before');fs.writeFileSync(after,'synthetic-after');
  const config={root,runtime,port:0},engine={state:{run:{phase:'P06',directory}}},server=http.createServer(viewerHandler(config,engine));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.port=server.address().port;const url='http://127.0.0.1:'+config.port;
  try{
    const a=await fetch(url+'/p06-compare/before/P06-B01-01.png');assert.equal(a.status,200);assert.equal(a.headers.get('content-type'),'image/png');assert.equal(await a.text(),'synthetic-before');assert.equal(await(await fetch(url+'/p06-compare/after/P06-B01-01.png')).text(),'synthetic-after');
    for(const suffix of ['/p06-compare/before/P06-B01-05.png','/p06-compare/before/%2e%2e%2f.env','/p06-compare/before/P06-B01-01.json'])assert.equal((await fetch(url+suffix)).status,404);
    assert.equal((await fetch(url+'/p06-compare/before/P06-B01-01.png',{method:'POST'})).status,405);
    const forbidden=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:config.port,path:'/p06-compare/before/P06-B01-01.png',headers:{Host:'external.example'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);});assert.equal(forbidden,403);
    engine.state.run.phase='P05';assert.equal((await fetch(url+'/p06-compare/before/P06-B01-01.png')).status,404);engine.state.run.phase='P06';engine.state.run.directory='outside';assert.equal((await fetch(url+'/p06-compare/before/P06-B01-01.png')).status,403);
  }finally{
    await new Promise(resolve=>server.close(resolve));fs.unlinkSync(before);fs.unlinkSync(after);
    for(const dir of [afterDir,path.dirname(afterDir),beforeDir,runRoot,path.dirname(runRoot),runtime,path.dirname(runtime),root])fs.rmdirSync(dir);
  }
});
