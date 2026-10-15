import test from 'node:test';
import assert from 'node:assert/strict';
import { executeIsolatedShadowWorker } from '../../tools/phase9d/worker-core.mjs';
import { minimizeEvidence } from '../../tools/phase9d/privacy.mjs';
import { createResponsibilityEvidence } from '../services/responsibilityEvidence.js';
import pg from 'pg';
import v8 from 'node:v8';
import { syncBuiltinESMExports } from 'node:module';
import { createJevV5ResponsibilityAnalyst } from '../services/responsibilityJevV5.js';
import { evidenceCriteriaV5Questions } from '../benchmarks/responsibility/evidenceCriteriaV5.js';

const connectionString = 'postgresql://shadow9d_worker:synthetic@localhost:1/rcs_verify_' + 'a'.repeat(32);
const message = { connectionString, mode: 'resume' };
function work() {
  const journal = createResponsibilityEvidence({ caseId: 'worker', bookingId: 'booking',
    caseType: 'DRIVER_CANCELLATION', occurredAt: '2026-10-12T16:00:00.000Z',
    clock: { now: () => new Date('2026-10-12T16:00:00.000Z') } });
  const value = minimizeEvidence(journal.snapshot(), 'synthetic-privacy-key-at-least-32-bytes');
  return { id: 1, snapshot: value.snapshot, evidence_hash: value.evidenceHash, attempts: 1,
    lease_token: '00000000-0000-4000-8000-000000000001' };
}
function database(row = work(), failure = '') {
  const events = [], results = [];
  return { events, results,
    async connect() { events.push('connect'); if (failure === 'connect') throw new Error('synthetic connection failure'); },
    async query(sql, values) {
      events.push(sql);
      if (failure && sql.includes(failure)) throw new Error('synthetic query failure');
      if (sql.includes('session_user AS actor')) return { rows: [{ actor: 'shadow9d_worker', effective: 'shadow9d_worker',
        database: 'rcs_verify_' + 'a'.repeat(32), rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false }] };
      if (sql.includes('.claim(')) return { rows: [{ value: row }] };
      if (sql.includes('.complete(')) { results.push(JSON.parse(values[2])); return { rows: [{ value: true }] }; }
      return { rows: [{ value: failure !== 'deny-permit' }] };
    },
    async end() { events.push('end'); },
  };
}
const options = db => ({ environment: {}, clientFactory: value => {
  assert.deepEqual(value, { connectionString, connectionTimeoutMillis: 2000, statement_timeout: 2000 }); return db;
} });
test('Phase 9D worker refuses inherited privileged credentials before creating a client', async () => {
  for (const key of ['CLERK_SECRET_KEY', 'OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'RAZORPAY_KEY_SECRET']) {
    let clients = 0;
    await assert.rejects(executeIsolatedShadowWorker(message, { environment: { [key]: 'synthetic-only' },
      clientFactory() { clients++; } }), /PRIVILEGED_ENVIRONMENT_DENIED/);
    assert.equal(clients, 0);
  }
});
test('Phase 9D worker rejects malformed mode, protocol, actor, host and database before connecting', async () => {
  const invalid = [ { ...message, mode: 'finalize' }, { ...message, mode: undefined },
    ...['not-a-url', connectionString.replace('postgresql:', 'https:'),
      connectionString.replace('shadow9d_worker', 'shadow9d_owner'), connectionString.replace('localhost', 'foreign.test'),
      connectionString.replace('/rcs_verify_', '/production_'), connectionString.replace('/rcs_verify_', '/foreign/rcs_verify_'),
      connectionString + '_suffix', connectionString + '?user=shadow9d_ops',
      connectionString + '?host=foreign.test', connectionString + '?dbname=production', connectionString + '#fragment']
      .map(connectionString => ({ ...message, connectionString })) ];
  for (const input of invalid) {
    let clients = 0;
    await assert.rejects(executeIsolatedShadowWorker(input, { environment: {}, clientFactory() { clients++; } }));
    assert.equal(clients, 0);
  }
  await assert.rejects(executeIsolatedShadowWorker(null));
  await assert.rejects(executeIsolatedShadowWorker({ ...message, mode: 'unknown' }));
  await assert.rejects(executeIsolatedShadowWorker({ ...message, connectionString: connectionString + '?user=shadow9d_ops' }, { environment: {} }), /CONNECTION_OVERRIDES_DENIED/);
  await assert.rejects(executeIsolatedShadowWorker({ ...message, connectionString: connectionString + '#fragment' }, { environment: {} }), /CONNECTION_FRAGMENT_DENIED/);
});
test('Phase 9D empty worker closes its connection without analysis', async () => {
  const db = database(null);
  assert.deepEqual(await executeIsolatedShadowWorker(message, options(db)), { status: 'EMPTY', calls: 0, privilegedSecretsPresent: false });
  assert.equal(db.events.at(-1), 'end'); assert.equal(db.results.length, 0);
});
test('Phase 9D offline worker uses frozen V5 and persists only guarded advisory eligibility', async () => {
  const db = database();
  assert.deepEqual(await executeIsolatedShadowWorker(message, options(db)), { status: 'COMPLETED', calls: 1, privilegedSecretsPresent: false });
  assert.equal(db.results.length, 1); assert.equal(db.results[0].mode, 'SHADOW');
  assert.equal(db.results[0].route, 'NEEDS_ADMIN_REVIEW'); assert.equal(db.results[0].confidence, 0.99);
  assert.equal(db.results[0].suggestedClassification, 'DRIVER_CAUSED'); assert.equal(db.events.at(-1), 'end');
  const answers = Object.fromEntries(Object.keys(evidenceCriteriaV5Questions()).map(key => [key, { choice: 'NO', confidence: 0.99 }]));
  answers.responsibility.choice = 'DRIVER_CAUSED'; answers.evidenceSufficient.choice = 'YES'; answers.ordinaryDriverFailure.choice = 'YES';
  const expected = createJevV5ResponsibilityAnalyst({ client: { async systemOne() {
    return { model: 'jev-1.13.0', answers, usage: { input_tokens: 0, output_tokens: 0 } };
  } } });
  assert.deepEqual(db.results[0].analysisEnvelope, await expected.analyzeResponsibilityCase(work().snapshot));
});
test('Phase 9D claim-crash diagnostics preserve connection for actual process termination', async () => {
  for (const [row, claimed] of [[work(), true], [null, false]]) {
    const db = database(row);
    assert.deepEqual(await executeIsolatedShadowWorker({ ...message, mode: 'claim_then_crash' }, options(db)), { claimed });
    assert.equal(db.events.includes('end'), false); assert.equal(db.results.length, 0);
  }
});
test('Phase 9D normal connection, claim and commit failures always close the client', async () => {
  for (const failure of ['connect', '.claim(', '.complete(']) {
    const db = database(work(), failure);
    await assert.rejects(executeIsolatedShadowWorker(message, options(db)), /synthetic/);
    assert.equal(db.events.at(-1), 'end'); assert.equal(db.results.length, 0);
  }
});
test('Phase 9D permit outage cannot invoke the analyst or create a result', async () => {
  const db = database(work(), '.permit(');
  const result = await executeIsolatedShadowWorker(message, options(db));
  assert.notEqual(result.status, 'COMPLETED'); assert.equal(result.calls, 0);
  assert.equal(db.results.length, 0); assert.equal(db.events.at(-1), 'end');
});
test('Phase 9D mismatched actual identity or elevated login never reaches a work claim', async () => {
  for (const [field, value] of [['actor', 'shadow9d_ops'], ['effective', 'shadow9d_owner'], ['database', 'foreign_database'],
    ['rolsuper', true], ['rolbypassrls', true], ['rolcreatedb', true], ['rolcreaterole', true]]) {
    const db = database(), query = db.query;
    db.query = async (...args) => { const result = await query(...args); if (args[0].includes('session_user AS actor')) result.rows[0][field] = value; return result; };
    await assert.rejects(executeIsolatedShadowWorker(message, options(db)), /DATABASE_IDENTITY_DENIED/);
    assert.equal(db.events.some(sql => sql.includes('.claim(')), false); assert.equal(db.events.at(-1), 'end');
  }
});
test('Phase 9D native IPC entry handles resume, crash diagnostics and bounded failures', async t => {
  const db = database();
  let flushes = 0; t.mock.method(v8, 'takeCoverage', () => { flushes++; }); syncBuiltinESMExports();
  t.mock.method(pg.Client.prototype, 'connect', () => db.connect());
  t.mock.method(pg.Client.prototype, 'query', (...args) => db.query(...args));
  t.mock.method(pg.Client.prototype, 'end', () => db.end());
  const originalOnce = process.once, descriptors = ['send', 'disconnect'].map(key => [key, Object.getOwnPropertyDescriptor(process, key)]);
  const originalExit = process.exitCode;
  const secrets = ['CLERK_SECRET_KEY', 'OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'RAZORPAY_KEY_SECRET'].map(key => [key, process.env[key]]);
  let handler, disconnected = 0; const sent = [];
  for (const [key] of secrets) delete process.env[key];
  Object.defineProperty(process, 'send', { value: value => sent.push(value), writable: true, configurable: true });
  Object.defineProperty(process, 'disconnect', { value: () => { disconnected++; }, writable: true, configurable: true });
  t.mock.method(process, 'once', function(event, listener) { if (event === 'message') { handler = listener; return process; } return originalOnce.call(this, event, listener); });
  try {
    await import('../../tools/phase9d/worker.mjs'); assert.equal(typeof handler, 'function');
    await handler(message); assert.equal(sent.at(-1).status, 'COMPLETED'); assert.equal(disconnected, 1);
    await handler({ ...message, mode: 'claim_then_crash' }); assert.deepEqual(sent.at(-1), { claimed: true }); assert.equal(disconnected, 1);
    assert.equal(flushes, 1);
    await handler({ ...message, mode: 'forbidden' }); assert.deepEqual(sent.at(-1), { status: 'FAILED_CLOSED' });
    assert.equal(process.exitCode, 1); assert.equal(disconnected, 2);
    await handler({ ...message, connectionString: connectionString.replace('postgresql:', 'postgres:') });
    assert.equal(sent.at(-1).status, 'COMPLETED');
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    process.exitCode = originalExit;
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(process, key, descriptor); else delete process[key]; }
    for (const [key, value] of secrets) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
