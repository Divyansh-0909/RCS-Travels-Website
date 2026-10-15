import { createResponsibilityEvidence } from '../../backend/services/responsibilityEvidence.js';
import { createResponsibilityAnalystFake } from '../../backend/tests/helpers/responsibilityAnalystFake.js';
import { evaluateResponsibilityPolicy, responsibilityEvaluationKey, RESPONSIBILITY_POLICY_VERSION } from '../../backend/services/responsibilityPolicyGate.js';
import { responsibilityEvidenceHash, validateAnalysisAgainstEvidence } from '../../backend/services/responsibilityAnalyst.js';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const cases=[];
for(const phase of ['Phase5','Phase7']){
  const now=new Date(phase==='Phase5'?'2026-09-25T06:00:00.000Z':'2026-09-29T10:00:00.000Z');
  const journal=createResponsibilityEvidence({caseId:'synthetic-'+phase,bookingId:'synthetic-booking-'+phase,caseType:'DRIVER_CANCELLATION',occurredAt:now,scheduledAt:new Date(now.getTime()+3600000),clock:{now:()=>now}});
  for(const category of ['booking','assignment','cancellation'])journal.record({category,kind:phase==='Phase5'?{booking:'scheduled_booking',assignment:'accepted',cancellation:'driver_cancelled'}[category]:category,source:'synthetic-historical-trace',value:{recorded:true},quality:phase==='Phase5'&&category==='booking'?{}:{fresh:true}});
  const evidence=journal.snapshot(),analyst=createResponsibilityAnalystFake('driver_caused'),envelope=await analyst.analyzeResponsibilityCase(evidence),evidenceHash=responsibilityEvidenceHash(evidence);
  const gate=evaluateResponsibilityPolicy({evidence,analysisEnvelope:envelope,evidenceHash,currentState:'POLICY_EVALUATION',idempotencyKey:responsibilityEvaluationKey({caseId:evidence.caseId,evidenceHash,analysisId:envelope.analysisId,policyVersion:RESPONSIBILITY_POLICY_VERSION}),evaluatedAt:now});
  cases.push({phase,validation:validateAnalysisAgainstEvidence(evidence,envelope),route:gate.route,failedGates:gate.failedGates,passedGates:gate.passedGates});
}
const files=['backend/tests/integration/phase5DeferredPostgisValidation.test.js','backend/tests/integration/phase7ShadowAdjudicationPostgres.test.js','backend/services/responsibilityEvidenceSafety.js','backend/services/responsibilityPolicyGate.js','docs/benchmarks/responsibility-guard-closure-checkpoint-2026-10-08.md','docs/audits/recovered-history/scheduled-ride-spec-v1-and-vm-2026-09-23.md','output/session-revocation-2026-10-12/all-db.log'];
const sources=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const result={schema:'phase9d-historical-expectation-trace-v1',sources,cases,
  finding:'Historical generic recorded:true fixtures do not establish independent driver causality under the accepted October 8 guard. The Phase 7 live-cancellation generic observations also do not establish independent blame. NEEDS_ADMIN_REVIEW is consistent with that approved evolution.',
  failureCounting:'Fresh targeted historical run reports 11 tests, 7 passed, 4 failed; one failed parent is included alongside its failed subtest. This is 3 leaf route assertion failures plus the failed Phase 7 parent, not four distinct policies.',
  policyModified:false,expectedResultsModified:false,clerkInvolved:false,
  unresolved:'Historical tests stop at the obsolete assertion, so downstream assertions in those failed cases remain unexecuted. Fixture/expectation maintenance requires separate authoritative review; no policy weakening.'};
await writeFile('output/phase9d-1-2026-10-12/historical-analysis-'+Date.now()+'.json',JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(cases.map(c=>({phase:c.phase,route:c.route,failedGates:c.failedGates}))));
