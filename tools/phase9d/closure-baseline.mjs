// Fresh execution provenance does not recreate unavailable historical evidence.
import {readFile} from 'node:fs/promises';
import {hash,verifyBaseline} from './baseline.mjs';
export async function closureBaseline(){
  const paths=[
    'output/session-revocation-2026-10-12/manifest.json',
    'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json',
    'output/phase9c-adversarial-2026-10-11/execution-manifest.json',
    'output/phase9d-audit-custody-2026-10-14/manifest.json',
    'output/phase9d-audit-custody-2026-10-14/audit-coverage-matrix-current.json',
    'output/phase9d-audit-custody-2026-10-14/readiness-gates.json'];
  const inputs=[];
  for(const file of paths){
    try{inputs.push({file,status:'AVAILABLE',sha256:hash(await readFile(file))});}
    catch(error){if(error.code!=='ENOENT')throw error;inputs.push({file,status:'UNAVAILABLE'});}
  }
  const missing=inputs.some(input=>input.status==='UNAVAILABLE');
  return {schema:'custody-baseline-availability-v1',status:missing?'HISTORICAL_EVIDENCE_UNAVAILABLE':'AVAILABLE',inputs,
    historicalVerification:inputs.slice(0,3).every(input=>input.status==='AVAILABLE')?await verifyBaseline():null,
    limitation:missing?'Fresh source-bound execution only; historical acceptance identities and full prior readiness cannot be reverified.':null,
    productionShadow:'OFF',productionDeploymentAuthorized:false,productionConsequences:'OFF'};
}
