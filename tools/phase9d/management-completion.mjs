import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {value} from './management-adapters.mjs';

export async function installManagementCompletion(installations){
  const sql=await readFile(new URL('./management-completion.sql',import.meta.url),'utf8');
  for(const i of installations){
    await i.client.query(sql);
    await i.client.query(`GRANT EXECUTE ON FUNCTION retention9d.preservation_node(),retention9d.preserve_remaining(text,text) TO management_hold;
      GRANT EXECUTE ON FUNCTION capacity9d.queue_alerts(),capacity9d.claim_alert(text,uuid),capacity9d.finish_alert(uuid,uuid,text,text),capacity9d.alert_backlog() TO management_operator;
      GRANT SELECT ON retention9d.preservation_barriers,capacity9d.alert_delivery TO management_reader`);
  }
}

// The supplied authenticated clients/controller remain trusted. Reachable-node
// preservation is retryable; an unavailable node or in-flight prior commit is
// never reported as an instantaneous distributed hold guarantee.
export async function preserveRemaining(installations,{scope,approval}){
  const expected=['source','receiver','custodian'];
  if(installations.length!==3||expected.some(n=>installations.filter(i=>i.node===n).length!==1))throw Error('THREE_DISTINCT_NODES_REQUIRED');
  const observations=[];
  for(const i of installations){
    if(!i.client){observations.push({node:i.node,status:'PENDING_NODE'});continue;}
    const actual=await value(i.client,'SELECT retention9d.preservation_node() value');
    if(actual!==i.node)throw Error('PRESERVATION_NODE_MISMATCH');
    const response=await value(i.client,'SELECT retention9d.preserve_remaining($1,$2) value',[scope,approval]);
    observations.push({node:i.node,...response});
  }
  const complete=observations.every(r=>['PRESERVED','ERASED_COPY_CONFLICT'].includes(r.status));
  return {status:complete?'MANUAL_REVIEW_REQUIRED':'PARTIAL_PRESERVATION',observations,productionDeletion:false,productionRestoreAuthorized:false};
}

export class ManagementAlertRelay{
  constructor(client,{destination=null,deliver=null}={}){this.client=client;this.destination=destination;this.deliver=deliver;}
  async once(){
    await value(this.client,'SELECT capacity9d.queue_alerts() value');
    if(!this.destination||!this.deliver)return {status:'ROUTING_UNCONFIGURED'};
    const token=randomUUID();
    const item=await value(this.client,'SELECT capacity9d.claim_alert($1,$2) value',[this.destination,token]);
    if(!item){
      const backlog=await value(this.client,'SELECT capacity9d.alert_backlog() value');
      return {status:backlog.unrepresented>0||backlog.review>0?'REVIEW_REQUIRED':'EMPTY',backlog};
    }
    // Adapter must use item.id as its idempotency key. A missing response keeps
    // the durable lease pending; no database transaction spans the network.
    const receipt=await this.deliver({...item,idempotencyKey:item.id});
    if(!receipt||receipt.id!==item.id||receipt.destination!==this.destination||typeof receipt.receipt!=='string')return {status:'RECEIPT_REJECTED',id:item.id};
    const accepted=await value(this.client,'SELECT capacity9d.finish_alert($1,$2,$3,$4) value',[item.id,token,this.destination,receipt.receipt]);
    return {status:accepted?'DELIVERED':'ACK_REJECTED',id:item.id};
  }
}
