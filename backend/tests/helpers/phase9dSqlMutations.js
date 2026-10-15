import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'

// Seeded SQL mutants are executed in the disposable fixture and restored one by
// one. A SQL error is an ERROR, not an assertion kill or reviewed equivalence.
export async function exerciseSqlMutations(c) {
  const {admin,roles,reset,enqueue,claim,stop,advance,call,result,witness}=c
  const probes={
    complete:async(key)=>{await reset();await enqueue();const w=await claim();
      // Hold epoch constant to test the stop predicate independently of the
      // separate epoch veto. This is an owned-fixture state-corruption probe.
      if(key==='stopped')await admin.query('UPDATE shadow9d.control SET stopped=true')
      if(key==='epoch'){await stop(true);await stop(false)}
      if(key==='owner')await admin.query("UPDATE shadow9d.work SET lease_owner='foreign-worker'")
      if(key==='expired')await advance(121)
      if(key==='status')await admin.query("UPDATE shadow9d.work SET status='PENDING'")
      return call(roles.worker,'SELECT shadow9d.complete($1,$2,$3) value',[w.id,key==='token'?randomUUID():w.lease_token,JSON.stringify(result)])},
    permit:async(key)=>{await reset();await enqueue();const w=await claim();
      if(key==='owner')await admin.query("UPDATE shadow9d.work SET lease_owner='foreign-worker'")
      if(key==='expired')await advance(121)
      if(key==='status')await admin.query("UPDATE shadow9d.work SET status='PENDING'")
      if(key==='epoch'){await stop(true);await stop(false)}
      if(key==='budget')await admin.query('UPDATE shadow9d.control SET request_budget=0')
      return call(roles.worker,'SELECT shadow9d.permit($1,$2) value',[w.id,key==='token'?randomUUID():w.lease_token])},
    fail:async(key)=>{await reset();await enqueue();const w=await claim();
      if(key==='owner')await admin.query("UPDATE shadow9d.work SET lease_owner='foreign-worker'")
      if(key==='status')await admin.query("UPDATE shadow9d.work SET status='PENDING'")
      return call(roles.worker,'SELECT shadow9d.fail($1,$2,$3) value',[w.id,key==='token'?randomUUID():w.lease_token,'ANALYST_TIMEOUT'])},
  }
  const definitions=(await admin.query("SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='shadow9d'")).rows
  const inventory=[]
  function add(name,routine,old,replacement,probe,expected=false){inventory.push({name,routine,old:old.trimEnd(),replacement,probe,expected})}
  for(const [key,old] of [['stopped','c.stopped OR '],['epoch','w.epoch<>c.epoch OR '],['owner','w.lease_owner<>session_user OR '],['token','w.lease_token IS DISTINCT FROM token OR '],['expired','w.lease_until<=c.now_at OR '],['status',"w.status<>'PROCESSING'"]])
    add('complete-'+key,'complete',old,key==='status'?'false':'',()=>probes.complete(key))
  for(const [key,old]of [['owner','lease_owner=session_user AND '],['epoch','w.epoch=c.epoch AND '],['token','lease_token=token AND '],['expired','lease_until>c.now_at AND '],['status',"status='PROCESSING'"],['budget','c.used_requests>=c.request_budget']])
    add('permit-'+key,'permit',old,['status','budget'].includes(key)?(key==='budget'?'false':'true'):'',()=>probes.permit(key))
  for(const [key,old]of [['owner','w.lease_owner<>session_user OR '],['token','w.lease_token IS DISTINCT FROM token OR '],['status',"w.status<>'PROCESSING'"]])
    add('fail-'+key,'fail',old,key==='status'?'false':'',()=>probes.fail(key))
  add('evidence-version','valid_snapshot',"s->>'evidenceVersion' IS DISTINCT FROM 'responsibility-evidence-v1'",'false',async()=>{
    const s=structuredClone(c.fixture().snapshot);s.evidenceVersion='forged-v2';return call(admin,'SELECT shadow9d.valid_snapshot($1) value',[JSON.stringify(s)])})
  add('calendar','valid_instant',"AND pg_input_is_valid(v #>> '{}', 'timestamp with time zone')",'',()=>call(admin,"SELECT shadow9d.valid_instant('\"2026-02-30T00:00:00Z\"',false) value"))
  add('hour24','valid_instant','([01][0-9]|2[0-3])','[0-2][0-9]',()=>call(admin,"SELECT shadow9d.valid_instant('\"2026-10-12T24:00:00Z\"',false) value"))
  add('capture-stop','enqueue','IF c.stopped THEN','IF false THEN',async()=>{await reset();await stop(true);return (await enqueue())===null},true)
  add('privacy-check','enqueue','NOT shadow9d.valid_snapshot(snapshot)','false',async()=>{await reset();const e=c.fixture();e.snapshot.timeline[0].value={private:'synthetic'};return (await enqueue(e))===null},true)
  add('delete-nonterminal','delete_payload',"status IN ('COMPLETED','MANUAL_REVIEW')",'true',async()=>{await reset();const id=await enqueue();return call(roles.ops,'SELECT shadow9d.delete_payload($1) value',[id])})
  add('concurrent-cap','claim',"(SELECT count(*) FROM shadow9d.work WHERE status='PROCESSING' AND lease_until>c.now_at)>=c.max_concurrent",'false',async()=>{await reset();for(const l of ['a','b','c'])await enqueue(c.fixture('mutant-'+l));await claim();await claim();return (await claim())===null},true)
  add('duplicate-source-binding','enqueue','IF EXISTS(SELECT 1 FROM shadow9d.work w WHERE w.id=existing AND (','IF false AND EXISTS(SELECT 1 FROM shadow9d.work w WHERE w.id=existing AND (',async()=>{
    await reset();const e=c.fixture();await enqueue(e);return (await enqueue({...e,evidenceHash:'b'.repeat(64)},e.evidenceHash))===null
  },true)
  for(const mutant of inventory){
    const original=definitions.find(d=>d.proname===mutant.routine);assert.ok(original)
    assert.equal(original.definition.split(mutant.old).length,2,mutant.name+' exact unique anchor')
    const changed=original.definition.replace(mutant.old,mutant.replacement)
    const record={name:mutant.name,signature:original.signature,originalSha256:sha(original.definition),mutantSha256:sha(changed),sql:changed,expected:mutant.expected}
    try{
      assert.equal(await mutant.probe(),mutant.expected,mutant.name+' baseline')
      await admin.query(changed);record.observed=await mutant.probe();record.status=record.observed===mutant.expected?'SURVIVED':'KILLED'
    }catch(error){record.status='ERROR';record.error={code:error.code??null,message:error.message}}
    finally{await admin.query(original.definition);witness.mutations.push(record)}
    assert.equal(record.status,'KILLED',mutant.name)
  }
  const grants=[['worker-work-update','GRANT UPDATE ON shadow9d.work TO shadow9d_worker','REVOKE UPDATE ON shadow9d.work FROM shadow9d_worker',()=>roles.worker.query("UPDATE shadow9d.work SET status='COMPLETED'")],
    ['worker-audit-delete','GRANT USAGE ON SCHEMA audit9d TO shadow9d_worker;GRANT DELETE ON audit9d.events TO shadow9d_worker','REVOKE DELETE ON audit9d.events FROM shadow9d_worker;REVOKE USAGE ON SCHEMA audit9d FROM shadow9d_worker',()=>roles.worker.query('DELETE FROM audit9d.events')]]
  for(const [name,sql,restore,probe]of grants){
    await assert.rejects(probe(),e=>e.code==='42501');await admin.query(sql)
    try{await probe();witness.mutations.push({name,sql,mutantSha256:sha(sql),status:'KILLED',observed:'forbidden write succeeded; permission regression detects it'})}
    finally{await admin.query(restore)}
  }
  const create="CREATE FUNCTION shadow9d.default_mutant_probe() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,shadow9d,pg_temp AS $$ SELECT stopped FROM shadow9d.control $$"
  await admin.query('SET ROLE shadow9d_owner;'+create+';RESET ROLE')
  try{await assert.rejects(roles.worker.query('SELECT shadow9d.default_mutant_probe()'),e=>e.code==='42501')}
  finally{await admin.query('DROP FUNCTION shadow9d.default_mutant_probe()')}
  const sql='SET ROLE shadow9d_owner;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;'+create+';RESET ROLE'
  await admin.query(sql)
  try{await roles.worker.query('SELECT shadow9d.default_mutant_probe()');witness.mutations.push({name:'future-owner-public-execute',sql,mutantSha256:sha(sql),status:'KILLED',observed:'future owner read became executable; negative principal test detects it'})}
  finally{await admin.query('DROP FUNCTION shadow9d.default_mutant_probe();SET ROLE shadow9d_owner;ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;RESET ROLE')}
}
function sha(value){return createHash('sha256').update(value).digest('hex')}
