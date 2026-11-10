import http from 'node:http';
import { randomUUID } from 'node:crypto';

// A test-host rendezvous: publish the real fixture offer only after Maestro's
// driver is ready. Never mount this endpoint in the application or its proxy.
export async function createMaestroTrigger(action) {
  const route = '/fixture-ready/' + randomUUID();
  let result;
  const events = [];
  const server = http.createServer(async (req, res) => {
    if (req.url !== route) { res.writeHead(404).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    result ||= Promise.resolve().then(async () => {
      events.push({ event: 'maestro-ready', at: new Date().toISOString() });
      await action();
      events.push({ event: 'offer-created', at: new Date().toISOString() });
    });
    try {
      await result;
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ready":true}');
    } catch {
      res.writeHead(500).end('Synthetic fixture setup failed');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}${route}`,
    events,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
