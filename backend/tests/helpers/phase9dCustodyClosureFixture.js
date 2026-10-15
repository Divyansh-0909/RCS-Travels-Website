import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {custodyFixture} from './phase9dCustodyFixture.js';
import {verificationRegistry} from '../../../tools/phase9d/closure-keys.mjs';
export async function custodyClosureFixture(){
  const f=await custodyFixture(),clients=[],credentials=new Map();
  try{
    const sql=name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8');
    await f.b.query(await sql('closure-source.sql'));await f.audit.query(await sql('closure-store.sql'));
    await f.audit.query(await sql('closure-admission.sql'));
    await f.audit.query('UPDATE custody.sources SET verification_secret=$1 WHERE source=$2',[f.sourceKey,f.sourceIdentity]);
    for(const database of [f.b,f.audit])await database.query('INSERT INTO '+(database===f.b?'custody_export':'custody')+'.keys VALUES($1,$2,1,$3)',[f.keyId,f.publicKey,'ACTIVE']);
    const sourceRoles=['custody_source_inspector','custody_sender','custody_verifier'];
    for(const [database,role]of [...sourceRoles.map(role=>[f.b,role]),[f.audit,'custody_signer'],[f.audit,'custody_ingest'],[f.audit,'custody_inspector']]){
      const password=randomUUID();credentials.set(role,password);
      await database.query((await database.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
    }
    const sandboxUri=role=>{
      if(!credentials.has(role))throw Error('UNKNOWN_CUSTODY_PRINCIPAL');
      const uri=new URL(sourceRoles.includes(role)?f.uri(f.receiver.name,'broker9d_exec'):process.env.CUSTODY_DATABASE_URL);
      uri.username=role;uri.password=credentials.get(role);
      return uri.toString();
    };
    const connect=async role=>{
      const client=new pg.Client({connectionString:sandboxUri(role),connectionTimeoutMillis:2000,statement_timeout:3000});client.on('error',()=>{});await client.connect();clients.push(client);return client;
    };
    const signer=await connect('custody_signer'),ingest=await connect('custody_ingest'),sourceInspector=await connect('custody_source_inspector');
    const registry=async()=>verificationRegistry((await f.inspector.query('SELECT key_id AS "keyId",public_key AS "publicKey",status FROM custody.keys ORDER BY epoch')).rows);
    return {...f,signer,ingest,sourceInspector,connect,registry,sandboxUri,
      async close(){await Promise.allSettled(clients.map(client=>client.end()));await f.close();}};
  }catch(error){await Promise.allSettled(clients.map(client=>client.end()));await f.close();throw error;}
}
