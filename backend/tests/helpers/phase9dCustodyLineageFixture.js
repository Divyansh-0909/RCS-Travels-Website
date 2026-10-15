import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {custodyClosureFixture} from './phase9dCustodyClosureFixture.js';
export async function custodyLineageFixture(){
  const f=await custodyClosureFixture(),clients=[],sources=new Map([[f.sourceIdentity,{id:f.sourceIdentity,key:f.sourceKey,service:'broker-receiver-v1'}]]),streams=[];
  try{
    const sql=await readFile(new URL('../../../tools/phase9d/closure-lineage.sql',import.meta.url),'utf8');
    await f.a.query('CREATE ROLE custody_source_sender LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;CREATE ROLE custody_receiver_sender LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;CREATE ROLE custody_lineage_inspector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;CREATE ROLE custody_lineage_verifier LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
    const password=randomUUID();await f.a.query((await f.a.query("SELECT format('ALTER ROLE custody_lineage_verifier PASSWORD %L',$1::text)",[password])).rows[0].format);
    const readerPassword=randomUUID();await f.a.query((await f.a.query("SELECT format('ALTER ROLE custody_lineage_inspector PASSWORD %L',$1::text)",[readerPassword])).rows[0].format);
    for(const [owner,name,crypto,service,role]of [[f.a,f.source.name,'outbox9d','source-lineage-v2','custody_source_sender'],[f.b,f.receiver.name,'transport9d','receiver-lineage-v2','custody_receiver_sender']]){
      await owner.query(sql.replaceAll('__CRYPTO__',crypto));const id=randomUUID(),key=randomUUID()+randomUUID();sources.set(id,{id,key,service});
      await owner.query('INSERT INTO custody_lineage.control(singleton,source,service,secret,now_at) VALUES(true,$1,$2,$3,$4)',[id,service,key,'2026-10-15T00:00:00.000Z']);
      await f.audit.query('INSERT INTO custody.sources(source,verification_secret,service) VALUES($1,$2,$3)',[id,key,service]);
      const senderPassword=randomUUID();await owner.query((await owner.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text)",[role,senderPassword])).rows[0].format);
      await owner.query('GRANT USAGE ON SCHEMA custody_lineage TO '+role+',custody_lineage_inspector,custody_lineage_verifier;GRANT EXECUTE ON FUNCTION custody_lineage.frame(bigint),custody_lineage.next() TO '+role+';GRANT EXECUTE ON FUNCTION custody_lineage.ack(bigint,text,jsonb) TO custody_lineage_verifier;GRANT SELECT ON custody_lineage.events TO custody_lineage_inspector;GRANT SELECT(source,seq,head,max_events,deferred,last_deferred_hash) ON custody_lineage.control TO custody_lineage_inspector');
      const rolePasswords=new Map([[role,senderPassword],['custody_lineage_inspector',readerPassword],['custody_lineage_verifier',password]]);
      const sandboxUri=actor=>{if(!rolePasswords.has(actor))throw Error('UNKNOWN_LINEAGE_PRINCIPAL');const uri=new URL(f.uri(name,'shadow9d_exporter'));uri.username=actor;uri.password=rolePasswords.get(actor);return uri.toString();};
      const connect=async actor=>{const client=new pg.Client({connectionString:sandboxUri(actor),connectionTimeoutMillis:2000,statement_timeout:3000});client.on('error',()=>{});await client.connect();clients.push(client);return client;};
      streams.push({id,service,owner,role,sandboxUri,sender:await connect(role),inspector:await connect('custody_lineage_inspector'),verifier:await connect('custody_lineage_verifier')});
    }
    await f.a.query(await readFile(new URL('../../../tools/phase9d/closure-source-lineage.sql',import.meta.url),'utf8'));
    await f.a.query('GRANT EXECUTE ON FUNCTION custody_lineage.expected_sources() TO custody_lineage_inspector;CREATE TRIGGER custody_source_outbox AFTER INSERT OR UPDATE ON outbox9d.deliveries FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture();CREATE TRIGGER custody_source_audit AFTER INSERT ON audit9d.events FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture()');
    await f.b.query('CREATE TRIGGER custody_receiver_receipt AFTER INSERT ON transport9d.receipts FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture();CREATE TRIGGER custody_receiver_work AFTER INSERT OR UPDATE ON shadow9d.work FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture();CREATE TRIGGER custody_receiver_audit AFTER INSERT ON audit9d.events FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture();CREATE TRIGGER custody_receiver_retry AFTER INSERT ON custody_export.retries FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture()');
    return {...f,streams,sources,async close(){await Promise.allSettled(clients.map(c=>c.end()));await f.close();}};
  }catch(error){await Promise.allSettled(clients.map(c=>c.end()));await f.close();throw error;}
}
