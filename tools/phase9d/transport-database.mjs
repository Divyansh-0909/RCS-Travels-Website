import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
export async function openTransportDatabase(connectionString,role,{environment=process.env,clientFactory=options=>new Client(options)}={}) {
  assert.ok(['shadow9d_exporter','shadow9d_capture'].includes(role));
  assert.equal(['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'].some(k=>Boolean(environment[k])),false);
  const url=new URL(connectionString);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.equal(url.username,role);assert.equal(url.hostname,'localhost');
  assert.match(url.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);assert.equal(url.search,'');assert.equal(url.hash,'');
  const client=clientFactory({connectionString,connectionTimeoutMillis:2000,statement_timeout:2000});
  try{
    await client.connect();
    const identity=(await client.query(`SELECT session_user actor,current_user effective,current_database() database,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`)).rows[0];
    assert.deepEqual(identity,{actor:role,effective:role,database:url.pathname.slice(1),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false});
    return client;
  }catch(error){await client.end();throw error;}
}
