import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {custodyLineageFixture} from './phase9dCustodyLineageFixture.js';
export async function managementFixture(){
  const f=await custodyLineageFixture(),clients=[];
  try{
    const installations=[{node:'source',client:f.a},{node:'receiver',client:f.b},{node:'custodian',client:f.audit}];
    const assets=await Promise.all(['management-capacity.sql','management-retention.sql'].map(n=>readFile(new URL('../../../tools/phase9d/'+n,import.meta.url),'utf8')));
    const roles=['management_sensor','management_admission','management_operator','management_coordinator','management_hold','management_reader'],passwords=new Map();
    for(const i of installations){
      await i.client.query(assets.join('\n'));
      await i.client.query(`INSERT INTO capacity9d.configuration(singleton,node,cluster_owner,peer_databases,budget,emergency_reserve,admission_bytes,max_operations,stale_seconds,physical_location,max_wal_growth)
        VALUES(true,$1,$2,$3,1073741824,1048576,65536,1000,300,'owned-disposable-PGDATA-not-quota',1)`,[i.node,i.node!=='receiver',i.node==='source'?[f.receiver.name]:[]]);
      await i.client.query('INSERT INTO retention9d.configuration VALUES(true,$1,false,1000)',[i.node]);
      await i.client.query('INSERT INTO capacity9d.global_configuration VALUES(true,false,1073741824,1048576,1000,true)');
      await i.client.query("INSERT INTO retention9d.policies(category,version,trigger_name,duration_seconds) VALUES('pipeline-advisory',1,'SYNTHETIC_TERMINAL_ONLY',60)");
      i.roles={};
      for(const role of roles){
        if(i.node!=='receiver')await i.client.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
        const password=i.node==='receiver'?passwords.get(role):randomUUID();if(i.node==='source')passwords.set(role,password);
        await i.client.query((await i.client.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
        // Receiver shares roles with source; use the newly set password for
        // fresh receiver connections. Existing authenticated sessions persist.
        await i.client.query('GRANT USAGE ON SCHEMA capacity9d,retention9d TO '+role);
        const c=new pg.Client({...i.client.connectionParameters,user:role,password,statement_timeout:10000,connectionTimeoutMillis:3000});
        await c.connect();clients.push(c);i.roles[role]=c;
      }
      await i.client.query(`GRANT EXECUTE ON FUNCTION capacity9d.observe() TO management_sensor;
        GRANT EXECUTE ON FUNCTION capacity9d.reserve(text,bigint,text) TO management_admission;
        GRANT EXECUTE ON FUNCTION capacity9d.global_reserve(text,jsonb) TO management_admission;
        GRANT EXECUTE ON FUNCTION capacity9d.global_release(text) TO management_operator;
        GRANT EXECUTE ON FUNCTION capacity9d.release(text),capacity9d.ack_signal(text) TO management_operator;
        GRANT SELECT ON ALL TABLES IN SCHEMA capacity9d,retention9d TO management_reader;
        GRANT EXECUTE ON FUNCTION retention9d.begin_delete(uuid,text,int,text),retention9d.local_prepare(uuid,text,bigint,int,text),retention9d.ack_prepare(uuid,text,jsonb),retention9d.authorize(uuid),retention9d.local_commit(uuid,text,bigint,int,boolean),retention9d.ack_commit(uuid,text,jsonb),retention9d.restore_allowed(text) TO management_coordinator;
        GRANT EXECUTE ON FUNCTION retention9d.hold(text,boolean,text),retention9d.ack_hold(text,text,jsonb) TO management_hold`);
    }
    return {...f,installations,managementClients:clients,async close(){await Promise.allSettled(clients.map(c=>c.end()));await f.close();}};
  }catch(e){await Promise.allSettled(clients.map(c=>c.end()));await f.close();throw e;}
}
