import {createHash} from 'node:crypto';
const nodes=['source','receiver','custodian'];
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const value=async(client,sql,args=[])=>(await client.query(sql,args)).rows[0].value;
// Fixed, minimized queries against real installed schemas. No payload/PII is
// exported, and no application record is mutated by these metadata adapters.
const selections={
  source:`SELECT id::text identity,status='ACKED' terminal,payload IS NOT NULL payload_present,
    encode(sha256(convert_to(jsonb_build_object('id',id,'binding',source_binding,'evidence',payload->>'evidenceHash')::text,'UTF8')),'hex') commitment
    FROM outbox9d.deliveries WHERE payload->>'evidenceHash'=$1 ORDER BY id LIMIT 100`,
  receiver:`SELECT q.id::text identity,q.status IN('TERMINAL','GUARDED_RESULT_COMMITTED') terminal,NOT q.cleaned payload_present,
    encode(sha256(convert_to(jsonb_build_object('id',q.id,'evidence',q.evidence_hash,'receipt',q.receipt)::text,'UTF8')),'hex') commitment
    FROM broker9d.requests q WHERE q.evidence_hash=$1 ORDER BY q.id LIMIT 100`,
  custodian:`SELECT receipt::text identity,true terminal,false payload_present,hash commitment
    FROM custody.events WHERE event->>'evidenceHash'=$1 ORDER BY custody_seq LIMIT 1`,
};
export async function selectResource(client,node,evidence){
  if(!nodes.includes(node)||!/^([a-f0-9]{64})$/.test(evidence))throw Error('INVALID_METADATA_SELECTION');
  const rows=(await client.query(selections[node],[evidence])).rows;
  if(rows.length!==1)throw Error('RESOURCE_SELECTION_NOT_UNIQUE:'+node+':'+rows.length);
  return {...rows[0],node,category:'pipeline-advisory',disposition:node==='custodian'?'RETAIN_COMMITMENTS':'MINIMIZE_PAYLOAD'};
}
export async function bindResource(client,scope,resource){
  // Refresh never clears an existing hold, epoch or tombstone. Changed source
  // identity/commitment requires an explicit new scope, not silent rebinding.
  return value(client,`WITH inserted AS (
    INSERT INTO retention9d.resources(scope,category,identity,commitment,terminal,payload_present,disposition,observed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT(scope) DO NOTHING RETURNING scope)
    SELECT EXISTS(SELECT FROM inserted) OR EXISTS(SELECT FROM retention9d.resources WHERE scope=$1 AND identity=$3 AND commitment=$4) value`,
  [scope,resource.category,resource.identity,resource.commitment,resource.terminal,resource.payload_present,resource.disposition]);
}
export async function capacityReport(installations){
  if(installations.length!==3||nodes.some(n=>!installations.some(i=>i.node===n)))throw Error('THREE_DISTINCT_NODES_REQUIRED');
  const result=[];
  for(const {node,client}of installations){
    const measurement=await value(client,'SELECT capacity9d.observe() value');
    const cluster=await value(client,'SELECT system_identifier::text value FROM pg_control_system()');
    const config=(await client.query('SELECT node,cluster_owner,physical_location,quota_verified,require_quota FROM capacity9d.configuration')).rows[0];
    result.push({node,cluster,config,measurement});
  }
  const groups=new Map();
  for(const row of result){const entries=groups.get(row.cluster)??[];entries.push(row);groups.set(row.cluster,entries);}
  for(const entries of groups.values())if(entries.filter(r=>r.config.cluster_owner).length!==1)throw Error('CLUSTER_ACCOUNTING_OWNER_REQUIRED');
  return {nodes:result,measuredBytes:result.reduce((sum,r)=>sum+BigInt(r.measurement.measured_bytes),0n).toString(),
    physicalQuotaVerified:result.every(r=>r.config.quota_verified),coverage:'DATABASES_PLUS_WAL_TEMP_ONCE_PLUS_DECLARED_EXTERNAL_NOT_COMPLETE_PGDATA'};
}
export async function acceptCapacityReport(controller,report){
  if(report.nodes.length!==3||nodes.some(n=>report.nodes.filter(r=>r.node===n).length!==1))throw Error('INCOMPLETE_CAPACITY_REPORT');
  const now=Date.now();
  for(const r of report.nodes)if(!Number.isFinite(Date.parse(r.measurement.at))||now-Date.parse(r.measurement.at)>300000)throw Error('STALE_CAPACITY_REPORT');
  // The metrics controller is trusted and has table-write access. Application
  // admission roles cannot fabricate reports or infrastructure attestations.
  await controller.query(`INSERT INTO capacity9d.global_measurement VALUES(true,clock_timestamp(),$1,$2,$3)
    ON CONFLICT(singleton) DO UPDATE SET at=excluded.at,measured_bytes=excluded.measured_bytes,quota_verified=excluded.quota_verified,nodes=excluded.nodes`,
  [report.measuredBytes,report.physicalQuotaVerified,JSON.stringify(report.nodes)]);
}
export class CapacityCoordinator{
  constructor(admission,installations){this.admission=admission;this.installations=installations;}
  async reserve(operation,costs){
    const global=await value(this.admission,'SELECT capacity9d.global_reserve($1,$2) value',[operation,costs]);
    if(global.status!=='RESERVED')return global;
    const acknowledged=[];
    for(const i of this.installations){
      if(!i.client)return {status:'PARTIAL_RESERVATION',acknowledged,pending:i.node};
      const r=await value(i.client,'SELECT capacity9d.reserve($1,$2,$3) value',['global:'+operation,costs[i.node],'NORMAL']);
      if(r.status!=='RESERVED')return {status:'PARTIAL_RESERVATION',acknowledged,pending:i.node,reason:r.status};
      acknowledged.push(i.node);
    }
    return {status:'RESERVED',acknowledged};
  }
}
// An infrastructure adapter supplies this only after reading actual owned
// volume/quota configuration. A declaration or max_wal_size is insufficient.
export async function quotaAttestation(adapter,expected){
  if(!adapter)return {verified:false,reason:'NO_INFRASTRUCTURE_ADAPTER'};
  const result=await adapter.inspect(expected);
  if(result.owner!==expected.owner||result.location!==expected.location||!result.enforced||!Number.isSafeInteger(result.hardBytes)||result.hardBytes<=0)throw Error('INVALID_QUOTA_ATTESTATION');
  return {verified:true,hardBytes:result.hardBytes,location:result.location,owner:result.owner,observedAt:new Date().toISOString()};
}
