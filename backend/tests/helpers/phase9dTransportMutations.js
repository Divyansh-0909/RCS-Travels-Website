import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {responsibilityEvidenceHash} from '../../services/responsibilityAnalyst.js';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyTransportMutations({sourceOwner,receiverOwner,exporter,capture,reset,delivery,requestKey,receiptKey}){
  const source=sourceOwner,receiver=receiverOwner;
  const definitions=new Map();
  const catalog=async(db,name)=>(await db.query('SELECT pg_get_functiondef($1::regprocedure) sql',[name])).rows[0].sql;
  for(const [db,name] of [[source,'outbox9d.remote_payload(bigint,uuid)'],[source,'outbox9d.valid_remote_receipt(jsonb,jsonb)'],[source,'outbox9d.remote_ack(bigint,uuid,jsonb)'],[source,'outbox9d.remote_delete_payload(bigint,jsonb)'],[receiver,'transport9d.receive(jsonb)']])definitions.set(name,{db,sql:await catalog(db,name)});
  async function staged(){
    await reset();await exporter.query('SELECT outbox9d.scan()');const work=(await exporter.query('SELECT outbox9d.claim() value')).rows[0].value;
    const {deriveShadowExport}=await import('../../../tools/phase9d/export-projection.mjs');
    assert.equal((await exporter.query('SELECT outbox9d.stage($1,$2,$3) value',[work.id,work.token,JSON.stringify(deriveShadowExport(work.source,requestKey))])).rows[0].value,true);
    return delivery();
  }
  const receive=p=>capture.query('SELECT transport9d.receive($1) value',[JSON.stringify(p)]).then(r=>r.rows[0].value);
  const allowed=row=>exporter.query('SELECT outbox9d.remote_payload($1,$2) value',[row.id,row.token]).then(r=>r.rows[0].value);
  const acknowledge=(row,receipt)=>exporter.query('SELECT outbox9d.remote_ack($1,$2,$3) value',[row.id,row.token,JSON.stringify(receipt)]).then(r=>r.rows[0].value);
  async function signature(body){return {body,mac:(await source.query("SELECT encode(outbox9d.hmac(($1::jsonb)::text,$2,'sha256'),'hex') value",[JSON.stringify(body),receiptKey])).rows[0].value};}
  const seeds=[];
  for(const [name,anchor,change] of [
    ['stop','c.stopped OR ',async()=>source.query('UPDATE shadow9d.control SET stopped=true')],
    ['epoch','d.epoch <> c.epoch OR ',null],
  ]){
    // pg_get_functiondef retains body spelling; the epoch anchor below is literal.
    if(name==='epoch')continue;
    seeds.push({name:'sender-'+name,routine:'outbox9d.remote_payload(bigint,uuid)',anchor,replacement:'',probe:async()=>{const row=await staged();await change();assert.equal(await allowed(row),null);}});
  }
  for(const [name,anchor,change] of [
    ['epoch','d.epoch<>c.epoch OR ',()=>source.query('UPDATE shadow9d.control SET epoch=epoch+1')],
    ['lease','d.lease_until<=c.now_at OR ',()=>source.query("UPDATE shadow9d.control SET now_at=now_at+interval '121 seconds'")],
    ['source','outbox9d.binding(outbox9d.source(d.source_work_id)) IS DISTINCT FROM d.source_binding',row=>source.query("UPDATE public.responsibility_adjudication_work SET policy_version='corrupt' WHERE id=$1",[row.source_work_id])],
  ])seeds.push({name:'sender-'+name,routine:'outbox9d.remote_payload(bigint,uuid)',anchor,replacement:name==='source'?'false':'',probe:async()=>{const row=await staged();await change(row);assert.equal(await allowed(row),null);}});
  seeds.push({name:'receiver-hash',routine:'transport9d.receive(jsonb)',anchor:"payload->>'evidenceHash' IS DISTINCT FROM encode(sha256(convert_to(transport9d.serialize((payload->'snapshot')-'generatedAt'),'UTF8')),'hex')",replacement:'false',probe:async()=>{const row=await staged();row.payload.evidenceHash='0'.repeat(64);assert.equal(await receive(row.payload),null);}});
  seeds.push({name:'receiver-duplicate-binding',routine:'transport9d.receive(jsonb)',anchor:'r.payload_binding IS DISTINCT FROM binding',replacement:'false',probe:async()=>{const row=await staged();assert.ok(await receive(row.payload));row.payload.originalCommitment='0'.repeat(64);assert.equal(await receive(row.payload),null);}});
  seeds.push({name:'receiver-supported-family',routine:'transport9d.receive(jsonb)',anchor:"COALESCE(payload#>>'{snapshot,caseType}','') NOT IN ('DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE') OR",replacement:'',probe:async()=>{const row=await staged();row.payload.snapshot.caseType='FAILED_PICKUP';row.payload.evidenceHash=responsibilityEvidenceHash(row.payload.snapshot);assert.equal(await receive(row.payload),null);}});
  for(const [name,anchor,change] of [
    ['service',"receipt#>>'{body,service}'=cfg.service_id::text AND ",body=>body.service='00000000-0000-0000-0000-000000000001'],
    ['binding',"receipt#>>'{body,payloadBinding}'=outbox9d.binding(payload) AND\n    ",body=>body.payloadBinding='0'.repeat(64)],
    ['identity',"receipt#>>'{body,key}'=payload->>'key' AND\n    ",body=>body.key='0'.repeat(64)],
  ])seeds.push({name:'receipt-'+name,routine:'outbox9d.valid_remote_receipt(jsonb,jsonb)',anchor,replacement:'',probe:async()=>{const row=await staged(),receipt=await receive(row.payload);change(receipt.body);assert.equal(await acknowledge(row,await signature(receipt.body)),false);}});
  seeds.push({name:'receipt-mac',routine:'outbox9d.valid_remote_receipt(jsonb,jsonb)',anchor:"receipt->>'mac'=encode(outbox9d.hmac((receipt->'body')::text,cfg.receipt_key,'sha256'),'hex')",replacement:'true',probe:async()=>{const row=await staged(),receipt=await receive(row.payload);receipt.mac='0'.repeat(64);assert.equal(await acknowledge(row,receipt),false);}});
  seeds.push({name:'cleanup-terminal',routine:'outbox9d.remote_delete_payload(bigint,jsonb)',anchor:"receipt#>>'{body,status}' NOT IN ('COMPLETED','MANUAL_REVIEW') OR\n    ",replacement:'',probe:async()=>{const row=await staged(),receipt=await receive(row.payload);assert.equal(await acknowledge(row,receipt),true);assert.equal((await source.query('SELECT outbox9d.remote_delete_payload($1,$2) value',[row.id,JSON.stringify(receipt)])).rows[0].value,false);}});
  const reports=[];
  for(const seed of seeds){
    const definition=definitions.get(seed.routine);assert.equal(definition.sql.split(seed.anchor).length,2,'UNIQUE_MUTATION_ANCHOR:'+seed.name);
    await seed.probe();const mutated=definition.sql.replace(seed.anchor,seed.replacement);let killed=false;
    try{await definition.db.query(mutated);try{await seed.probe();}catch(error){if(error.code==='ERR_ASSERTION')killed=true;else throw error;}}
    finally{await definition.db.query(definition.sql);}
    assert.equal(killed,true,'MEANINGFUL_SQL_SURVIVOR:'+seed.name);
    reports.push({name:seed.name,routine:seed.routine,anchor:seed.anchor,replacement:seed.replacement,status:'KILLED',baselineSha256:digest(definition.sql),mutatedSha256:digest(mutated),mutatedSql:mutated});
  }
  for(const [name,{db,sql}] of definitions)assert.equal(await catalog(db,name),sql);
  return {reports,catalogRestored:true};
}
