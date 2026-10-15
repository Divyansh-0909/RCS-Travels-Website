// Trusted disposable-fixture controller. Never a least-privilege service.
import assert from 'node:assert/strict';
import readline from 'node:readline';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {keyIdentity} from './custody-protocol.mjs';
import {rotateCustodyKey} from './closure-rotation.mjs';
import {brokerCall} from './broker-execution.mjs';
import {consequenceState} from '../../backend/tests/helpers/phase9dCurrentPolicyWitness.js';
import pg from 'pg';
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let f,baseline;const privateKeys=new Map();
const emit=(id,value)=>process.stdout.write('CUSTODY_CONTROL '+JSON.stringify({id,value})+'\n');
try{
  for await(const line of input){
    assert.ok(Buffer.byteLength(line)<=65536);const {id,action,...cfg}=JSON.parse(line);
    try{
      if(action==='initialize'){
        assert.equal(f,undefined);
        const isolation=await import('../../backend/tests/helpers/phase9Isolation.js');
        Object.assign(process.env,{PHASE9_ISOLATED:'1',TEST_DATABASE_URL:cfg.sourceUri,CUSTODY_DATABASE_URL:cfg.auditUri,
          DATABASE_URL:isolation.PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:isolation.PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:isolation.PHASE9_EMPTY_ENV});
        isolation.installPhase9NetworkFence(process.env);
        f=await (await import('../../backend/tests/helpers/phase9dCustodyLineageFixture.js')).custodyLineageFixture();
        privateKeys.set(f.keyId,f.privateKey);baseline=await consequenceState(f.source.client);
        await f.a.query('SELECT custody_lineage.capture_committed()');
        const requestId=await f.register(0);assert.ok(requestId);
        const execution=await f.run({mode:'execute',requestId,fixture:'valid'});await execution.exited;assert.equal(execution.result.calls,1);
        const work=execution.result;assert.equal(await brokerCall(f.reconciler,'reconcile',[JSON.stringify(await f.receipt(work.id,{outcome:'SUCCESS',input:128,output:32,minor:2}))]),'ACCEPTED');
        const guard=await f.run({mode:'guard',id:work.id,token:work.token});await guard.exited;assert.equal(guard.result.route,'NEEDS_ADMIN_REVIEW');
        emit(id,{status:'READY',route:guard.result.route,calls:execution.result.calls,source:f.source.name,receiver:f.receiver.name});
      }else if(action==='register-observer'){
        const source=randomUUID(),key=randomUUID()+randomUUID();
        await f.audit.query('INSERT INTO custody.sources(source,verification_secret,service) VALUES($1,$2,$3)',[source,key,'denial-observer-v2']);
        f.sources.set(source,{id:source,key,service:'denial-observer-v2'});emit(id,{source,key,ingressKey:f.ingressKey});
      }else if(action==='denial-probes'){
        const observations=[];
        for(const [server,role,denialClass,statement]of [
          ['source','shadow9d_exporter','APPLICATION_WRITE','UPDATE public.bookings SET id=id'],
          ['source','broker9d_exec','BUDGET_CONFIGURATION','UPDATE broker9d.configuration SET max_requests=max_requests'],
          ['audit','custody_ingest','AUDIT_HISTORY','DELETE FROM custody.events'],
          ['source','custody_sender','ROLE_ESCALATION','SET ROLE custody_source_owner'],
          ['source','custody_sender','SIGNING_SECRET','SELECT secret FROM custody_export.control'],
          ['source','broker9d_exec','GUARD_WRITE','INSERT INTO broker9d.results SELECT * FROM broker9d.results'],
          ['source','broker9d_exec','OPERATIONS_CONTROL',"SELECT broker9d.operate(gen_random_uuid(),NULL,'STOP',1,'OPERATOR_STOP')"]]){
          const uri=server==='audit'?f.sandboxUri(role):role.startsWith('custody_')?f.sandboxUri(role):f.uri(role==='shadow9d_exporter'?f.source.name:f.receiver.name,role);
          const client=new pg.Client({connectionString:uri});await client.connect();
          try{const pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;let denied;
            try{await client.query(statement);}catch(error){denied=error.code;}assert.equal(denied,'42501');observations.push({server,role,pid,sqlstate:denied,denialClass});
          }finally{await client.end();}
        }
        const wrong=new URL(f.sandboxUri('custody_ingest'));wrong.password=randomUUID();const client=new pg.Client({connectionString:wrong.toString()});let denied;
        try{await client.connect();}catch(error){denied=error.code;}finally{await client.end();}assert.equal(denied,'28P01');
        observations.push({server:'audit',role:'custody_ingest',sqlstate:'28P01',denialClass:'AUTHENTICATION'});emit(id,{observations});
      }else if(action==='config'){
        const common={mode:cfg.mode};let value;
        if(cfg.mode==='signer')value={...common,uri:f.sandboxUri('custody_signer'),privateKeys:[...privateKeys].filter(([key])=>!cfg.currentOnly||key===f.currentKey).map(([key,pem])=>({id:key,pem}))};
        else if(cfg.mode==='ingress')value={...common,uri:f.sandboxUri('custody_ingest'),sources:[...f.sources.values()].map(({id,service})=>({id,service})),ingressKey:f.ingressKey};
        else if(cfg.mode==='sender'||cfg.mode==='verifier'){
          const stream=cfg.stream==='broker'?null:f.streams.find(s=>s.service===cfg.stream);assert.ok(cfg.stream==='broker'||stream);
          const role=cfg.mode==='sender'?(stream?.role??'custody_sender'):(stream?'custody_lineage_verifier':'custody_verifier');
          value={...common,uri:stream?stream.sandboxUri(role):f.sandboxUri(role),role,...(cfg.mode==='sender'?{ingressKey:f.ingressKey}:{auditUri:f.sandboxUri('custody_inspector')})};
        }else if(cfg.mode==='attack')value={...common,uri:f.sandboxUri(cfg.role),role:cfg.role};
        else throw Error('UNKNOWN_CONFIG');
        emit(id,value); // Private IPC only; parent must never retain/print configurations.
      }else if(action==='rotate'){
        const keys=generateKeyPairSync('ed25519'),keyId=keyIdentity(keys.publicKey),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
        const epoch=(await f.audit.query('SELECT max(epoch) epoch FROM custody.keys')).rows[0].epoch;
        await rotateCustodyKey(f.audit,{keyId,publicKey,expectedEpoch:Number(epoch)});
        await f.b.query("UPDATE custody_export.keys SET status='RETIRED' WHERE status='ACTIVE'");
        await f.b.query("INSERT INTO custody_export.keys VALUES($1,$2,$3,'ACTIVE')",[keyId,publicKey,Number(epoch)+1]);
        privateKeys.set(keyId,keys.privateKey.export({type:'pkcs8',format:'pem'}));f.currentKey=keyId;emit(id,{keyId,epoch:Number(epoch)+1});
      }else if(action==='state'){
        assert.deepEqual(await consequenceState(f.source.client),baseline);
        const sources=[];for(const s of f.streams)sources.push({service:s.service,rows:(await s.inspector.query('SELECT event,hash,status,receipt FROM custody_lineage.events ORDER BY seq')).rows});
        sources.push({service:'broker',rows:(await f.sourceInspector.query('SELECT event,hash,status,receipt FROM custody_export.events ORDER BY seq')).rows});
        emit(id,{status:'UNCHANGED',sources,remote:await f.custodyState(),keys:(await f.inspector.query('SELECT key_id,public_key,epoch,status FROM custody.keys ORDER BY epoch')).rows,accounting:await brokerCall(f.ops,'accounting',[])});
      }else if(action==='stop')emit(id,await f.control('STOP'));
      else if(action==='close'){await f.close();f=null;emit(id,{status:'CLOSED'});break;}
      else throw Error('UNKNOWN_ACTION');
    }catch(error){emit(id,{status:'FAILED',code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'CONTRACT',diagnostic:error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[url-redacted]').slice(0,600)});process.exitCode=1;break;}
  }
}finally{input.close();if(f)await f.close();}
