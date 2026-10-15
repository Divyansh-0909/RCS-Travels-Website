import express from 'express';
import { nativeClerkEnvironment } from './phase9NativeClerkEnvironment.js';

// Loopback fault injector/proxy; business responses come from the real protected
// Phase9 application. It stores no cookies or authorization values in receipts.
export async function createNativeGateway(harness, { acceptanceFault = 'before', beforeRequest = async () => {} } = {}) {
  if (![false, 'before', 'after'].includes(acceptanceFault)) throw new Error('Unknown acceptance fault');
  let actor = 'captain';
  const app = express();
  const requests = [];
  const faults = [];
  let failAcceptance = acceptanceFault;
  app.use(express.raw({ type: () => true, limit: '2mb' }));
  app.get('/phase9-health', (_req, res) => res.json({ mode: 'isolated-phase9', production: false }));
  app.use(async (req, res) => {
    try {
      const accepting = req.method === 'PATCH' && /^\/api\/driver\/offers\/[^/]+\/accept$/.test(req.path);
      await beforeRequest({ method: req.method, path: req.path, actor });
      if (failAcceptance === 'before' && accepting) {
        failAcceptance = false;
        const booking = await harness.lifecycle.booking();
        const driver = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors.captain.id } });
        faults.push({ kind: 'acceptance-503', bookingStatus: booking.status, driverAssigned: booking.driverId !== null,
          walletBalance: driver.walletBalance, at: new Date().toISOString() });
        requests.push({ method: req.method, path: req.path, status: 503, injected: true });
        return res.status(503).json({ error: 'Controlled acceptance outage. Please retry.' });
      }
      const headers = {};
      for (const key of ['authorization','cookie','content-type']) if (req.headers[key]) headers[key] = req.headers[key];
      if (req.path.startsWith('/fixture-auth/')) headers.cookie = 'fixture_actor=' + actor;
      const response = await fetch(harness.apiUrl + req.originalUrl, { method: req.method, headers, redirect: 'error',
        ...(['GET','HEAD'].includes(req.method) ? {} : { body: req.body }) });
      let bytes = Buffer.from(await response.arrayBuffer());
      if (req.path === '/fixture-auth/v1/environment' && response.ok) {
        bytes=Buffer.from(JSON.stringify(nativeClerkEnvironment(JSON.parse(bytes.toString('utf8')))));
      }
      const observed = { method: req.method, path: req.path, status: response.status };
      if (req.path === '/api/driver/me' && response.ok) observed.actorId = JSON.parse(bytes.toString('utf8')).id;
      if (req.path.startsWith('/api/') && req.method === 'PATCH' && response.headers.get('content-type')?.includes('json')) {
        observed.response = JSON.parse(bytes.toString('utf8'));
      }
      requests.push(observed);
      if (failAcceptance === 'after' && accepting && response.ok) {
        failAcceptance = false;
        const booking = await harness.lifecycle.booking();
        faults.push({ kind: 'acceptance-acknowledgement-lost', bookingStatus: booking.status,
          driverAssigned: booking.driverId !== null, actor, at: new Date().toISOString() });
        observed.authoritativeStatus = observed.status;
        observed.status = 503;
        return res.status(503).json({ error: 'Controlled acknowledgement loss. Refresh before retrying.' });
      }
      res.status(response.status);
      if (response.headers.get('content-type')) res.set('content-type', response.headers.get('content-type'));
      res.send(bytes);
    } catch {
      requests.push({ method: req.method, path: req.path, status: 502, transportFailure: true });
      res.status(502).json({ error: 'Isolated native transport failed' });
    }
  });
  const server = await new Promise(done => { const listener = app.listen(0,'127.0.0.1',() => done(listener)); });
  return { url: `http://127.0.0.1:${server.address().port}`, requests, faults,
    selectActor(value) {
      if (!['captain', 'replacement'].includes(value) || !harness.actors[value]) throw new Error('Unknown native actor');
      actor = value;
    },
    async close() { server.closeAllConnections(); await new Promise(done => server.close(done)); } };
}
