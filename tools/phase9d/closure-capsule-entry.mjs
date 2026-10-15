import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createPrivateKey} from 'node:crypto';
import {createConnection} from 'node:net';
import {closureSession} from './closure-session.mjs';
import {closureHttp} from './closure-http.mjs';
import {closureIngress} from './closure-ingress.mjs';
import {durableReceipt,verificationRegistry,historicalVerification} from './closure-keys.mjs';
import {commitment} from './custody-protocol.mjs';
import {sendShadowDelivery} from './transport-http.mjs';
import {validateClosureEnvelope} from './closure-contract.mjs';
let size=0,parts=[];
for await(const chunk of process.stdin){size+=chunk.length;assert.ok(size<=65536);parts.push(chunk);}
const cfg=JSON.parse(Buffer.concat(parts));parts=null;
const clients=[];let server;
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const connect=async(uri,role)=>{const client=await closureSession(uri,role);clients.push(client);return client;};
try{
  assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);
  const profile={uid:process.getuid(),gid:process.getgid(),status:(await readFile('/proc/self/status','utf8')).split('\n').filter(s=>/^(CapEff|NoNewPrivs|Seccomp):/.test(s)),
    memory:(await readFile('/sys/fs/cgroup/memory.max','utf8')).trim(),pids:(await readFile('/sys/fs/cgroup/pids.max','utf8')).trim(),cpu:(await readFile('/sys/fs/cgroup/cpu.max','utf8')).trim()};
  const artifact='/tmp/custody-owned-probe';await writeFile(artifact,'synthetic',{flag:'wx'});await unlink(artifact);
  let deniedRoot=false;try{await writeFile('/app/custody-forbidden-write','synthetic',{flag:'wx'});}catch(e){deniedRoot=['EACCES','EROFS'].includes(e.code);}assert.ok(deniedRoot);
  await assert.rejects(readFile('/var/run/docker.sock'));profile.rootWriteDenied=true;profile.dockerSocketAbsent=true;
  assert.ok(!('sourceKey' in cfg)&&!('sourceSigningKey' in cfg));
  if(cfg.mode!=='signer')assert.ok(!('privateKeys' in cfg));
  const credentialShape={receiptPrivateKeys:cfg.mode==='signer',sourceSigningKeys:false};
  if(cfg.mode==='signer'){
    const client=await connect(cfg.uri,'custody_signer'),keys=new Map(cfg.privateKeys.map(k=>[k.id,createPrivateKey(k.pem)]));
    server=closureHttp(cfg.rpcKey,body=>durableReceipt(client,body,keys));
  }else if(cfg.mode==='ingress'){
    assert.ok(cfg.sources.every(s=>Object.keys(s).sort().join(',')==='id,service'));
    const client=await connect(cfg.uri,'custody_ingest');
    server=closureIngress(client,{sources:new Map(cfg.sources.map(s=>[s.id,s])),ingressKey:cfg.ingressKey,signer:body=>sendShadowDelivery(cfg.signerEndpoint,cfg.rpcKey,body)},()=>cfg.fault);
  }else if(cfg.mode==='sender'){
    assert.ok(['custody_sender','custody_source_sender','custody_receiver_sender'].includes(cfg.role));
    const client=await connect(cfg.uri,cfg.role),schema=cfg.role==='custody_sender'?'custody_export':'custody_lineage';
    const frame=(await client.query(cfg.sequence===undefined?'SELECT '+schema+'.next() frame':'SELECT '+schema+'.frame($1) frame',cfg.sequence===undefined?[]:[cfg.sequence])).rows[0].frame;
    if(cfg.pause){emit({status:'PAUSED',profile,credentialShape});await new Promise(()=>{});}
    if(frame===null)emit({status:'EMPTY',profile,credentialShape});
    else try{emit({status:'RECEIVED',profile,credentialShape,frame,receipt:await sendShadowDelivery(cfg.endpoint,cfg.ingressKey,frame)});}catch{emit({status:'PENDING',profile,credentialShape});}
  }else if(cfg.mode==='verifier'){
    assert.ok(['custody_verifier','custody_lineage_verifier'].includes(cfg.role));
    const client=await connect(cfg.uri,cfg.role),audit=await connect(cfg.auditUri,'custody_inspector');
    const registry=verificationRegistry((await audit.query('SELECT key_id AS "keyId",public_key AS "publicKey",status FROM custody.keys ORDER BY epoch')).rows);
    assert.equal(historicalVerification(cfg.receipt,cfg.event,registry).currentlyTrusted,true);
    const remote=(await audit.query('SELECT e.hash,e.receipt::text,e.key_id,s.signature FROM custody.events e JOIN custody.signatures s ON s.receipt=e.receipt WHERE e.source=$1 AND e.seq=$2',[cfg.event.source,cfg.event.sequence])).rows[0];
    assert.deepEqual(remote,{hash:commitment(cfg.event),receipt:cfg.receipt.body.receipt,key_id:cfg.receipt.body.keyId,signature:cfg.receipt.signature});
    const schema=cfg.role==='custody_verifier'?'custody_export':'custody_lineage';
    const accepted=(await client.query('SELECT '+schema+'.ack($1,$2,$3) accepted',[cfg.event.sequence,commitment(cfg.event),cfg.receipt])).rows[0].accepted;
    emit({status:accepted?'VERIFIED':'DENIED',profile,credentialShape});
  }else if(cfg.mode==='observer'){
    assert.ok(!('uri' in cfg)&&!('auditUri' in cfg));
    validateClosureEnvelope(cfg.frame,new Map([[cfg.source.id,cfg.source]]));
    if(cfg.pause){emit({status:'PAUSED',profile,credentialShape});await new Promise(()=>{});}
    try{emit({status:'RECEIVED',profile,credentialShape,receipt:await sendShadowDelivery(cfg.endpoint,cfg.ingressKey,cfg.frame)});}catch{emit({status:'PENDING',profile,credentialShape});}
  }else if(cfg.mode==='attack'){
    const client=await connect(cfg.uri,cfg.role),denials=[];
    for(const [name,sql]of Object.entries({historyUpdate:"UPDATE custody.events SET hash=repeat('0',64)",historyDelete:'DELETE FROM custody.events',historyTruncate:'TRUNCATE custody.events',sourceSecret:'SELECT secret FROM custody_export.control',remoteSourceSecret:'SELECT verification_secret FROM custody.sources',keyChange:"UPDATE custody.keys SET status='ACTIVE'",ownerRole:'SET ROLE custody_owner',applicationWrite:"UPDATE public.bookings SET status='completed'",guardWrite:"UPDATE broker9d.results SET digest=repeat('0',64)",operations:"UPDATE broker9d.control SET stopped=false"})){
      try{await client.query(sql);denials.push({name,denied:false});}catch(error){denials.push({name,denied:['42501','42P01','3F000'].includes(error.code),sqlstate:error.code});}
    }
    const network=await new Promise(ok=>{const socket=createConnection({host:'203.0.113.1',port:443});const timer=setTimeout(()=>{socket.destroy();ok('DENIED');},1000);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();ok('REACHABLE');});socket.once('error',()=>{clearTimeout(timer);ok('DENIED');});});
    assert.ok(denials.every(d=>d.denied));assert.equal(network,'DENIED');emit({status:'DENIED',profile,credentialShape,denials,network});
  }else throw Error('UNKNOWN_MODE');
  if(server){await new Promise(ok=>server.listen(cfg.port,'127.0.0.1',ok));emit({status:'READY',profile,credentialShape,port:server.address().port});await new Promise(()=>{});}
}catch(error){emit({status:'FAILED',code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'CONTRACT'});process.exitCode=1;}
finally{await Promise.allSettled(clients.map(client=>client.end()));}
