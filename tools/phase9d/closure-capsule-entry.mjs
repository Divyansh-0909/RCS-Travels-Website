import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createPrivateKey} from 'node:crypto';
import {createConnection} from 'node:net';
import {closureSession} from './closure-session.mjs';
import {closureHttp} from './closure-http.mjs';
import {closureIngress} from './closure-ingress.mjs';
import {durableReceipt,verificationRegistry,historicalVerification} from './closure-keys.mjs';
import {commitment} from './custody-protocol.mjs';
import {sendCustodyFrame} from './closure-client.mjs';
import {validateClosureEnvelope} from './closure-contract.mjs';
let size=0,parts=[];
for await(const chunk of process.stdin){size+=chunk.length;assert.ok(size<=65536);parts.push(chunk);}
const cfg=JSON.parse(Buffer.concat(parts));for(const part of parts)part.fill(0);parts.length=0;
const clients=[];let server;
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const connect=async(uri,role)=>{const client=await closureSession(uri,role,{host:new URL(uri).hostname});clients.push(client);return client;};
try{
  const uid={sender:1101,verifier:1102,ingress:1103,signer:1104,observer:1105,attack:1106}[cfg.mode];
  assert.equal(process.getuid(),uid);assert.equal(process.getgid(),uid);
  const profile={uid:process.getuid(),gid:process.getgid(),status:(await readFile('/proc/self/status','utf8')).split('\n').filter(s=>/^(CapEff|NoNewPrivs|Seccomp):/.test(s)),
    memory:(await readFile('/sys/fs/cgroup/memory.max','utf8')).trim(),pids:(await readFile('/sys/fs/cgroup/pids.max','utf8')).trim(),cpu:(await readFile('/sys/fs/cgroup/cpu.max','utf8')).trim()};
  assert.deepEqual(profile.status,['CapEff:\t0000000000000000','NoNewPrivs:\t1','Seccomp:\t2']);
  assert.deepEqual([profile.memory,profile.pids,profile.cpu],['536870912','64','75000 100000']);
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
    server=closureIngress(client,{sources:new Map(cfg.sources.map(s=>[s.id,s])),ingressKey:cfg.ingressKey,signer:body=>sendCustodyFrame(cfg.signerEndpoint,cfg.rpcKey,body)},()=>cfg.fault);
  }else if(cfg.mode==='sender'){
    assert.ok(['custody_sender','custody_source_sender','custody_receiver_sender'].includes(cfg.role));
    const client=await connect(cfg.uri,cfg.role),schema=cfg.role==='custody_sender'?'custody_export':'custody_lineage';
    const frame=(await client.query(cfg.sequence===undefined?'SELECT '+schema+'.next() frame':'SELECT '+schema+'.frame($1) frame',cfg.sequence===undefined?[]:[cfg.sequence])).rows[0].frame;
    if(cfg.pause){emit({status:'PAUSED',profile,credentialShape});await new Promise(()=>{});}
    if(frame===null)emit({status:'EMPTY',profile,credentialShape});
    else try{emit({status:'RECEIVED',profile,credentialShape,frame,receipt:await sendCustodyFrame(cfg.endpoint,cfg.ingressKey,frame)});}catch{emit({status:'PENDING',profile,credentialShape});}
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
    try{emit({status:'RECEIVED',profile,credentialShape,receipt:await sendCustodyFrame(cfg.endpoint,cfg.ingressKey,cfg.frame)});}catch{emit({status:'PENDING',profile,credentialShape});}
  }else if(cfg.mode==='attack'){
    const client=await connect(cfg.uri,cfg.role),denials=[];
    const {Client}=await import('pg');
    const other=new Client({connectionString:cfg.forbiddenUri,connectionTimeoutMillis:2000});
    await assert.rejects(other.connect(),{code:'42501'});await other.end();denials.push({name:'unrelatedDatabase',denied:true,sqlstate:'42501'});
    await assert.rejects(readFile('/run/secrets/custody-signing-key'));denials.push({name:'signingKeyFile',denied:true});
    if(cfg.role==='custody_ingest'){
      const forged={...cfg.frame,event:{...cfg.frame.event,actor:'broker9d_ops'}};
      await assert.rejects(client.query('SELECT custody.ingest($1)',[forged]),{code:'23514'});
      denials.push({name:'sourceEventForgery',denied:true,sqlstate:'23514'});
    }
    const remote=['custody_ingest','custody_signer','custody_inspector'].includes(cfg.role),lineage=cfg.role.includes('_sender')&&cfg.role!=='custody_sender',schema=remote?'custody':lineage?'custody_lineage':'custody_export';
    for(const [name,sql]of Object.entries({historyUpdate:'UPDATE '+schema+".events SET hash=repeat('0',64)",historyDelete:'DELETE FROM '+schema+'.events',historyTruncate:'TRUNCATE '+schema+'.events',sourceSecret:'SELECT '+(remote?'verification_secret FROM custody.sources':'secret FROM '+schema+'.control'),keyChange:lineage?'UPDATE custody_lineage.control SET max_events=10000':'UPDATE '+schema+".keys SET status='ACTIVE'",ownerRole:'SET ROLE '+(remote?'custody_owner':lineage?'shadow9d_owner':'custody_source_owner'),applicationWrite:"UPDATE public.bookings SET status='completed'",guardWrite:"UPDATE broker9d.results SET digest=repeat('0',64)",operations:"UPDATE broker9d.control SET stopped=false"})){
      try{await client.query(sql);denials.push({name,denied:false});}catch(error){denials.push({name,denied:['42501','42P01','3F000'].includes(error.code),sqlstate:error.code});}
    }
    const network=await new Promise(ok=>{const socket=createConnection({host:cfg.forbiddenPeer,port:5432});const timer=setTimeout(()=>{socket.destroy();ok('DENIED');},1000);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();ok('REACHABLE');});socket.once('error',()=>{clearTimeout(timer);ok('DENIED');});});
    assert.ok(denials.every(d=>d.denied));assert.equal(network,'DENIED');emit({status:'DENIED',profile,credentialShape,denials,network});
  }else throw Error('UNKNOWN_MODE');
  if(server){await new Promise(ok=>server.listen(cfg.port,'0.0.0.0',ok));emit({status:'READY',profile,credentialShape,port:server.address().port});await new Promise(()=>{});}
}catch(error){emit({status:'FAILED',code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'CONTRACT',diagnostic:error.message.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]').slice(0,600)});process.exitCode=1;}
finally{await Promise.allSettled(clients.map(client=>client.end()));}
