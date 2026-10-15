import express from 'express';

const validNavigation = value => {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://www.google.com' || url.pathname !== '/maps/dir/' || url.username || url.password
      || url.hash || url.searchParams.get('api') !== '1' || url.searchParams.get('travelmode') !== 'driving'
      || url.searchParams.get('dir_action') !== 'navigate') return false;
    const allowed = new Set(['api', 'destination', 'travelmode', 'dir_action', 'waypoints']);
    if ([...url.searchParams].some(([key]) => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) return false;
    const points = [url.searchParams.get('destination'), ...(url.searchParams.has('waypoints') ? [url.searchParams.get('waypoints')] : [])];
    return points.every(point => {
      if (!/^\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(point ?? '')) return false;
      const [lat, lng] = point.split(',').map(Number);
      return lat >= 28.5 && lat <= 28.8 && lng >= 77.1 && lng <= 77.4;
    });
  } catch { return false; }
};

// Dedicated loopback external-input provider. No system position API, directions
// provider, notification or installed navigation application is contacted.
export async function createPhase9DeviceProvider(gateway, readLocation) {
  const target = new URL(gateway.url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || !target.port) throw new Error('Device provider requires an owned loopback gateway');
  const observations = [];
  const app = express();
  app.use(express.raw({ type: () => true, limit: '2mb' }));
  app.get('/phase9-synthetic-location', async (_req, res) => {
    const value = structuredClone(await readLocation());
    observations.push({ kind: 'synthetic-gps', value });
    res.json(value);
  });
  app.post('/phase9-navigation-intent', (req, res) => {
    let value;
    try { value = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'Malformed synthetic navigation' }); }
    if (!validNavigation(value?.url)) return res.status(400).json({ error: 'Navigation outside synthetic fixture' });
    observations.push({ kind: 'synthetic-navigation-intent', url: value.url, externalAppOpened: false });
    return res.json({ recorded: true, externalAppOpened: false });
  });
  app.use(async (req, res) => {
    try {
      const headers = {};
      for (const key of ['authorization', 'cookie', 'content-type']) if (req.headers[key]) headers[key] = req.headers[key];
      const response = await fetch(gateway.url + req.originalUrl, { method: req.method, headers, redirect: 'error',
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: req.body }) });
      res.status(response.status);
      if (response.headers.get('content-type')) res.set('content-type', response.headers.get('content-type'));
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch { res.status(502).json({ error: 'Isolated device provider transport failed' }); }
  });
  const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)); });
  return { url: 'http://127.0.0.1:' + server.address().port, observations,
    async close() { server.closeAllConnections(); await new Promise(done => server.close(done)); } };
}
