import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { clerkMiddleware } from '@clerk/express';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';

// The real provider's public verification key and synthetic actor identity are
// supplied by the parent. No live secret reaches this loopback-only DB child.
const config = JSON.parse(await readFile(process.env.PHASE9_LIVE_PUBLIC_CONFIG, 'utf8'));
assert.match(config.publishableKey, /^pk_test_/); assert.match(config.userId, /^user_/);
assert.match(config.jwtKey, /^-----BEGIN PUBLIC KEY-----/);
const harness = await createBrowserHarness();
process.env.CLERK_PUBLISHABLE_KEY = config.publishableKey;
const { phase9FinancialSnapshot, forbidPhase9Consequences } = await import('../helpers/phase9Lifecycle.js');
const sources = await phase9UiSourceHashes(['backend/tests/e2e/phase9LiveClerkReadOnly.mjs']);
await harness.db.user.update({ where: { id: harness.actors.customer.id }, data: { clerkId: config.userId } });
assert.equal((await harness.lifecycle.deliver()).status, 200);
const before = await phase9FinancialSnapshot(harness.db);
await forbidPhase9Consequences(harness.db);
const app = express(), requests = [];
app.use((req, res, next) => {
  res.on('finish', () => requests.push({ method: req.method, path: req.path, status: res.statusCode }));
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read-only live authentication witness' });
  next();
});
app.use(clerkMiddleware({ publishableKey: config.publishableKey,
  secretKey: 'sk_test_phase9_synthetic_constructor_only', jwtKey: config.jwtKey }));
const { default: users } = await import('../../routes/users.js');
const { default: bookings } = await import('../../routes/bookings.js');
app.use('/api/users', users); app.use('/api/bookings', bookings);
app.use((_error, _req, res, _next) => res.status(500).json({ error: 'Isolated authentication request failed' }));
const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)); });
process.send({ type: 'ready', apiUrl: 'http://127.0.0.1:' + server.address().port, bookingId: harness.lifecycle.bookingId });
let closing = false;
async function close() {
  if (closing) return; closing = true;
  server.closeAllConnections(); await new Promise(done => server.close(done)); await harness.close();
}
process.on('message', async message => {
  try {
    if (message.type === 'assert-final') {
      const after = await phase9FinancialSnapshot(harness.db); assert.deepEqual(after, before);
      assert.deepEqual(await phase9UiSourceHashes(['backend/tests/e2e/phase9LiveClerkReadOnly.mjs']), sources);
      process.send({ type: 'final', status: 'PASS', before, after, requests, sources });
    } else if (message.type === 'close') { console.log(JSON.stringify({ requests })); await close(); process.exit(0); }
  } catch { process.send({ type: 'failure', error: 'Live auth child invariant failed' }); await close(); process.exit(1); }
});
process.on('disconnect', () => { close().finally(() => process.exit(1)); });
