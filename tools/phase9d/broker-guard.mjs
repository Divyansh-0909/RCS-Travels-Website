import assert from 'node:assert/strict';
import {responsibilityAnalystEnvelopeSchema} from '../../backend/services/responsibilityContracts.js';
import {responsibilityEvidenceHash,validateAnalysisAgainstEvidence} from '../../backend/services/responsibilityAnalyst.js';
import {evaluateResponsibilityPolicy,responsibilityEvaluationKey,DEFAULT_RESPONSIBILITY_POLICY} from '../../backend/services/responsibilityPolicyGate.js';
import {responsibilityCaseState} from '../../backend/services/responsibilityCaseState.js';
import {brokerCall} from './broker-execution.mjs';
export function independentlyGuardBroker(input) {
  const envelope=responsibilityAnalystEnvelopeSchema.parse(input.response.envelope),evidence=input.evidence;
  const validation=validateAnalysisAgainstEvidence(evidence,envelope);assert.equal(validation.valid,true);
  const evidenceHash=responsibilityEvidenceHash(evidence);
  const gate=evaluateResponsibilityPolicy({evidence,analysisEnvelope:envelope,evidenceHash,currentState:responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey:responsibilityEvaluationKey({caseId:evidence.caseId,evidenceHash,analysisId:envelope.analysisId,policyVersion:DEFAULT_RESPONSIBILITY_POLICY.policyVersion}),
    policy:DEFAULT_RESPONSIBILITY_POLICY,evaluatedAt:new Date(evidence.generatedAt)});
  assert.equal(gate.route,'NEEDS_ADMIN_REVIEW');
  return {mode:'SHADOW',route:gate.route,evidenceHash,analysisId:envelope.analysisId,responseHash:input.responseHash,output:envelope.output,gate};
}
export async function commitGuardedBrokerResult(client,id,token,stage=async()=>{}) {
  const input=await brokerCall(client,'guard_input',[id,token]);
  if(!input)return {status:'FENCED'};
  const result=independentlyGuardBroker(input);
  await stage('guarded',{id,token});
  const committed=await brokerCall(client,'commit_result',[id,token,JSON.stringify(result)]);
  await stage('committed',{id,token});
  return {status:committed?'GUARDED_RESULT_COMMITTED':'FENCED',route:result.route};
}
