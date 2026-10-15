import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createJevV5ResponsibilityAnalyst } from '../../backend/services/responsibilityJevV5.js';
import { evidenceCriteriaV5Questions } from '../../backend/benchmarks/responsibility/evidenceCriteriaV5.js';
import { createResponsibilityShadowAdjudicator } from '../../backend/services/responsibilityShadowAdjudication.js';
import { createIsolatedShadowRepository, guardedOfflineAnalyst } from './repository.mjs';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Client } = require('pg');
const privileged = ['CLERK_SECRET_KEY', 'OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'RAZORPAY_KEY_SECRET'];

export async function executeIsolatedShadowWorker({ connectionString, mode }, {
  clientFactory = options => new Client(options), environment = process.env,
} = {}) {
  assert.ok(['resume', 'claim_then_crash'].includes(mode));
  assert.equal(privileged.some(key => Boolean(environment[key])), false, 'PRIVILEGED_ENVIRONMENT_DENIED');
  const url = new URL(connectionString);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.username, 'shadow9d_worker');
  assert.equal(url.hostname, 'localhost');
  assert.match(url.pathname, /^\/rcs_verify_[a-f0-9]{32}$/);
  assert.equal(url.search, '', 'CONNECTION_OVERRIDES_DENIED');
  assert.equal(url.hash, '', 'CONNECTION_FRAGMENT_DENIED');
  const db = clientFactory({ connectionString, connectionTimeoutMillis: 2000, statement_timeout: 2000 });
  try {
    await db.connect();
    const identity = (await db.query(`SELECT session_user AS actor, current_user AS effective,
      current_database() AS database, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
      FROM pg_catalog.pg_roles r WHERE r.rolname = session_user`)).rows[0];
    assert.deepEqual(identity, { actor: 'shadow9d_worker', effective: 'shadow9d_worker', database: url.pathname.slice(1),
      rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false }, 'DATABASE_IDENTITY_DENIED');
    const repository = createIsolatedShadowRepository(db), work = await repository.claimNext();
    if (mode === 'claim_then_crash') return { claimed: Boolean(work) };
    if (!work) return { status: 'EMPTY', calls: 0, privilegedSecretsPresent: false };
    let calls = 0;
    const analyst = createJevV5ResponsibilityAnalyst({ client: { async systemOne(request, options) {
      assert.deepEqual(request.questions, evidenceCriteriaV5Questions());
      assert.equal(options.retry.maxRetries, 0);
      calls++;
      const answers = Object.fromEntries(Object.keys(request.questions).map(key => [key, {
        choice: key === 'responsibility' ? 'DRIVER_CAUSED' : ['evidenceSufficient', 'ordinaryDriverFailure'].includes(key) ? 'YES' : 'NO', confidence: 0.99,
      }]));
      return { model: 'jev-1.13.0', answers, usage: { input_tokens: 0, output_tokens: 0 } };
    } } });
    const adjudicator = createResponsibilityShadowAdjudicator({ repository,
      analyst: guardedOfflineAnalyst(repository, analyst, { current: work }), mode: 'shadow',
      clock: { now: () => new Date(work.evidenceVersion.snapshot.generatedAt) } });
    const outcome = await adjudicator.processWork(work);
    return { status: outcome.status, calls, privilegedSecretsPresent: false };
  } finally {
    // This diagnostic mode retains its committed lease for actual parent termination.
    if (mode !== 'claim_then_crash') await db.end();
  }
}
