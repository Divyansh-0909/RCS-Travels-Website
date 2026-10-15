import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { incidentWithReplacement, request } from '../helpers/phase9ReviewHttpFixture.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';
import { saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { V5_HASH } from '../helpers/phase9ReplayContract.js';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { createNativeSession } from './phase9NativeSession.mjs';
import { sealUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';

const run = 'appeal-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
const temporary = await mkdtemp(join(tmpdir(), 'rcs-phase9-native-appeal-'));
await mkdir(output, { recursive: true });
console.log('Native original-captain appeal scenario: ' + run);
let cleanup;
const { harness, incident } = await incidentWithReplacement({ after: action => { cleanup = action; } });
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
Object.assign(process.env, { VITE_API_BASE_URL: '/fixture-backend', VITE_CLERK_PUBLISHABLE_KEY: browserPublishableKey,
  PHASE9_BROWSER_API: harness.apiUrl });
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
const contexts = [], actions = [], external = [];
let browser, native, sources, initial;
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9NativeAppeal.mjs',
  'backend/tests/e2e/phase9NativeSession.mjs', 'backend/tests/helpers/phase9NativeGateway.js',
  'backend/tests/helpers/phase9ReviewHttpFixture.js', 'backend/tests/helpers/phase9UiSources.js',
  'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
const tap = value => '- tapOn: "' + value + '"\n';
const wait = value => '- extendedWaitUntil:\n    visible: "' + value + '"\n    timeout: 90000\n';
const openNotices = '- runFlow:\n    when:\n      visible:\n        id: "phosphor-react-native-list-bold"\n    commands:\n      - tapOn:\n          id: "phosphor-react-native-list-bold"\n'
  // Reveal the later settings row so the notice is above the floating app bar.
  + wait('Account') + tap('Account') + '- scrollUntilVisible:\n    element: "Appearance"\n    direction: DOWN\n'
  + wait('Responsibility notices')
  + '- takeScreenshot: native-notices-account-entry\n'
  + tap('Responsibility notices');
const reason = 'Synthetic original captain contests causal authority after replacement.';
try {
  sources = await capture();
  const before = await phase9FinancialSnapshot(harness.db);
  initial = { clock: harness.lifecycle.clock.now(), booking: await harness.lifecycle.booking(), financials: before,
    actors: Object.fromEntries(Object.entries(harness.actors).map(([key, actor]) => [key, { id: actor.id, clerkId: actor.clerkId }])),
    incident };
  await vite.listen(); browser = await chromium.launch();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const { page } = await createBrowserActor({ browser, url, actor: 'admin', contexts, viewport: { width: 390, height: 844 } });
  await page.goto(url + '/dashboard/responsibility?case=' + encodeURIComponent(incident.id));
  await page.getByLabel('Human decision', { exact: true }).selectOption('UPHOLD');
  await page.getByLabel('Final classification', { exact: true }).selectOption('DRIVER_CAUSED');
  await page.getByLabel('Consequence level', { exact: true }).selectOption('LEVEL_1');
  await page.getByLabel('Review reason', { exact: true }).fill('Explicit synthetic human provisional review for native notice testing.');
  await page.getByRole('button', { name: 'Save human review', exact: true }).click();
  await expect(page.getByText('No human review action is available in the recorded state. Notice delivery and appeal prerequisites still apply.', { exact: true })).toBeVisible();
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);
  actions.push({ actor: 'admin browser', action: 'Human provisional uphold prepares notice without final authority or consequences', status: 'PASS' });
  native = await createNativeSession(harness, output, { restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1',
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: true,
      fix: { timestamp: Date.now(), coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } }) });
  await native.reopen();
  await native.maestro('native-notice-before-delivery', openNotices + wait('Notice delivery pending')
    + '- assertNotVisible: "Appeal decision"\n- takeScreenshot: native-notice-before-delivery\n');
  actions.push({ actor: 'physical original captain', action: 'Actual notice screen retains confirmed-delivery prerequisite', status: 'PASS' });
  const { sendAdverseDecisionNotice, syncAppealWindow, ADVERSE_NOTICE_PURPOSE } = await import('../../services/responsibilityNoticeService.js');
  const { createPrismaResponsibilityLifecycleRepository } = await import('../../services/responsibilityLifecycleRepository.js');
  const repository = createPrismaResponsibilityLifecycleRepository(harness.db);
  let providerMessageId;
  await sendAdverseDecisionNotice(incident.id, { repository,
    push: async (driver, _message, _options, provenance) => {
      assert.equal(driver.id, harness.actors.captain.id);
      providerMessageId = 'synthetic-native-notice-' + randomUUID();
      await harness.db.notificationDelivery.create({ data: { provider: 'push', channel: 'push',
        recipient: driver.id, providerMessageId, status: 'sent', bookingId: incident.bookingId,
        purpose: provenance.purpose, retryKey: provenance.retryKey, attemptedAt: new Date() } });
    }, whatsapp: async () => {},
  });
  const deliveredAt = new Date();
  await harness.db.notificationDelivery.update({ where: { providerMessageId }, data: { status: 'delivered', deliveredAt } });
  await syncAppealWindow(incident.id, { repository });
  external.push({ actor: 'explicit fake notification provider', event: ADVERSE_NOTICE_PURPOSE, providerMessageId, deliveredAt });
  await native.maestro('native-original-appeal-submit', tap('Refresh notices') + wait('Appeal decision') + tap('Appeal decision')
    + tap('Explain why you are appealing') + '- inputText: "' + reason + '"\n- hideKeyboard\n'
    + '- tapOn:\n    text: "Submit appeal"\n    repeat: 2\n    delay: 50\n' + wait('Appeal submitted')
    + '- takeScreenshot: native-original-appeal-submitted\n');
  const appeal = await harness.db.responsibilityAppeal.findUniqueOrThrow({ where: { caseId: incident.id } });
  assert.equal(appeal.driverId, harness.actors.captain.id); assert.equal(appeal.reason, reason);
  assert.equal(await harness.db.responsibilityAppeal.count(), 1);
  assert.equal(native.gateway.requests.filter(row => row.method === 'POST' && row.path.endsWith('/appeal')).length, 1);
  assert.deepEqual((await phase9FinancialSnapshot(harness.db)).wallets, before.wallets);
  actions.push({ actor: 'physical original captain', action: 'Delivered notice enables native appeal; double tap creates one original-owner appeal with unchanged money', status: 'PASS' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Appeal review', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Appeal and review history', exact: true }).locator('..')).toContainText(reason);
  await page.getByLabel('Human decision', { exact: true }).selectOption('WAIVE');
  await page.getByLabel('Final classification', { exact: true }).selectOption('EXTERNAL_OR_UNCERTAIN');
  await page.getByLabel('Review reason', { exact: true }).fill('Explicit synthetic human appeal review: waive; no driver consequence.');
  await page.getByRole('button', { name: 'Resolve appeal', exact: true }).click();
  await expect(page.getByText('Human authority is finalized. Review history is retained below.', { exact: true })).toBeVisible();
  const final = await harness.db.responsibilityFinalDecision.findUniqueOrThrow({ where: { caseId: incident.id } });
  assert.equal(final.outcome, 'FINAL_WAIVED'); assert.equal(final.consequenceLevel, 'LEVEL_0');
  actions.push({ actor: 'admin browser', action: 'Actual admin observes native appeal and explicitly resolves one LEVEL_0 waiver with retained audit history', status: 'PASS' });
  await page.screenshot({ path: join(output, 'admin-native-appeal-reviewed.png'), fullPage: true });
  await native.reopen('replacement');
  await native.maestro('native-replacement-no-original-notice', openNotices + wait('No responsibility notices')
    + '- assertNotVisible: "Appeal decision"\n- takeScreenshot: native-replacement-no-original-notice\n');
  const denied = await request(harness, '/api/driver/responsibility-cases/' + incident.id + '/appeal', 'replacement', { reason: 'Foreign synthetic actor cannot own this appeal.' });
  assert.equal(denied.status, 403);
  for (const actor of ['customer', 'captain', 'replacement']) {
    const response = await request(harness, '/api/admin/responsibility/cases/' + incident.id + '/review', actor,
      { decision: 'WAIVE', reason: 'Untrusted role impersonation', reviewerId: harness.actors.admin.id, role: 'admin' });
    assert.equal(response.status, 403); external.push({ actor, action: 'cannot impersonate human reviewer', status: response.status });
  }
  for (const actor of [null, 'customer']) {
    const response = await request(harness, '/api/driver/me/responsibility-notices', actor);
    assert.equal(response.status, actor ? 403 : 401); external.push({ actor, action: 'protected driver notice boundary', status: response.status });
  }
  const expired = await request(harness, '/api/driver/me/responsibility-notices', 'captain', undefined,
    { exp: Math.floor(Date.now() / 1000) - 120 });
  assert.equal(expired.status, 401);
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 1);
  const financials = await phase9FinancialSnapshot(harness.db);
  assert.deepEqual(financials.wallets, before.wallets);
  for (const field of ['liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[field], 0);
  actions.push({ actor: 'physical replacement captain + labelled protected HTTP role probes', action: 'Replacement has no original notice/appeal; other roles, anonymous and expired sessions cannot impersonate driver/admin authority', status: 'PASS' });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-native-appeal-v1', run, status: 'PASS', frozenV5: V5_HASH, sources, actions,
    initial, financials, incident, appeal, final, external, requests: harness.requests,
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    boundary: 'Original cancellation/replacement and shadow are actual-service setup. Notice delivery is an explicit synthetic provider observation. Appeal creation and original/replacement visibility use Android controls; review uses actual authenticated admin UI. Human calibration and live notification delivery are not measured.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Native original-captain appeal PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('captain-appeal', {
    initial, sources, actions, events: external, error: error.message, runtime: native && { build: native.build, stagedSources: native.stagedSources },
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, sources, actions, external,
    financials: await phase9FinancialSnapshot(harness.db), requests: harness.requests, native: native?.gateway.requests }, null, 2));
  throw error;
} finally {
  try { for (let i = 0; i < contexts.length; i++) await saveSanitizedTrace(contexts[i], temporary, output, 'trace-' + i); }
  finally { await native?.close(); await browser?.close(); await vite.close(); await cleanup(); await rm(temporary, { recursive: true, force: true }); }
}
