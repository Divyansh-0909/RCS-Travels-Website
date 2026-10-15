import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { incidentWithReplacement } from '../helpers/phase9ReviewHttpFixture.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';
import { saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { V5_HASH } from '../helpers/phase9ReplayContract.js';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { sealUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';

const run = 'supersession-' + new Date().toISOString().replace(/\D/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true }); console.log('Admin evidence supersession scenario: ' + run);
const temporary = await mkdtemp(join(tmpdir(), 'rcs-phase9-admin-supersession-'));
let cleanup, browser, vite, sources;
const { harness, incident } = await incidentWithReplacement({ after: fn => { cleanup = fn; } });
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
const { enqueueResponsibilityShadowEvidence } = await import('../../services/responsibilityShadowRepository.js');
const contexts = [], actions = [], events = [];
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9AdminSupersession.mjs',
  'backend/tests/helpers/phase9UiSources.js', 'backend/tests/helpers/phase9ReviewHttpFixture.js', 'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
try {
  sources = await capture();
  const financials = await phase9FinancialSnapshot(harness.db);
  Object.assign(process.env, { VITE_API_BASE_URL: '/fixture-backend', VITE_CLERK_PUBLISHABLE_KEY: browserPublishableKey, PHASE9_BROWSER_API: harness.apiUrl });
  vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
    configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
  await vite.listen(); browser = await chromium.launch();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const { page } = await createBrowserActor({ browser, url, actor: 'admin', contexts, viewport: { width: 390, height: 844 } });
  await page.goto(url + '/dashboard/responsibility?case=' + encodeURIComponent(incident.id));
  await expect(page.getByRole('heading', { name: 'Human review', exact: true })).toBeVisible();
  await page.getByLabel('Human decision', { exact: true }).selectOption('WAIVE');
  await page.getByLabel('Final classification', { exact: true }).selectOption('EXTERNAL_OR_UNCERTAIN');
  await page.getByLabel('Review reason', { exact: true }).fill('Synthetic human view must not authorize a superseded evidence snapshot.');
  const next = structuredClone(incident.evidenceSnapshot);
  next.evidenceVersion = incident.evidenceVersion + '-synthetic-update';
  next.generatedAt = new Date(Date.parse(next.generatedAt) + 1).toISOString();
  const queued = await enqueueResponsibilityShadowEvidence(next, { db: harness.db });
  assert.notEqual(queued.evidenceHash, incident.evidenceHash);
  assert.equal(await harness.db.responsibilityEvidenceVersion.count({ where: { caseId: incident.id } }), 2);
  events.push({ actor: 'actual evidence repository + synthetic updated observation', old: incident.evidenceHash,
    current: queued.evidenceHash, version: next.evidenceVersion });
  const response = page.waitForResponse(row => row.url().endsWith('/review') && row.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save human review', exact: true }).click();
  assert.equal((await response).status(), 409);
  await expect(page.getByRole('alert')).toContainText('Evidence changed');
  assert.equal(await harness.db.responsibilityAdminReview.count(), 0);
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);
  assert.deepEqual(await phase9FinancialSnapshot(harness.db), financials);
  actions.push({ actor: 'actual admin browser', action: 'Stale open evidence version is rejected before any human authority or financial write', status: 'PASS' });
  await page.screenshot({ path: join(output, 'admin-superseded-evidence-rejected.png'), fullPage: true });
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Case record', exact: true }).locator('..')).toContainText(next.evidenceVersion);
  await expect(page.getByRole('heading', { name: 'Evidence version history', exact: true }).locator('..')).toContainText(incident.evidenceHash);
  await expect(page.getByLabel('Human decision', { exact: true })).toHaveValue('');
  actions.push({ actor: 'actual admin browser', action: 'Refresh exposes both immutable versions and clears the old decision', status: 'PASS' });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-admin-supersession-v1', run, status: 'PASS', sources, frozenV5: V5_HASH,
    initial: incident, actions, events, financials, requests: harness.requests,
    boundary: 'Real version repository supersedes a synthetic incident observation. Browser retains old evidence during submission; no frozen Phase 8 evidence is changed.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Admin supersession PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('admin-supersession', {
    initial: incident, sources, actions, events, error: error.message,
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, sources, actions, events, requests: harness.requests }, null, 2));
  throw error;
} finally {
  try { for (const [i, context] of contexts.entries()) await saveSanitizedTrace(context, temporary, output, 'trace-' + i); }
  finally { await browser?.close(); await vite?.close(); await cleanup(); await rm(temporary, { recursive: true, force: true }); }
}
