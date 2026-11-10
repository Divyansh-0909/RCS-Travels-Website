import assert from 'node:assert/strict';

// Reachability observations do not alter audit, decision, fix or verification
// statuses. The linked device evidence remains distinct from historical audits.
export function applyAndroidObservations(rows,observation){
  if(!observation)return rows;
  assert.equal(observation.phase,'P05');
  assert.equal(observation.status,'PASS');
  assert.equal(observation.scope,'NATIVE_NAVIGATION_REACHABILITY_ONLY');
  assert.match(observation.evidence?.url||'',/^https:\/\/drive\.google\.com\//);
  assert.match(observation.evidence?.sha256||'',/^[a-f0-9]{64}$/);
  const byId=new Map(rows.map(row=>[row.id,row]));
  for(const row of rows.filter(row=>row.platform==='android')){
    if(row.reachability==='DEVICE_OFFLINE'){
      row.reachability='FIXTURE_REQUIRED';
      row.blocker='Connected P05 follow-up: this particular state was not positioned. Requires its own bounded synthetic fixture and audit; initial offline evidence remains historical.';
    }
    if(row.blocker==='External handoff NOT_RUN while phone is disconnected')row.blocker='External handoff not exercised during the connected P05 follow-up';
  }
  for(const entry of observation.entries){
    const row=byId.get(entry.id);assert(row?.platform==='android','Unknown observed native entry: '+entry.id);
    assert(Array.isArray(entry.navigation)&&entry.navigation.length,'Actual native navigation steps required');
    row.reachability='DEVICE_OBSERVED';
    row.navigation_steps=entry.navigation;
    row.evidence_urls=[...new Set([...row.evidence_urls,observation.evidence.url])];
    row.verification_levels=[...new Set([...row.verification_levels,'FIXTURE_RENDER'])];
    row.blocker='Connected P05 follow-up: read-only native reachability/render observed on '+observation.at+'. Broader loading/error/interaction/theme/backend/child audits remain outside this observation.';
  }
  return rows;
}
