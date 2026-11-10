// Isolated actual-app fixture; no .env, database, provider or payment credentials.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createBrowserAuth, browserPublishableKey } from '../../../backend/tests/helpers/phase9BrowserAuth.js';
import { cases, responseFor } from './cases.mjs';
const root = process.cwd(), port = Number(process.env.P07_PREVIEW_PORT || 1577);
const front = createRequire(path.join(root, 'frontend/package.json'));
const back = createRequire(path.join(root, 'backend/package.json'));
const express = back('express'), app = express(), records = [], counts = new Map();
const auth = createBrowserAuth({ customer: { id: 'p07_synthetic', clerkId: 'user_p01_customer', name: 'Synthetic P07 Rider', role: 'customer', notifications: {} } });
app.use(express.json());
app.use('/fixture-clerk', express.static(path.join(root, 'frontend/node_modules/@clerk/clerk-js/dist')));
app.use('/fixture-auth', (req, res) => { req.headers.cookie = 'fixture_actor=customer'; auth.middleware(req, res); });
app.get('/api/users/me', (_req, res) => res.json({ id: 'p07_synthetic', role: 'customer', name: 'Synthetic P07 Rider' }));
app.get('/api/bookings/:id/status', (req, res) => {
  const caseId = req.params.id.replace(/^p07-/, '').replace(/--.*/, '');
  if (!Object.hasOwn(cases, caseId)) return res.status(404).json({ error: 'Unknown synthetic case' });
  const count = (counts.get(req.params.id) || 0) + 1; counts.set(req.params.id, count);
  const r = responseFor(caseId, count); records.push({ method: 'GET', path: req.path, caseId, count, status: r.http });
  setTimeout(() => { if (!res.destroyed) res.status(r.http).json({ ...r.body, bookingId: req.params.id }); }, r.delay);
});
app.use('/api', (req, res) => {
  records.push({ method: req.method, path: req.path, denied: req.method !== 'GET' });
  if (req.method === 'GET') return res.json([]);
  // No synthetic payment is ever accepted or persisted. UI failure is observable.
  return setTimeout(() => res.status(409).json({ error: 'Synthetic operation denied: no payment or booking write' }), 400);
});
app.get('/__p07/network', (_req, res) => res.json({ synthetic: true, records }));
const apiServer = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const envDir = path.join(root, 'output/handoff/P07-2026-10-29/empty-env'); fs.mkdirSync(envDir, { recursive: true });
const { createServer } = await import(pathToFileURL(front.resolve('vite')).href);
const vite = await createServer({ root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.js'), envDir,
  resolve: { alias: [{ find: /^react$/, replacement: front.resolve('react') }, { find: /^react-dom\/client$/, replacement: front.resolve('react-dom/client') }] },
  cacheDir: path.join(root, 'output/handoff/P07-2026-10-29/vite-cache'),
  define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(browserPublishableKey), 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:' + port) },
  plugins: [{ name: 'p07-safe-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__p07/components.jsx') return path.join(root, 'tools/ui-quality/p07/components.jsx'); },
    configureServer(server) { server.middlewares.use(async (req, res, next) => {
      res.setHeader('Content-Security-Policy', `default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port}; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'none'; form-action 'none'`);
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/__review/p07') {
        const id = url.searchParams.get('case') || 'assigned';
        if (req.method !== 'GET' || !Object.hasOwn(cases, id)) return res.writeHead(400).end('Unknown P07 case');
        res.setHeader('Set-Cookie', 'fixture_actor=customer; Path=/; SameSite=Lax');
        return res.writeHead(302, { Location: '/booking/p07-' + id + '--' + Date.now().toString(36), 'Cache-Control': 'no-store' }).end();
      }
      if (url.pathname === '/__review/p07-component') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(await server.transformIndexHtml(url.pathname, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>P07 synthetic component presentation</title></head><body><div id="root"></div><script type="module" src="/__p07/components.jsx"></script></body></html>'));
      }
      if (url.pathname === '/__p07/prelude.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(new URL('./prelude.js', import.meta.url))); }
      if (url.pathname === '/__p07/review-bridge.mjs') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(new URL('../review-bridge.mjs', import.meta.url))); }
      if (url.pathname === '/__p07/fixture.json') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ synthetic: true, cases: Object.keys(cases) })); }
      if (url.pathname === '/__p07/network') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ records })); }
      next();
    }); },
    transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', attrs: { src: '/__p07/prelude.js' }, injectTo: 'head-prepend' }, { tag: 'script', attrs: { type: 'module', src: '/__p07/review-bridge.mjs' }, injectTo: 'head-prepend' }] },
    transform(code, id) {
      const file = id.replaceAll('\\', '/');
      if (file.endsWith('/src/main.jsx')) return code.replace('<ClerkProvider publishableKey={PUBLISHABLE_KEY}>', '<ClerkProvider publishableKey={PUBLISHABLE_KEY} clerkJSUrl="/fixture-clerk/clerk.headless.browser.js" proxyUrl="/fixture-auth">');
      if (file.endsWith('/src/constants/support.js') || file.endsWith('/src/pages/TrackingPage.jsx')) return code.replace(/window\.location\.href = ([^;]+);/g, 'window.__p07Intent?.($1);');
    }
  }],
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] }, proxy: { '/api': 'http://127.0.0.1:' + apiServer.address().port, '/fixture-auth': 'http://127.0.0.1:' + apiServer.address().port, '/fixture-clerk': 'http://127.0.0.1:' + apiServer.address().port } }
});
await vite.listen(); console.log('P07 synthetic actual-app preview: http://127.0.0.1:' + port + '; external providers and all product writes disabled');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await vite.close(); apiServer.close(() => process.exit()); });
