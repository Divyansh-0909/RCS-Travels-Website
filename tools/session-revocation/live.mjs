import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, unlink, rmdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fetch } from '../../backend/node_modules/undici/index.js';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { startPostgisTestEnvironment } from '../../backend/tests/helpers/postgisEnvironment.js';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from '../../backend/tests/helpers/phase9Isolation.js';
import { criticalFiles } from './scope.mjs';

const repository = resolve(import.meta.dirname, '../..');
const run = 'live-' + Date.now() + '-' + randomUUID();
const output = join(repository, 'output/session-revocation-2026-10-12', run);
const privateRoot = join(process.env.LOCALAPPDATA, 'RCS-Session-Verification');
const privateDir = join(privateRoot, run);
assert.ok(resolve(privateDir).startsWith(resolve(privateRoot) + '\\'));
await mkdir(output, { recursive: true }); await mkdir(privateDir, { recursive: true });
const text = await readFile(join(repository, 'backend/.env'), 'utf8');
const value = name => text.match(new RegExp('^\\s*' + name + '\\s*=\\s*[\'"]?([^\\s\'"]+)', 'm'))?.[1];
const secret = value('CLERK_SECRET_KEY'), publishableKey = value('CLERK_PUBLISHABLE_KEY');
assert.ok(secret?.startsWith('sk_test_') && publishableKey?.startsWith('pk_test_'), 'Development keys required');
const frontendHost = Buffer.from(publishableKey.slice(8), 'base64').toString('utf8').replace(/\$$/, '');
assert.match(frontendHost, /^[a-z0-9-]+\.clerk\.accounts\.dev$/);
// Installed SDK test runtime uses this transport; no credential enters the child.
process.env.NODE_ENV = 'test'; globalThis.fetch = fetch;
const { createClerkClient } = await import('../../backend/node_modules/@clerk/express/dist/index.mjs');
const client = createClerkClient({ secretKey: secret, publishableKey });
const hash = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = [...criticalFiles, 'backend/tests/e2e/liveSessionRevocation.mjs', 'tools/session-revocation/live.mjs'];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(join(repository, path)))])));
const record = { run, status: 'RUNNING', startedAt: new Date().toISOString(), sources, providerCalls: [], checks: [], lookups: [], deleted: {},
  browserProviderRequests: [],
  boundary: 'Owned synthetic users only, verified development instance, real SDK tokens and supported SDK getSession through parent IPC. Disposable loopback PostGIS child has only public verification material. GET-only application witness, no production settings/webhooks/providers.' };
const owned = {}, publicConfig = join(privateDir, 'public.json');
let child, environment, vite, browser, stage = 'preflight';
async function api(path, method = 'GET', body) {
  const response = await fetch('https://api.clerk.com' + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  record.providerCalls.push({ method, path: path.replace(/user_[^/]+|sess_[^/]+/g, '[owned-id]'), status: response.status });
  return { status: response.status, data };
}
function message(type) {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { cleanup(); fail(new Error('Child message timeout')); }, 120000);
    const receive = row => { if (row.type === type) { cleanup(); done(row); } else if (row.type === 'failure') { cleanup(); fail(new Error(row.error)); } };
    const closed = () => { cleanup(); fail(new Error('Child closed before ' + type)); };
    const cleanup = () => { clearTimeout(timer); child.off('message', receive); child.off('close', closed); };
    child.on('message', receive); child.on('close', closed);
  });
}
try {
  const instance = await api('/v1/instance'); assert.equal(instance.status, 200);
  assert.equal(instance.data.environment_type, 'development'); record.instanceMode = 'development';
  for (const role of ['customer', 'captain', 'admin']) {
    stage = 'create-' + role;
    const created = await api('/v1/users', 'POST', { external_id: run + '-' + role,
      email_address: ['rcs-' + randomUUID() + '+clerk_test@example.com'], skip_password_requirement: true,
      first_name: 'Synthetic Session Test', public_metadata: { role, sessionTestRun: run } });
    if (created.status === 200 && created.data.external_id === run + '-' + role) owned[role] = created.data.id;
    assert.equal(created.status, 200); assert.match(owned[role], /^user_/);
  }
  const jwks = await (await fetch('https://' + frontendHost + '/.well-known/jwks.json', { signal: AbortSignal.timeout(15000) })).json();
  assert.equal(jwks.keys.length, 1);
  const jwtKey = createPublicKey({ key: jwks.keys[0], format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  await writeFile(publicConfig, JSON.stringify({ users: owned, publishableKey, jwtKey }), { flag: 'wx' });
  stage = 'disposable-database'; environment = await startPostgisTestEnvironment();
  const inherited = Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  child = spawn(process.execPath, ['--import','./tests/helpers/phase9Isolation.js','--import','tsx','tests/e2e/liveSessionRevocation.mjs'], {
    cwd: join(repository, 'backend'), windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'], env: { ...inherited,
      NODE_ENV: 'test', PHASE9_ISOLATED: '1', TEST_DATABASE_URL: environment.connectionString,
      DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE, DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV,
      PHASE9_EMPTY_ENV_DIR: privateDir, AUTH_SESSION_PUBLIC_CONFIG: publicConfig,
      CLERK_SECRET_KEY: 'sk_test_session_synthetic_constructor', OPENAI_API_KEY: 'session-denied-constructor-key',
      FARE_QUOTE_SECRET: 'session-synthetic-only', RAZORPAY_KEY_ID: 'rzp_test_verification',
      RAZORPAY_KEY_SECRET: 'verification-payment-secret', RAZORPAY_WEBHOOK_SECRET: 'verification-webhook-secret' },
  });
  let diagnostics = ''; child.stdout.on('data', bytes => { diagnostics += bytes; }); child.stderr.on('data', bytes => { diagnostics += bytes; });
  child.on('message', async row => {
    if (row.type !== 'session-lookup') return;
    const start = performance.now();
    try {
      const session = await client.sessions.getSession(row.sessionId);
      assert(Object.values(owned).includes(session.userId), 'Session must belong to this run');
      record.lookups.push({ status: session.status, latencyMs: performance.now() - start });
      if (child.connected) child.send({ type: 'session-result', requestId: row.requestId,
        session: { id: session.id, userId: session.userId, status: session.status } });
    } catch (error) {
      record.lookups.push({ errorStatus: error.status ?? 'network', latencyMs: performance.now() - start });
      if (child.connected) child.send({ type: 'session-result', requestId: row.requestId, status: error.status });
    }
  });
  child.once('close', async () => { await writeFile(join(output, 'child.log'), diagnostics.replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, '[key-redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]')); });
  const ready = await message('ready');
  const require = createRequire(join(repository, 'frontend/package.json'));
  const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default;
  const tailwind = (await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)).default;
  process.env.VITE_CLERK_PUBLISHABLE_KEY = publishableKey; process.env.VITE_API_BASE_URL = '/fixture-backend';
  vite = await createServer({ configFile: false, root: join(repository, 'frontend'), cacheDir: join(privateDir, 'vite-cache'),
    envDir: privateDir, plugins: [react(), tailwind()],
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': ready.apiUrl, '/fixture-backend': { target: ready.apiUrl, rewrite: path => path.replace(/^\/fixture-backend/, '') } } } });
  await vite.listen(); const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch();
  const paths = { customer: '/api/users/me', captain: '/api/driver/me/wallet', admin: '/api/admin/zones' };
  for (const role of Object.keys(owned)) {
    stage = 'real-sdk-' + role;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['127.0.0.1','localhost',frontendHost,'cdn.jsdelivr.net'].includes(url.hostname) || ['data:','blob:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname === frontendHost) record.browserProviderRequests.push({ path: url.pathname.replace(/user_[^/]+|sess_[^/]+/g, '[owned-id]'), status: response.status() });
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.Clerk?.loaded, undefined, { timeout: 90000 });
    const login = async () => {
      const ticket = await api('/v1/sign_in_tokens', 'POST', { user_id: owned[role], expires_in_seconds: 300 }); assert.equal(ticket.status, 200);
      return page.evaluate(async ticket => { const signIn = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket });
        await window.Clerk.setActive({ session: signIn.createdSessionId });
        return { sessionId: signIn.createdSessionId, jwt: await window.Clerk.session.getToken({ skipCache: true }) }; }, ticket.data.token);
    };
    const original = await login();
    const claims = JSON.parse(Buffer.from(original.jwt.split('.')[1], 'base64url'));
    assert.equal(claims.sub, owned[role]); assert.equal(claims.sid, original.sessionId);
    const request = jwt => fetch(ready.apiUrl + paths[role], { headers: { Authorization: 'Bearer ' + jwt }, signal: AbortSignal.timeout(5000) });
    assert.equal((await request(original.jwt)).status, 200);
    const revoked = await api('/v1/sessions/' + original.sessionId + '/revoke', 'POST', {});
    assert.equal(revoked.status, 200); assert.equal(revoked.data.status, 'revoked');
    const confirmed = await client.sessions.getSession(original.sessionId); assert.equal(confirmed.status, 'revoked');
    assert(claims.exp > Date.now() / 1000, 'Original token must remain unexpired');
    const after = await request(original.jwt); assert.equal(after.status, 401);
    record.checks.push({ role, activeStatus: 200, confirmedProviderStatus: confirmed.status, sameUnexpiredTokenStatus: after.status,
      tokenRemainingMs: claims.exp * 1000 - Date.now(), tokenLifetimeSeconds: claims.exp - claims.iat });
    await page.evaluate(async () => { try { await window.Clerk.session?.getToken({ skipCache: true }); } catch { /* Revoked provider token refresh is expected to fail. */ } });
    await page.reload(); await page.waitForFunction(() => window.Clerk?.loaded && !window.Clerk.user, undefined, { timeout: 90000 });
    const replacement = await login(); assert.notEqual(replacement.sessionId, original.sessionId);
    assert.equal((await request(replacement.jwt)).status, 200);
    await page.evaluate(sessionId => window.Clerk.signOut({ sessionId }), replacement.sessionId);
    const ended = await client.sessions.getSession(replacement.sessionId); assert.notEqual(ended.status, 'active');
    assert.equal((await request(replacement.jwt)).status, 401);
    record.checks.at(-1).newSessionStatus = 200; record.checks.at(-1).sdkLogoutStatus = ended.status;
    await context.close();
  }
  const final = message('final'); child.send({ type: 'assert-final' }); record.database = await final;
  record.status = 'PASS';
} catch (error) {
  record.status = 'FAILED'; record.failedStage = stage;
  record.errorName = error.name; record.errorCodes = error.errors?.map(item => item.code);
  record.error = String(error.message).replaceAll(secret, '[redacted]').replaceAll(publishableKey, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]').slice(0, 400);
  process.exitCode = 1;
} finally {
  await browser?.close(); await vite?.close();
  if (child?.connected) { const closed = new Promise(done => child.once('close', done)); child.send({ type: 'close' }); await closed; }
  await environment?.stop();
  for (const [role, id] of Object.entries(owned)) {
    const user = await api('/v1/users/' + id);
    assert.equal(user.data.external_id, run + '-' + role); assert.equal(user.data.public_metadata?.sessionTestRun, run);
    record.deleted[role] = (await api('/v1/users/' + id, 'DELETE')).status === 200;
    if (!record.deleted[role]) { record.status = 'FAILED'; process.exitCode = 1; }
  }
  await unlink(publicConfig).catch(() => {});
  const cachePath = resolve(privateDir, 'vite-cache');
  assert.ok(cachePath.startsWith(resolve(privateRoot) + '\\'));
  await rm(cachePath, { recursive: true, force: true });
  await rmdir(privateDir).catch(() => {});
  record.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ run, status: record.status, failedStage: record.failedStage, deleted: record.deleted }));
}
