// Trusted disposable bootstrap only. Runtime exporter never imports this module.
import {createRequire} from 'node:module';
import {createScheduledScenario} from '../../backend/tests/helpers/scheduledScenario.js';
import {createResponsibilityEvidence} from '../../backend/services/responsibilityEvidence.js';
import {responsibilityEvidenceHash} from '../../backend/services/responsibilityAnalyst.js';
export function outboxCapsuleFixture(at){
  const {Prisma}=createRequire(new URL('../../backend/package.json',import.meta.url))('@prisma/client');
  const scenario=createScheduledScenario({now:at}),booking=scenario.bookingStates.current,driver=scenario.driversByGroup.rcs;
  const caseId=`driver-cancellation:${booking.id}:${driver.id}`,cancellationId='synthetic-capsule-cancellation';
  const collector=createResponsibilityEvidence({caseId,bookingId:booking.id,caseType:'DRIVER_CANCELLATION',scheduledAt:booking.scheduledAt,occurredAt:at,clock:{now:()=>new Date(at)}});
  collector.record({category:'booking',kind:'synthetic_committed_booking',source:'booking:'+booking.id,value:{bookingId:booking.id,userId:booking.userId}});
  collector.record({category:'assignment',kind:'synthetic_original_assignment',source:'booking:'+booking.id,value:{driverId:driver.id}});
  collector.record({category:'cancellation',kind:'driver_cancellation_recorded',source:'driver_cancellation:'+cancellationId,value:{cancellationId,initiator:'driver'}});
  const snapshot=collector.snapshot(),hash=responsibilityEvidenceHash(snapshot);
  const quote=value=>value===null?'NULL':"'"+(typeof value==='object'&&!(value instanceof Date)?JSON.stringify(value):value instanceof Date?value.toISOString():String(value)).replaceAll("'","''")+"'";
  const sql=[];
  const insert=(name,data)=>{
    const model=Prisma.dmmf.datamodel.models.find(item=>item.name===name);
    sql.push('INSERT INTO public."'+model.dbName+'" ('+Object.keys(data).map(key=>'"'+(model.fields.find(field=>field.name===key).dbName??key)+'"').join(',')+') VALUES ('+Object.values(data).map(quote).join(',')+');');
  };
  insert('User',scenario.customer);
  for(const record of scenario.drivers){const copy={...record};delete copy.activeVehicleId;insert('Driver',copy);}
  for(const record of scenario.vehicles)insert('Vehicle',record);
  for(const record of scenario.locations)insert('DriverLocation',record);
  for(const record of scenario.bookings)insert('Booking',record.id===booking.id?{...record,status:'confirmed',driverId:null}:record);
  insert('DriverCancellation',{id:cancellationId,bookingId:booking.id,driverId:driver.id,fromStatus:'assigned',reason:'synthetic',createdAt:new Date(at)});
  insert('ResponsibilityCase',{id:caseId,sourceKey:caseId,bookingId:booking.id,caseType:'DRIVER_CANCELLATION',state:'NEEDS_ADMIN_REVIEW',
    evidenceVersion:snapshot.evidenceVersion,evidenceHash:hash,evidenceSnapshot:snapshot,occurredAt:new Date(at),scheduledAt:booking.scheduledAt,updatedAt:new Date(at)});
  insert('ResponsibilityEvidenceVersion',{id:'synthetic-capsule-evidence',caseId,evidenceVersion:snapshot.evidenceVersion,evidenceHash:hash,snapshot,generatedAt:new Date(at)});
  insert('ResponsibilityAdjudicationWork',{id:'synthetic-capsule-work',caseId,evidenceVersionId:'synthetic-capsule-evidence',logicalKey:'synthetic-capsule-work',contractVersion:'responsibility-analysis-v1',
    analystConfigVersion:'responsibility-analyst-config-v1',policyVersion:'scheduled-responsibility-policy-v1',status:'PENDING',updatedAt:new Date(at)});
  return {sql:sql.join('\n'),snapshot,sourceType:'explicit-coherent-synthetic-fixture',actualCollectorExecution:false};
}
