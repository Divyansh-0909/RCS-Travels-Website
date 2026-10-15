import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { verifyLiveSession } from '../../backend/middleware/liveSession.js';
const output='output/phase9d-1-2026-10-12';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pub='pk_test_'+Buffer.from('load.clerk.accounts.dev$').toString('base64');
const identity={userId:'synthetic_load',sessionId:'sess_load',sessionClaims:{sub:'synthetic_load',sid:'sess_load',iss:'https://load.clerk.accounts.dev'}};
if(process.argv[2]==='replica') {
  process.env.CLERK_PUBLISHABLE_KEY=pub;
  process.once('message',async()=>{
    let calls=0,active=0,unavailable=0;
    // Sequential waves with concurrent callers. Parent advances the synthetic
    // provider window only after all four replicas report each wave.
    for(let wave=0;wave<20;wave++){
      const results=await Promise.all(Array.from({length:100},()=>verifyLiveSession(identity,async()=>{
        calls++;
        return new Promise((done,fail)=>{
          const id=calls;
          const handler=m=>{if(m.id!==id)return;process.off('message',handler);if(m.allowed)done({id:'sess_load',userId:'synthetic_load',status:'active'});else fail({status:429})};
          process.on('message',handler);process.send({lookup:true,id,wave});
        });
      })));
      active+=results.filter(r=>r==='active').length;unavailable+=results.filter(r=>r==='unavailable').length;
      await new Promise(done=>{const handler=m=>{if(m.next!==wave)return;process.off('message',handler);done()};process.on('message',handler);process.send({waveDone:wave})});
    }
    process.send({finished:true,calls,active,unavailable});process.disconnect();
  });
} else {
  await mkdir(output,{recursive:true});
  const sources=Object.fromEntries(await Promise.all(['tools/phase9d/load.mjs','backend/middleware/liveSession.js','driver-app/src/hooks/useOffers.tsx','frontend/src/lib/trackingPoll.js','driver-app/src/lib/locationTask.ts'].map(async p=>[p,hash(await readFile(p))])));
  const replicas=[],finished=[],waveCounts=new Map();let providerCalls=0,quotaDenials=0;
  const inherited=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  await Promise.all(Array.from({length:4},()=>new Promise((done,fail)=>{
    const child=fork(import.meta.filename,['replica'],{env:inherited,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});replicas.push(child);
    child.on('message',m=>{
      if(m.lookup){providerCalls++;const allowed=m.wave<10;if(!allowed)quotaDenials++;child.send({id:m.id,allowed})}
      if(Number.isInteger(m.waveDone)){const n=(waveCounts.get(m.waveDone)??0)+1;waveCounts.set(m.waveDone,n);if(n===4)for(const c of replicas)c.send({next:m.waveDone})}
      if(m.finished){finished.push(m)}
    });
    child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error('synthetic replica failure')));child.send({start:true});
  })));
  assert.equal(providerCalls,8000);assert.equal(finished.reduce((n,r)=>n+r.calls,0),8000);
  assert.equal(finished.reduce((n,r)=>n+r.active,0),4000);assert.equal(quotaDenials,4000);
  process.env.CLERK_PUBLISHABLE_KEY=pub;
  const stalled=[];const pending=Array.from({length:100},()=>verifyLiveSession(identity,()=>new Promise(done=>stalled.push(done)),5));
  assert.equal(await verifyLiveSession(identity,async()=>assert.fail('saturated guard must not call provider')), 'unavailable');
  assert.ok((await Promise.all(pending)).every(r=>r==='unavailable'));
  assert.equal(await verifyLiveSession(identity,async()=>assert.fail('timed-out SDK calls retain slots')),'unavailable');
  stalled.forEach(done=>done({id:'sess_load',userId:'synthetic_load',status:'active'}));
  await new Promise(done=>setImmediate(done));
  assert.equal(await verifyLiveSession(identity,async()=>({id:'sess_load',userId:'synthetic_load',status:'active'})),'active');
  const scenarios=[100,1000,10000].map(captains=>({
    captains,trackingCustomers:captains,locationCadenceSeconds:10,
    assumption:'online offers 2s plus measured baseline 354ms; tracking 5s plus 354ms; location 10s is a stress assumption, not a measured OS cadence',
    lookupRps:Math.round(captains/(2+.354)+captains/(5+.354)+captains/10),
    steadyExpectedOutstandingAtMedian:Math.round((captains/(2+.354)+captains/(5+.354)+captains/10)*.354),
    sharedInstanceGeneralBudgetRps:100,
    otherBackendApiTrafficIncluded:false
  }));
  const record={schema:'phase9d-synthetic-auth-load-v1',status:'PASS',sources,replicas:4,syntheticProviderCalls:providerCalls,quotaDenials,results:finished,
    stalledCallerDeadlineTestMs:5,productionCallerDeadlineMs:2500,stalledSlotsRetained:true,scenarios,
    liveProviderCalls:0,productionLatencyMeasured:false,productionTrafficMeasured:false,
    quotaSimulation:'First 10 of 20 synchronized waves accepted; second 10 denied as shared 429. This exercises middleware behavior under a synthetic provider, not a real provider rate-limit implementation.',
    gates:['Production provider capacity agreement including all shared Backend API traffic','Isolated workload fidelity and tail-latency/outage tests','Production journey measurement after separate approval','Alerting for lookup latency/503/429/outstanding requests across replicas']};
  await writeFile(output+'/auth-load-'+Date.now()+'.json',JSON.stringify(record,null,2),{flag:'wx'});
  console.log(JSON.stringify({status:record.status,syntheticProviderCalls:providerCalls,quotaDenials,scenarios}));
}
