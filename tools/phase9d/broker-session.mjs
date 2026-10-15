import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
export async function brokerSession(uri,role,{environment=process.env,factory=options=>new Client(options)}={}) {
  assert.ok(['broker9d_exec','broker9d_guard'].includes(role));
  for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'])assert.ok(!environment[name]);
  const url=new URL(uri);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.deepEqual([url.username,url.hostname,url.search,url.hash],[role,'localhost','','']);
  assert.match(url.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);
  const client=factory({connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000});
  try {
    await client.connect();
    const {rows}=await client.query('SELECT session_user actor,current_user effective,current_database() database,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=session_user');
    assert.deepEqual(rows,[{actor:role,effective:role,database:url.pathname.slice(1),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]);
    const routine=role==='broker9d_exec'?'broker9d.reserve(uuid)':'broker9d.commit_result(uuid,uuid,jsonb)';
    assert.equal((await client.query('SELECT to_regprocedure($1) IS NOT NULL installed',[routine])).rows[0].installed,true);
    return client;
  }catch(error){await client.end();throw error;}
}
