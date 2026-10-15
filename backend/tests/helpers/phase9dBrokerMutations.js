import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=text=>createHash('sha256').update(text).digest('hex');
export async function brokerSqlMutations(owner,probes){
  const rows=(await owner.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='broker9d' ORDER BY 1")).rows;
  const reports=[];
  for(const seed of probes){
    const original=rows.find(row=>row.signature.startsWith('broker9d.'+seed.routine+'('));assert.ok(original);
    assert.equal(original.definition.split(seed.from).length,2,'UNIQUE_MUTATION_ANCHOR');
    const baseline=await seed.probe();assert.equal(baseline,false,'BASELINE_DENIAL');
    const mutant=original.definition.replace(seed.from,seed.to);
    try{await owner.query(mutant);assert.equal(await seed.probe(),true,'MUTANT_MUST_BREAK_DENIAL');reports.push({name:seed.name,signature:original.signature,baselineSha256:sha(original.definition),mutantSql:mutant,mutantSha256:sha(mutant),status:'KILLED'});}
    finally{await owner.query(original.definition);}
  }
  const restored=(await owner.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='broker9d' ORDER BY 1")).rows;
  assert.deepEqual(restored,rows);return {reports,catalogRestored:true};
}
