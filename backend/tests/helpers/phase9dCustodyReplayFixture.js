// Saved initial rows are persisted before the executable lifecycle, not inferred
// from a later receipt observation. This fixture never loads historical evidence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from './database.js';
import {createScheduledScenario} from './scheduledScenario.js';
import {keyIdentity} from '../../../tools/phase9d/custody-protocol.mjs';
import {custodyLineageFixture} from './phase9dCustodyLineageFixture.js';
import {EXPORT_TEST_KEY} from './phase9dExportFixture.js';
export async function custodyReplayFixture(recipe){
  let scenario;
  const f=await custodyLineageFixture({fixture:async()=>{
    const source=await createTestDatabase(),receiver=await createTestDatabase({migrations:false}),clients=[];
    const target=name=>{const uri=new URL(testDatabaseUrl());uri.pathname='/'+name;return uri;};
    const a=new pg.Client({connectionString:target(source.name).toString()}),b=new pg.Client({connectionString:target(receiver.name).toString()}),audit=new pg.Client({connectionString:process.env.CUSTODY_DATABASE_URL});
    await a.connect();await b.connect();await audit.connect();
    for(const client of [a,b,audit])client.on('error',()=>{});
    const close=async()=>{await Promise.allSettled(clients.map(c=>c.end()));await a.end();await b.end();await audit.end();await receiver.close();await source.close();};
    try{
      const sql=name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8'),permissions=await sql('permissions.sql');
      await a.query(permissions);await a.query(await sql('outbox.sql'));await a.query(await sql('transport-sender.sql'));
      await b.query(permissions.replace(/^CREATE ROLE .*;\r?\n/gm,''));
      for(const name of ['transport-receiver.sql','broker.sql','broker-recovery.sql'])await b.query(await sql(name));
      for(const [client,name]of [[a,source.name],[b,receiver.name]])await client.query('REVOKE TEMPORARY ON DATABASE "'+name+'" FROM PUBLIC');
      scenario=createScheduledScenario({now:recipe.at});
      const revive=(key,value)=>typeof value==='string'&&key.endsWith('At')?new Date(value):value;
      const initial=JSON.parse(JSON.stringify(recipe.initial),revive);
      for(const [name,rows]of Object.entries(initial)){assert.equal(rows.length,scenario.collections[name].length);rows.forEach((row,i)=>Object.assign(scenario.collections[name][i],row));}
      await scenario.persist(source.client);
      for(const [i,table]of ['driver_cancellations','responsibility_evidence_versions','responsibility_adjudication_work'].entries()){
        const id=recipe.journalIds[i];assert.match(id,/^[a-f0-9-]{36}$/);
        await a.query(`CREATE FUNCTION public.custody_replay_id_${i}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.id='${id}';RETURN NEW;END$$;
          REVOKE ALL ON FUNCTION public.custody_replay_id_${i}() FROM PUBLIC;CREATE TRIGGER custody_replay_id_${i} BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.custody_replay_id_${i}()`);
      }
      const passwords=new Map();
      for(const role of ['shadow9d_capture','shadow9d_exporter','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler']){
        const password=randomUUID();passwords.set(role,password);await a.query((await a.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
      }
      const uri=(name,role)=>{const value=target(name);value.username=role;value.password=passwords.get(role);return value.toString();};
      for(const owner of [a,b])await owner.query('UPDATE shadow9d.control SET stopped=false,now_at=$1',[recipe.at]);
      await b.query('UPDATE broker9d.control SET stopped=false,now_at=$1',[recipe.at]);
      await a.query('INSERT INTO outbox9d.transport_configuration(service_id,receipt_key) VALUES($1,$2)',[recipe.serviceId,'synthetic-custody-replay-transport-receipt-key']);
      await b.query('INSERT INTO transport9d.configuration(service_id,receipt_key) VALUES($1,$2)',[recipe.serviceId,'synthetic-custody-replay-transport-receipt-key']);
      await a.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
      await b.query('INSERT INTO broker9d.usage_authority VALUES($1,$2)',['offline-issuer-v1','synthetic-custody-replay-usage-issuer-key']);
      await b.query(await sql('custody-source.sql'));await audit.query(await sql('custody-store.sql'));
      const sourceIdentity=recipe.sourceId,sourceKey=randomUUID()+randomUUID(),ingressKey=randomUUID()+randomUUID(),keys=generateKeyPairSync('ed25519');
      const publicKey=keys.publicKey.export({type:'spki',format:'pem'}),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}),keyId=keyIdentity(keys.publicKey);
      await b.query('INSERT INTO custody_export.control(singleton,source,secret) VALUES(true,$1,$2)',[sourceIdentity,sourceKey]);
      await audit.query('INSERT INTO custody.sources(source) VALUES($1)',[sourceIdentity]);
      for(const [owner,roles]of [[b,['custody_sender','custody_verifier','custody_operator']],[audit,['custody_ingest','custody_inspector']]])for(const role of roles){
        const password=randomUUID();passwords.set(role,password);await owner.query((await owner.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
      }
      const connect=async(role,owner,base)=>{const value=new URL(base);value.username=role;value.password=passwords.get(role);const client=new pg.Client({connectionString:value.toString()});await client.connect();client.on('error',()=>{});clients.push(client);return client;};
      const sender=await connect('custody_sender',b,target(receiver.name)),verifier=await connect('custody_verifier',b,target(receiver.name)),inspector=await connect('custody_inspector',audit,process.env.CUSTODY_DATABASE_URL);
      const frame=async n=>(await sender.query('SELECT custody_export.frame($1) frame',[n])).rows[0].frame;
      return {a,b,audit,source,receiver,uri,sender,verifier,inspector,sourceIdentity,sourceKey,ingressKey,keys,publicKey,privateKey,keyId,frame,close};
    }catch(error){await close();throw error;}
  }});
  return {...f,scenario};
}
