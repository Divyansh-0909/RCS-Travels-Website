import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';
import {recoveryFixture} from './phase9dRecoveryFixture.js';
import {keyIdentity} from '../../../tools/phase9d/custody-protocol.mjs';
export async function custodyFixture(){
  const f=await recoveryFixture(1),children=[],clients=[];await f.reset();
  const url=new URL(process.env.CUSTODY_DATABASE_URL);assert.equal(url.hostname,'localhost');assert.match(url.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);
  const audit=new pg.Client({connectionString:url.toString()});await audit.connect();
  const source=randomUUID(),sourceKey=randomUUID()+randomUUID(),ingressKey=randomUUID()+randomUUID(),keys=generateKeyPairSync('ed25519');
  const publicKey=keys.publicKey.export({type:'spki',format:'pem'}),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}),keyId=keyIdentity(keys.publicKey),passwords={};
  const sql=name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8');
  await f.b.query(await sql('custody-source.sql'));await audit.query(await sql('custody-store.sql'));
  await f.b.query('INSERT INTO custody_export.control(singleton,source,secret) VALUES(true,$1,$2)',[source,sourceKey]);
  await audit.query('INSERT INTO custody.sources(source) VALUES($1)',[source]);
  await audit.query('REVOKE TEMPORARY ON DATABASE "'+url.pathname.slice(1)+'" FROM PUBLIC');
  for(const [db,roles] of [[f.b,['custody_sender','custody_verifier','custody_operator']],[audit,['custody_ingest','custody_inspector']]])for(const role of roles){
    passwords[role]=randomUUID();await db.query((await db.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,passwords[role]])).rows[0].command);
  }
  const uri=role=>{const u=new URL(role.startsWith('custody_i')?url.toString():f.uri(f.receiver.name,'broker9d_exec'));u.username=role;u.password=passwords[role];return u.toString();};
  const connect=async(role)=>{const client=new pg.Client({connectionString:uri(role)});client.on('error',()=>{});await client.connect();clients.push(client);return client;};
  const sender=await connect('custody_sender'),verifier=await connect('custody_verifier'),inspector=await connect('custody_inspector'),operator=await connect('custody_operator');
  const launch=async(mode,extra={})=>{
    const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec','DATABASE_URL','DIRECT_URL','DOTENV_CONFIG_PATH','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.PHASE9_ISOLATED='1';
    const admissionUri=uri({service:'custody_ingest',sender:'custody_sender',verifier:'custody_verifier'}[mode]);
    const fence=new URL(admissionUri);fence.pathname='/rcs_container_test';env.TEST_DATABASE_URL=fence.toString();
    const child=fork(resolve('../tools/phase9d/custody-child.mjs'),[],{cwd:resolve('.'),env,windowsHide:true,execArgv:['--import','./tests/helpers/phase9Isolation.js','--import','tsx'],stdio:['ignore','ignore','ignore','ipc']});children.push(child);
    const exit=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));
    const credentials={service:{source,sourceKey,ingressKey,publicKey,privateKey},sender:{ingressKey},verifier:{publicKey,keyId}};
    const result=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('CUSTODY_CHILD_DEADLINE'));},10000);child.once('message',r=>{clearTimeout(timer);ok(r);});child.once('error',e=>{clearTimeout(timer);fail(e);});child.once('exit',()=>{clearTimeout(timer);fail(Error('CUSTODY_CHILD_EXIT'));});child.send({mode,uri:uri({service:'custody_ingest',sender:'custody_sender',verifier:'custody_verifier'}[mode]),...credentials[mode],...extra});});
    return {child,result,exit,async close(){if(child.connected)child.disconnect();await exit;}};
  };
  const frame=async n=>(await sender.query('SELECT custody_export.frame($1) frame',[n])).rows[0].frame;
  const custodyState=async()=>(await inspector.query('SELECT to_jsonb(e) state FROM custody.events e ORDER BY custody_seq')).rows.map(r=>r.state);
  return {...f,audit,sender,verifier,inspector,operator,sourceIdentity:source,sourceKey,ingressKey,publicKey,privateKey,keyId,keys,launch,frame,custodyState,
    async close(){for(const c of children)if(c.exitCode===null&&c.signalCode===null)c.kill();await Promise.allSettled(clients.map(c=>c.end()));await audit.end();await f.close();}};
}
