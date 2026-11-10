import assert from 'node:assert/strict';

// Paired evidence for the closed, JSON-decoded transport composition. Error
// classes/messages are deliberately not an interface: ingress returns opaque 503.
export function contractOutcomes(module,protocol){
  const uuid='ffffffff-ffff-ffff-ffff-ffffffffffff',hex='f'.repeat(64),key='synthetic-contract-paired-witness-key';
  const base={schema:'custody-event-v1',source:uuid,service:'broker-receiver-v1',database:hex,sequence:'9'.repeat(15),previous:hex,localId:'9'.repeat(15),sourceHash:hex,action:'REGISTER',actor:'broker9d_exec',request:uuid,attempt:uuid,evidenceHash:hex,evidenceVersion:'responsibility-evidence-v1',receipt:uuid,configuration:hex,generation:'9'.repeat(15),frozen:protocol.FROZEN,observed:'9999-12-31T23:59:59.999Z'};
  const brokerActions=['REGISTER','RESERVE','BUDGET_DENIED','DISPATCH_ADMITTED','SEND_ATTEMPT','RESPONSE_OBSERVED','OUTCOME_UNKNOWN','RECOVER','GUARDED_RESULT_COMMITTED','USAGE_RECONCILED','USAGE_CONFLICT','UNSENT_TERMINAL_RELEASE','OPERATION_STOP','OPERATION_RESUME','OPERATION_TERMINATE','OPERATION_CLEAN'];
  const actors=['application_transaction','shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_worker','shadow9d_recorder','custody_operator','trusted_observer','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'];
  const services={'source-lineage-v2':['SOURCE_LINEAGE','OUTBOX_CREATED','OUTBOX_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],'receiver-lineage-v2':['RECEIPT_ACCEPTED','WORK_ADMITTED','WORK_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],'denial-observer-v2':['PERMISSION_DENIED','AUTHENTICATION_FAILED']};
  const events=[];
  for(const actor of ['broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'])for(const action of brokerActions)events.push({...base,actor,action});
  for(const [service,actions]of Object.entries(services))for(const actor of actors)for(const action of actions)events.push({...base,schema:'custody-event-v2',service,actor,action,identityHash:hex,ownerHash:hex});
  const denialClasses=['APPLICATION_WRITE','BUDGET_CONFIGURATION','AUDIT_HISTORY','ROLE_ESCALATION','AUTHENTICATION','SIGNING_SECRET','GUARD_WRITE','OPERATIONS_CONTROL','DATABASE_DENIAL'];
  for(const sqlstate of ['42501','28P01'])for(const denialClass of denialClasses)events.push({...base,schema:'custody-denial-v1',service:'denial-observer-v2',actor:'trusted_observer',action:sqlstate==='42501'?'PERMISSION_DENIED':'AUTHENTICATION_FAILED',identityHash:hex,ownerHash:null,serverIdentity:hex,authenticatedRole:'a'.repeat(63),actorTrust:sqlstate==='42501'?'AUTHENTICATED':'CLAIMED_UNAUTHENTICATED',sqlstate,logSessionHash:hex,logLine:'9'.repeat(15),denialClass});
  const allowed=fn=>{try{fn();return true;}catch{return false;}};
  const outcomes=[],sizes=[];
  for(const event of events){
    const frame={event,mac:protocol.sourceMac(event,key)},sources=new Map([[uuid,{id:uuid,service:event.service,key}]]);
    sizes.push(Buffer.byteLength(JSON.stringify(frame)));
    outcomes.push(allowed(()=>module.validateClosureEvent(event)),allowed(()=>module.validateClosureEnvelope(frame,sources)),allowed(()=>module.validateClosureFrame(frame,sources)));
    assert.deepEqual(outcomes.slice(-3),[true,true,true]);
    outcomes.push(allowed(()=>module.validateClosureFrame({...frame,mac:'0'.repeat(64)},sources)));
    assert.equal(outcomes.at(-1),false);
  }
  // Enum widths are enumerated above; all other maximal-width fields are ASCII
  // regex bounds or fixed literals. A valid frame cannot approach 8192 bytes.
  const maximalAdmittedBytes=Math.max(...sizes);assert.ok(maximalAdmittedBytes<8192);
  const representatives=[events[0],events.find(e=>e.service==='source-lineage-v2'),events.find(e=>e.service==='receiver-lineage-v2'),events.find(e=>e.schema==='custody-denial-v1')];
  const patches=[{schema:'unknown'},{service:'unknown'},{actor:'unknown'},{action:'unknown'},{source:'invalid'},{sequence:'0'},{localId:'1'.repeat(16)},{database:'0'},{previous:'0'},{sourceHash:'0'},{evidenceHash:'0'},{configuration:'0'},{request:'invalid'},{attempt:'invalid'},{receipt:'invalid'},{generation:'-1'},{evidenceVersion:'unknown'},{observed:'2026-02-30T00:00:00.000Z'},{observed:'2026-10-15T24:00:00.000Z'},{extra:'x'.repeat(9000)}];
  for(const event of representatives){
    const sources=new Map([[uuid,{id:uuid,service:event.service,key}]]);
    for(const patch of patches){const changed={...event,...patch},frame={event:changed,mac:protocol.sourceMac(changed,key)};outcomes.push(allowed(()=>module.validateClosureFrame(frame,sources)));assert.equal(outcomes.at(-1),false);}
    const frame={event,mac:protocol.sourceMac(event,key)};
    for(const changed of [{...frame,extra:true},{...frame,mac:'Z'+frame.mac},{...frame,mac:frame.mac+'Z'},{event:null,mac:frame.mac}]){outcomes.push(allowed(()=>module.validateClosureFrame(changed,sources)));assert.equal(outcomes.at(-1),false);}
    outcomes.push(allowed(()=>module.validateClosureFrame(frame,new Map())));assert.equal(outcomes.at(-1),false);
  }
  return {outcomes,maximalAdmittedBytes,admittedEnumCombinations:events.length,interface:'closed JSON frames and opaque admission outcome; private thrown error identity excluded'};
}
