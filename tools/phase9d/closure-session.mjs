import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
const roles=['custody_sender','custody_verifier','custody_ingest','custody_inspector','custody_signer','custody_source_inspector','custody_source_sender','custody_receiver_sender','custody_lineage_inspector','custody_lineage_verifier','custody_observer'];
export async function closureSession(uri,role,{host='localhost',environment=process.env,factory=options=>new Client(options)}={}){
  assert.ok(roles.includes(role));assert.ok(['localhost','source-db','audit-db'].includes(host));
  for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET','CUSTODY_DATABASE_URL','TEST_MIGRATION_DATABASE_URL'])assert.ok(!environment[name]);
  const url=new URL(uri);assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.deepEqual([url.username,url.hostname,url.search,url.hash],[role,host,'','']);assert.match(url.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);
  const client=factory({connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000});
  try{
    await client.connect();assert.deepEqual((await client.query('SELECT session_user actor,current_user effective,current_database() database,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) member FROM pg_catalog.pg_roles r WHERE rolname=session_user')).rows,
      [{actor:role,effective:role,database:url.pathname.slice(1),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,member:false}]);return client;
  }catch(error){await client.end();throw error;}
}
