import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
export async function custodySession(uri,role,{environment=process.env,factory=options=>new Client(options)}={}){
  assert.ok(['custody_sender','custody_verifier','custody_ingest','custody_inspector'].includes(role));
  for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'])assert.ok(!environment[name]);
  const url=new URL(uri);assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.deepEqual([url.username,url.hostname,url.search,url.hash],[role,'localhost','','']);assert.match(url.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);
  const client=factory({connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000});
  try{
    await client.connect();
    assert.deepEqual((await client.query('SELECT session_user actor,current_user effective,current_database() database,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=session_user')).rows,
      [{actor:role,effective:role,database:url.pathname.slice(1),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]);return client;
  }catch(error){await client.end();throw error;}
}
