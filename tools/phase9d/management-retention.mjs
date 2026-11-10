import {value} from './management-adapters.mjs';
const names=['source','receiver','custodian'];
// Authorized management controller is a trusted root, as is the existing
// verifier. Receipts are closed/bound SQL observations, not new cryptography.
export class RetentionCoordinator{
  constructor(coordinator,installations,holdController=coordinator){
    if(installations.length!==3||names.some(n=>!installations.some(i=>i.node===n)))throw Error('THREE_DISTINCT_NODES_REQUIRED');
    this.coordinator=coordinator;this.installations=installations;this.holdController=holdController;
  }
  async run({operation,scope,version,approval,stopAfter=null}){
    const c=this.coordinator;
    const started=await value(c,'SELECT retention9d.begin_delete($1,$2,$3,$4) value',[operation,scope,version,approval]);
    if(started.status==='COMPLETE')return started;
    if(!['PREPARING','COMMITTING'].includes(started.status))return started;
    const epoch=String(started.epoch);
    if(started.status==='PREPARING'){
      for(const i of this.installations){
        if(!i.client)return {status:'PENDING_NODE',node:i.node,epoch};
        const receipt=await value(i.client,'SELECT retention9d.local_prepare($1,$2,$3,$4,$5) value',[operation,scope,epoch,version,approval]);
        if(receipt.status!=='PREPARED')return {status:'PREPARE_REFUSED',node:i.node,reason:receipt.status,epoch};
        if(!await value(c,'SELECT retention9d.ack_prepare($1,$2,$3) value',[operation,i.node,receipt]))throw Error('PREPARE_ACK_REJECTED');
        if(stopAfter===i.node)return {status:'PARTIAL_PREPARE',node:i.node,epoch};
      }
      const decision=await value(c,'SELECT retention9d.authorize($1) value',[operation]);
      if(decision.status!=='COMMITTING')return decision;
    }
    for(const i of this.installations){
      if(!i.client)return {status:'PENDING_NODE',node:i.node,epoch};
      const receipt=await value(i.client,'SELECT retention9d.local_commit($1,$2,$3,$4,false) value',[operation,scope,epoch,version]);
      if(!['SIMULATED_PAYLOAD_PURGE','RETAINED_COMMITMENTS'].includes(receipt.status))return {status:'COMMIT_REFUSED',node:i.node,reason:receipt.status,epoch};
      if(!await value(c,'SELECT retention9d.ack_commit($1,$2,$3) value',[operation,i.node,receipt]))throw Error('COMMIT_ACK_REJECTED');
      if(stopAfter==='commit:'+i.node)return {status:'PARTIAL_COMMIT',node:i.node,epoch};
    }
    return {status:'COMPLETE',epoch,productionDeletion:false};
  }
  async hold(scope,release,approval){
    // Fence the authoritative decision FIRST. If this cannot commit, no node
    // can be promised held. Propagation can remain partial and is retryable.
    const central=await value(this.holdController,'SELECT retention9d.hold($1,$2,$3) value',[scope,release,approval]);
    if(!['HELD','RELEASED'].includes(central.status))return central;
    const acknowledgements=[];
    for(const i of this.installations){
      if(!i.holdClient){acknowledgements.push({node:i.node,status:'PENDING'});continue;}
      const receipt=i.holdClient===this.holdController?central:await value(i.holdClient,'SELECT retention9d.hold($1,$2,$3) value',[scope,release,approval]);
      if(!await value(this.holdController,'SELECT retention9d.ack_hold($1,$2,$3) value',[approval,i.node,receipt]))throw Error('HOLD_ACK_REJECTED');
      acknowledgements.push({node:i.node,...receipt});
    }
    return {status:acknowledgements.every(r=>r.status===central.status)?central.status:'PARTIAL_HOLD',acknowledgements};
  }
  async restoreDecision(scope){
    const results=[];
    for(const i of this.installations){
      results.push({node:i.node,allowed:i.client?await value(i.client,'SELECT retention9d.restore_allowed($1) value',[scope]):false});
    }
    return {status:results.every(r=>r.allowed)?'REVIEW_REQUIRED':'QUARANTINE',productionRestoreAuthorized:false,results};
  }
}
