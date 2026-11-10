import {readFile} from 'node:fs/promises';
import {bindResource,selectResource,value} from './management-adapters.mjs';

const relations={
  source:[['outbox9d.deliveries','id','payload']],
  receiver:[['broker9d.requests','id','payload'],['shadow9d.work','id','snapshot,result']],
  custodian:[['custody.events','receipt','event,hash']],
};
const admissions={source:[['outbox9d.deliveries','id']],receiver:[['broker9d.requests','id'],['broker9d.attempts','id']],custodian:[['custody.events','receipt']]};

export async function installManagementRemaining(installations){
  const sql=await Promise.all(['management-observation.sql','management-hold-guards.sql'].map(n=>readFile(new URL(n,import.meta.url),'utf8')));
  for(const {node,client} of installations){
    if(!Object.hasOwn(relations,node))throw Error('UNKNOWN_MANAGEMENT_NODE');
    await client.query(sql.join('\n'));
    await client.query(`INSERT INTO capacity9d.observation_policy VALUES(true,536870912,805306368,500,900,20,300)`);
    for(const [relation,key,columns] of relations[node]){
      await client.query(`CREATE TRIGGER retention_row_fence BEFORE UPDATE OR DELETE ON ${relation} FOR EACH ROW EXECUTE FUNCTION retention9d.guard_retained_row('${key}','${columns}');
        CREATE TRIGGER retention_truncate_fence BEFORE TRUNCATE ON ${relation} FOR EACH STATEMENT EXECUTE FUNCTION retention9d.guard_retained_truncate()`);
    }
    // Audit/STOP/recovery records are intentionally not new-work admission points.
    for(const [relation,key] of admissions[node])await client.query(`CREATE TRIGGER remaining_primary_admission BEFORE INSERT ON ${relation} FOR EACH ROW EXECUTE FUNCTION capacity9d.admit_observed('${key}')`);
    await client.query(`GRANT EXECUTE ON FUNCTION capacity9d.record_external(text,bigint),capacity9d.reconcile() TO management_sensor;
      GRANT SELECT ON capacity9d.observation_policy,capacity9d.external_sources,capacity9d.reconciliation,retention9d.guarded_rows TO management_reader`);
  }
}

export async function bindGuardedResource(client,node,scope,evidence){
  if(!Object.hasOwn(relations,node))throw Error('UNKNOWN_MANAGEMENT_NODE');
  const resource=await selectResource(client,node,evidence);
  if(!await bindResource(client,scope,resource))throw Error('RESOURCE_BINDING_CONFLICT');
  for(const [relation] of relations[node]){
    const identity=relation==='shadow9d.work'
      ?await value(client,'SELECT receipt::text value FROM broker9d.requests WHERE id=$1',[resource.identity]):resource.identity;
    if(identity===null||identity===undefined)throw Error('RELATED_RECORD_MISSING');
    await client.query('INSERT INTO retention9d.guarded_rows VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[scope,relation,identity]);
  }
  return resource;
}
