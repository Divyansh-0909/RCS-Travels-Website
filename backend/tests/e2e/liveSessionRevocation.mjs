import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { clerkClient } from '@clerk/express';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createHumanClerkAuth } from '../../middleware/auth.js';

const config = JSON.parse(await readFile(process.env.AUTH_SESSION_PUBLIC_CONFIG, 'utf8'));
assert.match(config.publishableKey, /^pk_test_/);
const harness = await createBrowserHarness();
harness.liveSessions.restore();
process.env.CLERK_PUBLISHABLE_KEY = config.publishableKey;
await harness.db.user.update({ where: { id: harness.actors.customer.id }, data: { clerkId: config.users.customer } });
await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { clerkId: config.users.captain } });
const { phase9FinancialSnapshot, forbidPhase9Consequences } = await import('../helpers/phase9Lifecycle.js');
const before = await phase9FinancialSnapshot(harness.db);
await forbidPhase9Consequences(harness.db);
const waiting = new Map(); let sequence = 0;
clerkClient.sessions.getSession = id => new Promise((done, fail) => {
  const requestId = ++sequence;
  waiting.set(requestId, { done, fail });
  process.send({ type: 'session-lookup', requestId, sessionId: id });
});
const app = express(), requests = [];
app.use((req, res, next) => {
  res.on('finish', () => requests.push({ path: req.path, method: req.method, status: res.statusCode }));
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read-only live witness' });
  next();
});
app.use(createHumanClerkAuth({ publishableKey: config.publishableKey, jwtKey: config.jwtKey }));
const { default: users } = await import('../../routes/users.js');
const { default: driver } = await import('../../routes/driver.ts');
const { default: admin } = await import('../../routes/admin.ts');
app.use('/api/users', users); app.use('/api/driver', driver); app.use('/api/admin', admin);
const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)); });
process.send({ type: 'ready', apiUrl: 'http://127.0.0.1:' + server.address().port });
let closing = false;
async function close() {
  if (closing) return; closing = true;
  server.closeAllConnections(); await new Promise(done => server.close(done)); await harness.close();
}
process.on('message', async message => {
  if (message.type === 'session-result') {
    const item = waiting.get(message.requestId); waiting.delete(message.requestId);
    if (message.session) item?.done(message.session);
    else item?.fail(Object.assign(new Error('Provider verification unavailable'), { status: message.status }));
    return;
  }
  try {
    if (message.type === 'assert-final') {
      assert.deepEqual(await phase9FinancialSnapshot(harness.db), before);
      process.send({ type: 'final', unchangedFinancialState: true, requests });
    } else if (message.type === 'close') { await close(); process.exit(0); }
  } catch { process.send({ type: 'failure', error: 'Live witness invariant failed' }); await close(); process.exit(1); }
});
process.on('disconnect', () => { close().finally(() => process.exit(1)); });
