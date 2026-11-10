import assert from 'node:assert/strict';
export const denialClasses=['APPLICATION_WRITE','BUDGET_CONFIGURATION','AUDIT_HISTORY','ROLE_ESCALATION','AUTHENTICATION','SIGNING_SECRET','GUARD_WRITE','OPERATIONS_CONTROL','DATABASE_DENIAL'];
export function validateDenialRecord(record){
  assert.deepEqual(Object.keys(record).sort(),['serverIdentity','authenticatedRole','actorTrust','sqlstate','logSessionHash','logLine','denialClass','observed'].sort());
  for(const field of ['serverIdentity','logSessionHash'])assert.match(record[field],/^[a-f0-9]{64}$/);
  assert.match(record.authenticatedRole,/^[a-z][a-z0-9_]{0,62}$/);assert.match(record.logLine,/^[1-9][0-9]{0,14}$/);
  assert.ok(['42501','28P01'].includes(record.sqlstate));assert.equal(record.actorTrust,record.sqlstate==='42501'?'AUTHENTICATED':'CLAIMED_UNAUTHENTICATED');
  assert.ok(denialClasses.includes(record.denialClass));assert.equal(new Date(record.observed).toISOString(),record.observed);return record;
}
