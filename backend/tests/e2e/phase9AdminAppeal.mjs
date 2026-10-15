import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { incidentWithReplacement, request } from '../helpers/phase9ReviewHttpFixture.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { browserApplicationSources, sourceIdentities, saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';

const run = 'admin-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true });
let cleanup;
const { harness, incident } = await incidentWithReplacement({ after: action => { cleanup = action; } });
Object.assign(process.env, { VITE_API_BASE_URL: '/fixture-backend', VITE_CLERK_PUBLISHABLE_KEY: browserPublishableKey,
  PHASE9_BROWSER_API: harness.apiUrl });
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
const contexts = [], actions = [];
let browser;
const capture = async () => ({ ...await replaySourceHashes(), ...await browserApplicationSources(),
  ...await sourceIdentities(['backend/tests/e2e/phase9AdminAppeal.mjs', 'backend/tests/helpers/phase9ReviewHttpFixture.js',
    'backend/tests/run-phase9-cross-db.js']) });
try {
  const sources = await capture();
  const wallets = await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } });
  await vite.listen();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch();
  const { page } = await createBrowserActor({ browser, url, actor: 'admin', contexts });
  const caseUrl = url + '/dashboard/responsibility?case=' + encodeURIComponent(incident.id);
  await page.goto(caseUrl);
  await page.getByLabel('Human decision', { exact: true }).selectOption('UPHOLD');
  await page.getByLabel('Final classification', { exact: true }).selectOption('DRIVER_CAUSED');
  await page.getByLabel('Consequence level', { exact: true }).selectOption('LEVEL_1');
  await page.getByLabel('Review reason', { exact: true }).fill('Explicit synthetic human provisional review for testing notice and appeal.');
  await page.getByRole('button', { name: 'Save human review', exact: true }).click();
  await expect(page.getByText('No human review action is available in the recorded state. Notice delivery and appeal prerequisites still apply.', { exact: true })).toBeVisible();
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);
  const window = await harness.db.responsibilityAppealWindow.findUniqueOrThrow({ where: { caseId: incident.id } });
  assert.equal(window.appealStartedAt, null);
  actions.push({ actor: 'admin browser', action: 'explicit provisional uphold; no final authority or consequence before confirmed notice', status: 'PASS' });
  await page.screenshot({ path: join(output, 'admin-provisional-notice-pending.png'), fullPage: true });
  const { syncAppealWindow, ADVERSE_NOTICE_PURPOSE } = await import('../../services/responsibilityNoticeService.js');
  const { createPrismaResponsibilityLifecycleRepository } = await import('../../services/responsibilityLifecycleRepository.js');
  const deliveredAt = new Date();
  await harness.db.notificationDelivery.create({ data: { provider: 'push', channel: 'push',
    recipient: harness.actors.captain.id, providerMessageId: 'synthetic-admin-ui-' + incident.id,
    status: 'delivered', bookingId: incident.bookingId, purpose: ADVERSE_NOTICE_PURPOSE,
    retryKey: window.noticeRetryKey, attemptedAt: deliveredAt, deliveredAt } });
  await syncAppealWindow(incident.id, { repository: createPrismaResponsibilityLifecycleRepository(harness.db) });
  const appeal = await request(harness, '/api/driver/responsibility-cases/' + incident.id + '/appeal', 'captain',
    { reason: 'Synthetic original captain contests the provisional authority.', additionalEvidenceRefs: [] });
  assert.equal(appeal.status, 201);
  actions.push({ actor: 'synthetic provider delivery + protected original-captain HTTP', action: 'confirmed notice starts window; original incident owner submits one appeal after replacement', status: 'PASS' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Appeal review', exact: true })).toBeVisible();
  await expect(page.getByLabel('Human decision', { exact: true })).toHaveValue('');
  await page.getByLabel('Human decision', { exact: true }).selectOption('WAIVE');
  await page.getByLabel('Final classification', { exact: true }).selectOption('EXTERNAL_OR_UNCERTAIN');
  await page.getByLabel('Review reason', { exact: true }).fill('Independent synthetic human appeal review: insufficient causal authority.');
  const path = '**/api/admin/responsibility/cases/' + encodeURIComponent(incident.id) + '/appeal-review';
  let intercepted = 0;
  await page.route(path, route => { intercepted++; return route.continue({ postData: JSON.stringify({
    ...route.request().postDataJSON(), evidenceHash: '0'.repeat(64) }) }); });
  await page.getByRole('button', { name: 'Resolve appeal', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Evidence changed');
  assert.equal(intercepted, 1);
  assert.equal(await harness.db.responsibilityAppealReview.count(), 0);
  await page.unroute(path);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, 'admin-appeal-review-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Resolve appeal', exact: true }).click({ clickCount: 2 });
  await expect(page.getByText('Human authority is finalized. Review history is retained below.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Human authority is finalized. Review history is retained below.', { exact: true })).toBeVisible();
  await page.screenshot({ path: join(output, 'admin-appeal-final-waiver-phone.png'), fullPage: true });
  assert.equal(await harness.db.responsibilityAppealReview.count(), 1);
  const final = await harness.db.responsibilityFinalDecision.findFirstOrThrow();
  assert.equal(final.outcome, 'FINAL_WAIVED'); assert.equal(final.consequenceLevel, 'LEVEL_0');
  assert.deepEqual(await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } }), wallets);
  for (const model of ['responsibilityLiability', 'responsibilityConsequenceExecution', 'reliabilityStrike', 'reliabilityBlock']) assert.equal(await harness.db[model].count(), 0);
  actions.push({ actor: 'admin browser', action: 'stale appeal review rejected; explicit waiver resolves once and persists across refresh with no financial or driver consequence', status: 'PASS' });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'rcs-phase9-admin-ui-v1', run, status: 'PASS', sources, frozenV5: V5_HASH,
    actions, requests: harness.requests, final, wallets, fixtureBoundary: 'Booking, notice delivery and driver appeal are explicit protected-service setup; admin decisions use actual browser UI' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Admin review and appeal UI PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, actions, requests: harness.requests }, null, 2));
  for (const context of contexts) for (const page of context.pages()) await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  for (const [index, context] of contexts.entries()) await saveSanitizedTrace(context, process.env.PHASE9_EMPTY_ENV_DIR, output, 'trace-' + index);
  await browser?.close(); await vite.close(); await cleanup();
}
