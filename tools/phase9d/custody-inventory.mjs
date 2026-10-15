import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {hash} from './baseline.mjs';
const output='output/phase9d-audit-custody-2026-10-14';
const definitions=[
  ['incident/evidence creation','application','ResponsibilityCase/Evidence/ShadowWork','committed lifecycle transaction','outbox.sql'],
  ['source outbox creation','shadow9d_exporter','outbox9d.deliveries','scan transaction','outbox.sql'],
  ['transmission admission','shadow9d_exporter','outbox9d.deliveries','claim/stage transaction','transport-sender.sql'],
  ['delivery acceptance','shadow9d_capture','shadow9d.work','receive transaction','transport-receiver.sql'],
  ['receiver receipt','shadow9d_capture','transport9d.receipts','receive transaction','transport-receiver.sql'],
  ['duplicate/conflicting rejection','shadow9d_capture','audit9d.events','only committed explicit denial; privilege/rollback separate','permissions.sql'],
  ['broker registration','broker9d_exec','broker9d.events:REGISTER','register transaction','broker.sql'],
  ['reservation/denial','broker9d_exec','broker9d.events:RESERVE/BUDGET_DENIED','reserve transaction','broker.sql'],
  ['dispatch admission','broker9d_exec','broker9d.events:DISPATCH_ADMITTED','admit transaction','broker.sql'],
  ['physical-send marker','broker9d_exec','broker9d.events:SEND_ATTEMPT','begin_send; not proof of network delivery','broker.sql'],
  ['provider observation','broker9d_exec','broker9d.events:RESPONSE_OBSERVED/OUTCOME_UNKNOWN','observe/unknown transaction','broker-recovery.sql'],
  ['usage reconciliation','broker9d_reconciler','broker9d.events:USAGE_RECONCILED/USAGE_CONFLICT','reconcile transaction','broker-recovery.sql'],
  ['stop/resume','broker9d_ops','broker9d.events:OPERATION_STOP/RESUME','operate control lock transaction','broker-recovery.sql'],
  ['lease expiration','broker9d_exec','broker9d.events:RECOVER','recovery transaction; passive expiry has no event','broker.sql'],
  ['process recovery','supervisor','process observation + RECOVER','no universal process journal','broker-recovery.sql'],
  ['guard execution','broker9d_guard','guard_input + in-memory policy gate','execution without commit has no event','broker-guard.mjs'],
  ['guarded persistence','broker9d_guard','broker9d.events:GUARDED_RESULT_COMMITTED','commit_result transaction','broker.sql'],
  ['manual operations','broker9d_ops','broker9d.operations/events','operate transaction','broker-recovery.sql'],
  ['terminal cleanup','broker9d_ops','broker9d.events:OPERATION_CLEAN','operate transaction; commitments survive','broker-recovery.sql'],
  ['unauthorized access','database/service observer','server SQLSTATE/admission observation','independent of failed transaction; not every attempted action observable','permissions.sql']
];
await mkdir(output,{recursive:true});
const matrix=[];
for(const [action,principal,authority,boundary,file] of definitions){
  const source='tools/phase9d/'+file;
  matrix.push({action,principal,authority,boundary,source,sourceHash:hash(await readFile(source)),
    currentCustodyOwner:'local schema owner; independent remote custody not yet implemented',
    actorMayMutateHistory:false,sequence:'local event ID where persisted; not a cross-service sequence',
    binding:'journal/source/receipt/request/attempt/configuration identities where supplied by current schema',
    denialObservation:'committed voluntary events only; PostgreSQL rollback/42501 requires independent server observer',
    gapDetection:'not yet independent; new broker-event chain is the first implementation slice',
    plannedScope:authority.startsWith('broker9d.')?'broker journal export':'carry-forward PARTIAL'});
}
await writeFile(output+'/audit-coverage-matrix-before.json',JSON.stringify({schema:'audit-boundary-inventory-v1',at:new Date().toISOString(),implemented:false,matrix},null,2),{flag:'wx'});
