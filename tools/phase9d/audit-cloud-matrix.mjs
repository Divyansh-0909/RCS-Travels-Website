import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {hash} from './baseline.mjs';
import {closureBaseline} from './closure-baseline.mjs';
const output=resolve(process.env.CUSTODY_OUTPUT??'output/phase9d-custody-closure-cloud-2026-10-15');
await mkdir(output,{recursive:true});
const definitions=[
  ['SOURCE','Committed incident/evidence lineage','closure-source-lineage.sql','custody_lineage.capture_committed','public.responsibility_adjudication_work + outbox9d.source','Deferred scan after the application commit; not atomic with that commit','shadow9d_exporter','lineage','Suppression/deletion before scan is unobservable without independent application observation; full original journals are not replayed by this scan'],
  ['OUTBOX','Outbox creation and terminal transitions','closure-lineage.sql','custody_lineage.capture','outbox9d.deliveries','AFTER INSERT/UPDATE in the producing shadow transaction','shadow9d_exporter','lineage','Snapshot transition commitments; owner can suppress triggers. Saturation must never enter booking/payment transactions'],
  ['TRANSPORT','Receipt acceptance and conflicts','closure-lineage.sql','custody_lineage.capture','transport9d.receipts + audit9d.events','Receipt and committed local audit triggers in receive transaction','shadow9d_capture','lineage','Rolled-back conflicts have no committed voluntary audit event; only supported server denials have a separate observer'],
  ['ADMISSION','Receiver work admission/changes','closure-lineage.sql','custody_lineage.capture','shadow9d.work','AFTER INSERT/UPDATE in receiver transaction','shadow9d_capture','lineage','Missing-event comparison for every receiver transition remains unproved'],
  ...[
    ['REGISTER','Broker registration','REGISTER','broker.sql','broker9d.register','broker9d_exec'],
    ['BUDGET','Reservation and budget denial','RESERVE/BUDGET_DENIED','broker.sql','broker9d.reserve','broker9d_exec'],
    ['DISPATCH','Dispatch admission','DISPATCH_ADMITTED','broker.sql','broker9d.admit','broker9d_exec'],
    ['SEND','Physical send admission','SEND_ATTEMPT','broker.sql','broker9d.begin_send','broker9d_exec'],
    ['OBSERVE','Provider response and uncertain outcome','RESPONSE_OBSERVED/OUTCOME_UNKNOWN','broker-recovery.sql','broker9d.observe/unknown','broker9d_exec'],
    ['USAGE','Authenticated usage reconciliation/conflict','USAGE_RECONCILED/USAGE_CONFLICT','broker-recovery.sql','broker9d.reconcile','broker9d_reconciler'],
    ['GUARD','Committed independent guard result','GUARDED_RESULT_COMMITTED','broker.sql','broker9d.commit_result','broker9d_guard'],
    ['CONTROL','Operational stop/resume','OPERATION_STOP/OPERATION_RESUME','broker-recovery.sql','broker9d.operate','broker9d_ops'],
    ['RECOVERY','Broker lease recovery','RECOVER','broker.sql','broker9d.recover','broker9d_exec'],
    ['TERMINAL','Manual termination and terminal cleanup','OPERATION_TERMINATE/OPERATION_CLEAN','broker-recovery.sql','broker9d.operate','broker9d_ops']
  ].map(([id,requirement,event,file,entry,principal])=>[id,requirement,file,entry,'broker9d.events:'+event,'AFTER INSERT custody_export.capture in the original broker transaction',principal,'db','Independent sourceCaptureStatus detects committed broker journal/capture divergence within its 1,000-row inspection bound; suppressing both is unobservable']),
  ['RETRY','Manual custody recovery authorization','closure-lineage.sql','custody_lineage.capture','custody_export.retries','AFTER INSERT in retry transaction','custody_operator','lineage','Lineage retry/recovery and its own saturation require further tests'],
  ['DENIAL','Independent permission/authentication denial','closure-observer.mjs','minimizeServerDenials/appendDenialObservations','PostgreSQL JSON server logs from host-owned Docker channel','Outside denied transaction; bounded host spool, then independent ingress','trusted host observer','capsule','Host can suppress logs; session line identities do not establish complete server-log coverage. Authentication role is claimed, not authenticated'],
  ['UNCOMMITTED_GUARD','Guard execution without result commit','broker-guard.mjs','guardBrokerAttempt','In-memory guard; no authoritative execution journal','No durable event if process dies before result persistence','broker9d_guard',null,'Uncommitted execution suppression is unobservable with current sources'],
  ['EXPIRY','Passive lease expiry','broker.sql','broker9d.recover','No event until recover is invoked','No transaction for passage of time','broker9d_exec',null,'Do not infer an observed expiry from elapsed wall time or later recovery']
];
const matrix=[];
for(const [id,requirement,file,entry,eventSource,boundary,principal,test,risk]of definitions){
  const source='tools/phase9d/'+file,bytes=await readFile(source);
  matrix.push({id,requirement,producingEntryPoint:entry,producingSource:source,sourceSha256:hash(bytes),actualEventSource:eventSource,
    localTransactionBoundary:boundary,independentDestination:test?'separate custody PostgreSQL server, custody.events/signatures':'NONE',requiredPrincipal:principal,
    deliveryRecovery:test==='db'?'durable at least once; 3 sends then REVIEW; 3 operator recovery cycles; original receipts reused':test?'bounded lineage/observer chain; gaps rejected; lineage recovery incomplete':'NOT_IMPLEMENTED',
    existingTest:test==='db'?'backend/tests/integration/phase9dCustody.test.js; phase9dCustodyClosure.test.js':test==='lineage'?'backend/tests/integration/phase9dCustodyLineage.test.js':test==='capsule'?'tools/phase9d/closure-capsule.mjs':'NONE',
    missingTest:test?'Current-source fresh delivery/restart/security evidence; full omission and saturation behavior':'Independent trusted execution observation, if required by approved scope',
    securityRisk:risk,acceptanceStatus:test?'PARTIAL':'NOT_IMPLEMENTED'});
}
const requirements=[
  ['A','Complete original-to-current acceptance reconciliation','PARTIAL','Historical matrix/readiness JSON unavailable; this source reconstruction cannot reproduce missing rows'],
  ['B','Critical event coverage and missing-event distinctions','PARTIAL','Committed broker/source/outbox/receiver capture exists; suppression and uncommitted execution remain bounded gaps'],
  ['C','Eight denial categories delivered independently','PARTIAL','Actual JSON server observations require current capsule delivery; host logging continuity is a trust boundary'],
  ['D','Restricted sender/verifier/ingress/signer/observer containers','PARTIAL','Recorded capsule failure must be reproduced; per-service network path and cross-database restrictions need proof'],
  ['E','Receipt-verifier credential compromise','PARTIAL','SQL does not verify Ed25519; independent remote inspection detects false acknowledgement. Source ACKED never grants authority'],
  ['F','Historical signing key lifecycle','PARTIAL','Versioned keys and durable signatures exist; interruption, race, restart and substitution tests remain'],
  ['G','Bounded backlog/storage and actual failure recovery','PARTIAL','Broker pressure, retained lineage count and HTTP limits exist; STOP reserve/disk exhaustion and complete recovery scenarios remain'],
  ['H','Authority-changing externally audited/current promotion','REQUIRES_OWNER_APPROVAL','No approved promotion policy found; preserve local advisory result versus read-only independent verification'],
  ['I','Fresh-process, fresh-database saved-input custody replay','NOT_IMPLEMENTED','Public receipt audit and recipe repeats do not execute saved custody lifecycle inputs'],
  ['J','Exact affected SQL inventory/security/profiling/mutations','PARTIAL','Previous eight-routine certificate excludes custody SQL. Current privileges/native/logical/DDL checks required'],
  ['K','Separate adversarial review and numerical critical-code closure','PARTIAL','No current independent review or full closure-module coverage/mutation/metrics certificate'],
  ['L','Historical reliability findings retained','PARTIAL','Raw historical diagnostics unavailable; handoff documents transport deadline, profiler crash, DB interruption and Docker startup failures'],
  ['M','Ten isolated stop criteria','PARTIAL','Do not declare complete until supported boundaries and missing guarantees have executable evidence'],
  ['N','Production and data boundaries','VERIFIED_IN_ISOLATION','This continuation edits isolated tools/tests only; no production activation, live provider credentials, or financial authority'],
  ['O','Validated source-bound closure decision','PARTIAL','Fresh source/evidence manifest and checkpoint required']
].map(([id,requirement,acceptanceStatus,remaining])=>({id,requirement,acceptanceStatus,remaining}));
const state={schema:'custody-cloud-reconciliation-v1',at:new Date().toISOString(),baseline:await closureBaseline(),matrix,requirements,
  observationStates:{neverOccurred:'No independent proof of occurrence; absence alone is inconclusive',captureFailed:'Detectable only where authoritative committed record survives and independent comparison supports it',capturedNotDelivered:'Local commitment present, remote record absent',lostAcknowledgement:'Remote event/signature present, local receipt absent',independentlyCommitted:'Independent query, signature, identity and commitment agree',gapOrConflict:'Chain, committed-journal comparison or remote binding rejects inconsistency',suppressedOutsideBoundary:'Both source occurrence record and capture omitted before trusted observation; unobservable'},
  inheritedExternalGates:['Legal purpose/notice/provider disclosure','Retention/deletion/legal hold approvals','Independent real-human blind calibration','Production-shaped Clerk capacity/availability','Operations alert ownership and financial/admin policy','Deployed IAM/egress/roles/TLS','Off-host administration/anchors/disaster recovery','Stopped-first rollout and separate activation authorization'],
  productionReady:false,phase9d2:'NOT_STARTED'};
const destination=join(output,'acceptance-before-'+Date.now()+'.json');await writeFile(destination,JSON.stringify(state,null,2),{flag:'wx'});
console.log(JSON.stringify({destination,events:matrix.length,requirements:requirements.length,historicalEvidence:state.baseline.status}));
