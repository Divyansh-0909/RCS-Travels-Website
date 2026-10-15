import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createShadowExportRepository} from './export-repository.mjs';
import {deriveShadowExport} from './export-projection.mjs';
import {pumpShadowExport} from './export-pump.mjs';
const {Client}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
export async function executeShadowExport({connectionString,key,mode},{environment=process.env,clientFactory=options=>new Client(options)}={}){
  assert.ok(['resume','claim_then_crash','stage_then_crash'].includes(mode));
  assert.equal(['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'].some(k=>Boolean(environment[k])),false,'PRIVILEGED_ENVIRONMENT_DENIED');
  const url=new URL(connectionString);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.equal(url.username,'shadow9d_exporter');assert.equal(url.hostname,'localhost');
  assert.match(url.pathname,/^\/rcs_verify_[a-f0-9]{32}$/);
  assert.equal(url.search,'');assert.equal(url.hash,'');
  assert.equal(typeof key,'string');assert.ok(key.length>=32);
  const db=clientFactory({connectionString,connectionTimeoutMillis:2000,statement_timeout:5000});
  let retained=false;
  try{
    await db.connect();
    const identity=(await db.query(`SELECT session_user actor,current_user effective,current_database() database,
      r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`)).rows[0];
    assert.deepEqual(identity,{actor:'shadow9d_exporter',effective:'shadow9d_exporter',database:url.pathname.slice(1),
      rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false},'DATABASE_IDENTITY_DENIED');
    const repository=createShadowExportRepository(db);
    if(mode==='resume')return await pumpShadowExport(repository,key);
    await repository.scan();const work=await repository.claim();
    if(!work)return {status:'EMPTY'};
    if(mode==='stage_then_crash')assert.equal(await repository.stage(work,deriveShadowExport(work.source,key)),true,'STAGE_DENIED');
    retained=true;return {status:mode==='stage_then_crash'?'STAGED':'CLAIMED'};
  }finally{if(!retained)await db.end();}
}
