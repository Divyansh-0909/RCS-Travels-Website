import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fetch } from '../../backend/node_modules/undici/index.js';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { startPostgisTestEnvironment } from '../../backend/tests/helpers/postgisEnvironment.js';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from '../../backend/tests/helpers/phase9Isolation.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const run = 'live-clerk-' + Date.now() + '-' + randomUUID();
const output = join(repository, 'output/phase9c-adversarial-2026-10-11', run);
const privateRoot = join(process.env.LOCALAPPDATA, 'RCS-Phase9');
const privateDir = join(privateRoot, run); assert.ok(resolve(privateDir).startsWith(resolve(privateRoot) + '\\'));
await mkdir(output, { recursive: true }); await mkdir(privateDir, { recursive: true });
const text = await readFile(join(repository, 'backend/.env'), 'utf8');
const value = name => text.match(new RegExp('^\\s*' + name + '\\s*=\\s*[\'"]?([^\\s\'"]+)', 'm'))?.[1];
const secret = value('CLERK_SECRET_KEY'), publishableKey = value('CLERK_PUBLISHABLE_KEY');
assert.ok(secret?.startsWith('sk_test_') && publishableKey?.startsWith('pk_test_'), 'Development keys required');
const frontendHost = Buffer.from(publishableKey.slice(8), 'base64').toString('utf8').replace(/\$$/, '');
assert.match(frontendHost, /^[a-z0-9-]+\.clerk\.accounts\.dev$/);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = { schema: 'phase9c-live-clerk-revocation-v1', run, status: 'RUNNING', startedAt: new Date().toISOString(),
  keyMode: 'TEST', frontendHostHash: hash(frontendHost), providerCalls: [], actions: [],
  boundary: 'One newly created reserved +clerk_test@example.com synthetic Clerk development user, authenticated by a Backend API sign-in ticket without email delivery. Real frontend SDK and protected application GETs against a loopback-only disposable database. No live secrets in the DB child; no production user, webhook, financial provider or model calls.' };
let userId, sessionId, child, environment, vite, browser, page, stage = 'preflight';
const publicConfig = join(privateDir, 'public-config.json');
async function api(path, method = 'GET', body) {
  assert.ok(path.startsWith('/v1/'));
  const response = await fetch('https://api.clerk.com' + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const bytes = await response.text(); let data = {}; try { data = bytes ? JSON.parse(bytes) : {}; } catch {}
  record.providerCalls.push({ method, path: path.replace(/user_[^/]+|sess_[^/]+/g, '[owned-synthetic-id]'),
    status: response.status, errorCodes: data.errors?.map(item => item.code) ?? [] });
  return { status: response.status, data };
}
function message(type) {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { cleanup(); fail(new Error('Isolated child message timeout')); }, 120000);
    const receive = row => { if (row.type === type) { cleanup(); done(row); } else if (row.type === 'failure') { cleanup(); fail(new Error(row.error)); } };
    const closed = () => { cleanup(); fail(new Error('Isolated child exited before ' + type)); };
    const cleanup = () => { clearTimeout(timer); child.off('message', receive); child.off('close', closed); };
    child.on('message', receive); child.on('close', closed);
  });
}
try {
  const instance = await api('/v1/instance'); assert.equal(instance.status, 200);
  assert.equal(instance.data.environment_type, 'development');
  const hooks = await api('/v1/webhooks/svix_url', 'POST', {});
  assert.equal(hooks.status, 400); assert.ok(hooks.data.errors.some(item => item.code === 'svix_app_missing'));
  record.webhookIsolation = 'NO_SVIX_APP_CONFIGURED';
  stage = 'create-owned-user';
  const testEmail = 'phase9-' + randomUUID() + '+clerk_test@example.com';
  const created = await api('/v1/users', 'POST', { external_id: run, email_address: [testEmail], skip_password_requirement: true,
    first_name: 'Phase9 Synthetic', public_metadata: { phase9SyntheticRun: run } });
  if (created.status >= 200 && created.status < 300 && created.data.external_id === run) userId = created.data.id;
  assert.equal(created.status, 200); assert.match(userId, /^user_/);
  assert.equal(created.data.external_id, run);
  assert.deepEqual(created.data.email_addresses.map(item => item.email_address), [testEmail]); assert.deepEqual(created.data.phone_numbers, []);
  const jwksResponse = await fetch('https://' + frontendHost + '/.well-known/jwks.json', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(jwksResponse.status, 200); const jwks = await jwksResponse.json(); assert.equal(jwks.keys.length, 1);
  const jwtKey = createPublicKey({ key: jwks.keys[0], format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  await writeFile(publicConfig, JSON.stringify({ userId, publishableKey, jwtKey }), { flag: 'wx' });
  stage = 'isolated-database'; environment = await startPostgisTestEnvironment();
  const inherited = Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  child = spawn(process.execPath, ['--import','./tests/helpers/phase9Isolation.js','--import','tsx','tests/e2e/phase9LiveClerkReadOnly.mjs'], {
    cwd: join(repository, 'backend'), windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'], env: { ...inherited,
      NODE_ENV: 'test', PHASE9_ISOLATED: '1', TEST_DATABASE_URL: environment.connectionString,
      DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE, DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV,
      PHASE9_EMPTY_ENV_DIR: privateDir, PHASE9_LIVE_PUBLIC_CONFIG: publicConfig,
      CLERK_SECRET_KEY: 'sk_test_phase9_synthetic_only', OPENAI_API_KEY: 'phase9-denied-synthetic-constructor-key',
      FARE_QUOTE_SECRET: 'phase9-synthetic-only', RAZORPAY_KEY_ID: 'rzp_test_verification',
      RAZORPAY_KEY_SECRET: 'verification-payment-secret', RAZORPAY_WEBHOOK_SECRET: 'verification-webhook-secret' },
  });
  let childDiagnostics = '';
  const diagnostic = bytes => { childDiagnostics += bytes.toString('utf8'); };
  child.stdout.on('data', diagnostic); child.stderr.on('data', diagnostic);
  child.once('close', async () => {
    const sanitized = childDiagnostics.replace(/(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/g, '[key-redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]');
    await writeFile(join(output, 'child-diagnostics.log'), sanitized);
  });
  const ready = await message('ready');
  const frontendRequire = createRequire(join(repository, 'frontend/package.json'));
  const react = (await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href)).default;
  const tailwind = (await import(pathToFileURL(frontendRequire.resolve('@tailwindcss/vite')).href)).default;
  process.env.VITE_CLERK_PUBLISHABLE_KEY = publishableKey; process.env.VITE_API_BASE_URL = '/fixture-backend';
  vite = await createServer({ configFile: false, root: join(repository, 'frontend'), envDir: privateDir, plugins: [react(), tailwind()],
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': ready.apiUrl,
      '/fixture-backend': { target: ready.apiUrl, rewrite: path => path.replace(/^\/fixture-backend/, '') } } } });
  await vite.listen(); const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const allowed = ['127.0.0.1','localhost',frontendHost,'cdn.jsdelivr.net'].includes(url.hostname);
    if (allowed || ['data:','blob:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  page = await context.newPage(); stage = 'real-sdk-sign-in';
  record.browserFailures = [];
  page.on('response', response => { if (response.status() >= 400) record.browserFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  await page.goto(origin); await page.waitForFunction(() => window.Clerk?.loaded, undefined, { timeout: 90000 });
  const ticket = await api('/v1/sign_in_tokens', 'POST', { user_id: userId, expires_in_seconds: 300 });
  assert.equal(ticket.status, 200);
  sessionId = await page.evaluate(async ticket => {
    const signIn = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket });
    await window.Clerk.setActive({ session: signIn.createdSessionId }); return signIn.createdSessionId;
  }, ticket.data.token);
  assert.match(sessionId, /^sess_/);
  await page.goto(origin + '/booking/' + ready.bookingId);
  await page.getByText('Synthetic Delhi drop', { exact: true }).first().waitFor({ timeout: 60000 });
  const token = await page.evaluate(() => window.Clerk.session.getToken({ skipCache: true })); assert.ok(token);
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.sub, userId); assert.equal(claims.sid, sessionId);
  record.tokenTimes = { iat: claims.iat, nbf: claims.nbf, exp: claims.exp };
  const statusUrl = ready.apiUrl + '/api/bookings/' + ready.bookingId + '/status';
  assert.equal((await fetch(statusUrl, { headers: { Authorization: 'Bearer ' + token } })).status, 200);
  assert.equal((await fetch(statusUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })).status, 405);
  await page.screenshot({ path: join(output, 'live-auth-owned-ride.png'), fullPage: true });
  record.actions.push({ action: 'Reserved test-email synthetic user signs in through real SDK ticket flow without email delivery and reads its isolated booking through actual ownership handler', status: 'PASS' });
  stage = 'provider-revocation';
  const revoked = await api('/v1/sessions/' + sessionId + '/revoke', 'POST', {});
  assert.equal(revoked.status, 200); assert.equal(revoked.data.status, 'revoked'); record.revokedAt = new Date().toISOString();
  record.cachedTokenStatusAfterRevoke = (await fetch(statusUrl, { headers: { Authorization: 'Bearer ' + token } })).status;
  await page.evaluate(async () => { try { await window.Clerk.session?.getToken({ skipCache: true }); } catch {} });
  await page.reload(); await page.waitForFunction(() => window.Clerk?.loaded && !window.Clerk.user, undefined, { timeout: 90000 });
  assert.equal(await page.getByText('Synthetic Delhi drop', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Retry payment', exact: true }).count(), 0);
  await page.screenshot({ path: join(output, 'live-auth-revoked-navigation.png'), fullPage: true });
  record.actions.push({ action: 'Provider revokes the real browser session; forced refresh and navigation restore signed-out SDK state and remove cached ride/payment controls', status: 'PASS' });
  stage = 'expired-token-authority';
  const expires = claims.exp * 1000 + 10000; assert.ok(expires - Date.now() < 180000, 'Token observation must be bounded');
  while (Date.now() < expires) await new Promise(done => setTimeout(done, Math.min(1000, expires - Date.now())));
  record.expiredTokenStatus = (await fetch(statusUrl, { headers: { Authorization: 'Bearer ' + token } })).status;
  assert.equal(record.expiredTokenStatus, 401);
  record.actions.push({ action: 'Original JWT loses protected API authority after its actual provider expiry; no new revocation cutoff imposed', status: 'PASS' });
  const final = message('final'); child.send({ type: 'assert-final' }); record.isolated = await final;
  record.status = 'PASS';
} catch (error) {
  await page?.screenshot({ path: join(output, 'failed-owned-synthetic-page.png'), fullPage: true }).catch(() => {});
  record.status = 'FAILED'; record.failedStage = stage; record.errorName = error.name;
  record.error = String(error.message).replaceAll(secret, '[key-redacted]').replaceAll(publishableKey, '[key-redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]').slice(0, 500);
  process.exitCode = 1;
} finally {
  await browser?.close(); await vite?.close();
  if (child?.connected) { const closed = new Promise(done => child.once('close', done)); child.send({ type: 'close' }); await closed; }
  await environment?.stop();
  if (userId) {
    const owned = await api('/v1/users/' + userId);
    if (owned.data.external_id === run && owned.data.public_metadata?.phase9SyntheticRun === run) {
      const deleted = await api('/v1/users/' + userId, 'DELETE'); record.syntheticUserDeleted = deleted.status === 200;
    } else record.syntheticUserDeleted = false;
    if (!record.syntheticUserDeleted) { record.status = 'FAILED'; process.exitCode = 1; }
  }
  await unlink(publicConfig).catch(() => {}); await rmdir(privateDir).catch(() => {});
  record.finishedAt = new Date().toISOString(); record.runnerSha256 = hash(await readFile(new URL(import.meta.url)));
  await writeFile(join(output, 'report.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ run, status: record.status, failedStage: record.failedStage, syntheticUserDeleted: record.syntheticUserDeleted }));
}
