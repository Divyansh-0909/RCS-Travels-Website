import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deriveShadowExport} from '../../../tools/phase9d/export-projection.mjs';
import {responsibilityEvidenceHash} from '../../services/responsibilityAnalyst.js';
import {EXPORT_TEST_KEY} from './phase9dExportFixture.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function verifyOutboxMutations({admin,exporter,repository,reset,source,advance,witness}){
  const lease=async()=>{await reset();await repository.scan();const work=await repository.claim();return {work,payload:deriveShadowExport(work.source,EXPORT_TEST_KEY)};};
  const stageProbe=change=>async()=>{const context=await lease();await change(context);return await repository.stage(context.work,context.payload)===false;};
  const definitions=(await admin.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='outbox9d' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='shadow9d_owner') ORDER BY signature")).rows;
  const seeds=[
    ['scan-stop','scan()', 'c.stopped OR ', '',async()=>{await reset();await admin.query('UPDATE shadow9d.control SET stopped=true');return await repository.scan()===0;}],
    ['scan-capacity','scan()', '>=c.queue_limit', '>=c.queue_limit+1',async()=>{await reset();await source();await admin.query('UPDATE shadow9d.control SET queue_limit=1');return await repository.scan()===1&&await repository.scan()===0;}],
    ['claim-stop','claim()', 'c.stopped OR ', '',async()=>{await reset();await repository.scan();await admin.query('UPDATE shadow9d.control SET stopped=true');return await repository.claim()===null;}],
    ['claim-capacity','claim()', '>=c.max_concurrent', '>=c.max_concurrent+1',async()=>{await reset();await source();await repository.scan();await admin.query('UPDATE shadow9d.control SET max_concurrent=1');await repository.claim();return await repository.claim()===null;}],
    ['claim-exhaustion','claim()', 'AND attempts>=4', 'AND attempts>4',async()=>{await lease();await admin.query('UPDATE outbox9d.deliveries SET attempts=4');await advance(121);await repository.claim();return (await admin.query('SELECT status FROM outbox9d.deliveries')).rows[0].status==='MANUAL_REVIEW';}],
    ['stage-token','stage(bigint,uuid,jsonb)', ' OR d.token IS DISTINCT FROM token', '',stageProbe(({work})=>{work.token='00000000-0000-0000-0000-000000000000';})],
    ['stage-epoch','stage(bigint,uuid,jsonb)', ' OR d.epoch<>c.epoch', '',stageProbe(()=>admin.query('UPDATE shadow9d.control SET epoch=epoch+1'))],
    ['stage-expiry','stage(bigint,uuid,jsonb)', ' OR d.lease_until<=c.now_at', '',stageProbe(()=>advance(121))],
    ['stage-key','stage(bigint,uuid,jsonb)', " OR payload->>'key' IS DISTINCT FROM outbox9d.pseudonym('export-v1:'||d.source_work_id)", '',stageProbe(({payload})=>{payload.key='f'.repeat(64);})],
    ['stage-original-commitment','stage(bigint,uuid,jsonb)', " OR payload->>'originalCommitment' IS DISTINCT FROM outbox9d.pseudonym(s->>'evidenceHash')", '',stageProbe(({payload})=>{payload.originalCommitment='f'.repeat(64);})],
    ['stage-projection','stage(bigint,uuid,jsonb)', "payload->'snapshot' IS DISTINCT FROM outbox9d.projection(s->'snapshot') OR ", '',stageProbe(({payload})=>{payload.snapshot.bookingId='f'.repeat(64);payload.evidenceHash=responsibilityEvidenceHash(payload.snapshot);})],
    ['delivery-source-binding','deliver(bigint,uuid)', 'IF outbox9d.binding(outbox9d.source(d.source_work_id)) IS DISTINCT FROM d.source_binding THEN RETURN NULL; END IF;', '',async()=>{
      const {work,payload}=await lease();await repository.stage(work,payload);await admin.query("UPDATE public.responsibility_evidence_versions SET generated_at=generated_at+interval '1 second'");return await repository.deliver(work)===null;}],
    ['delivery-stop','deliver(bigint,uuid)', 'c.stopped OR ', '',async()=>{
      const {work,payload}=await lease();await repository.stage(work,payload);await admin.query('UPDATE shadow9d.control SET stopped=true');
      const before=(await admin.query("SELECT count(*)::int n FROM audit9d.events WHERE action='CAPTURE_STOPPED'")).rows[0].n;
      const denied=await repository.deliver(work)===null;
      return denied&&(await admin.query("SELECT count(*)::int n FROM audit9d.events WHERE action='CAPTURE_STOPPED'")).rows[0].n===before;}],
  ];
  witness.seededMutations=[];await exporter.query('SET plpgsql_check.profiler=off');
  try{
    for(const [id,signature,anchor,replacement,probe]of seeds){
      const original=definitions.find(row=>row.signature.replaceAll(' ','')==='outbox9d.'+signature).definition;
      assert.equal(original.split(anchor).length,2,'unique seed anchor '+id);assert.equal(await probe(),true,'baseline '+id);
      const mutated=original.replace(anchor,replacement);let detected;
      try{await admin.query(mutated);detected=!await probe();}finally{await admin.query(original);}
      witness.seededMutations.push({id,signature,originalSha256:hash(original),mutatedSha256:hash(mutated),mutatedSql:mutated,status:detected?'KILLED':'SURVIVED'});assert.equal(detected,true,id);
    }
    const restored=(await admin.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='outbox9d' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='shadow9d_owner') ORDER BY signature")).rows;
    assert.deepEqual(restored,definitions);witness.mutationCatalogRestored=true;
  }finally{await exporter.query('SET plpgsql_check.profiler=on');}
}
