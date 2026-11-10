// Dedicated local fixture preview. Never loaded by the production application.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBrowserAuth, browserPublishableKey } from '../../backend/tests/helpers/phase9BrowserAuth.js';
import { parse as parseCoverage } from './coverage/core.mjs';
import { previewRequest } from './coverage/preview.mjs';
import { bookingFixture, scenarios as bookingScenarios, records as bookingRecords } from './p06/fixture.mjs';
import { previewOccurrence } from './consistency/catalog.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const front = createRequire(path.join(root, 'frontend/package.json'));
const back = createRequire(path.join(root, 'backend/package.json'));
const { createServer } = await import(pathToFileURL(front.resolve('vite')).href);
const express = back('express');
const app = express();
app.use(express.json());
app.use(bookingFixture);
const user = { id: 'p01_synthetic_customer', clerkId: 'user_p01_customer', name: 'Synthetic UI Reviewer', role: 'customer', savedPlaces: [], emergencyContact: null, notifications: { whatsapp: true, push: true, promotions: false } };
const auth = createBrowserAuth({ customer: user, admin: { ...user, id: 'p01_synthetic_admin', clerkId: 'user_p01_admin', role: 'admin' } });
app.use('/fixture-clerk', express.static(path.join(root, 'frontend/node_modules/@clerk/clerk-js/dist')));
app.use('/fixture-auth', (req, res) => { if (!/(?:^|;\s*)fixture_actor=/.test(req.headers.cookie || '')) req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + 'fixture_actor=customer'; auth.middleware(req, res); });
let preferences = { notifications: { ...user.notifications }, liveLocationSharing: false };
app.get('/api/users/me', (_req, res) => res.json(user));
app.get('/api/users/me/preferences', (_req, res) => res.json(preferences));
app.put('/api/users/me/preferences', (req, res) => {
  preferences = { ...preferences, ...req.body, notifications: { ...preferences.notifications, ...req.body.notifications } };
  res.json(preferences);
});
app.get('/api/users/me/saved-places', (_req, res) => res.json([]));
app.get('/api/users/me/bookings', (_req, res) => res.json([]));
app.get('/api/admin/booking', (_req, res) => res.json({ bookings: [], total: 0 }));
app.get('/api/admin/driver', (_req, res) => res.json({ drivers: [], total: 0 }));
app.get('/api/admin/user', (_req, res) => res.json({ users: [], total: 0 }));
app.use('/api', (req, res) => res.status(req.method === 'GET' ? 200 : 409).json(req.method === 'GET' ? [] : { error: 'This operation is disabled in the P01 synthetic preview' }));
const fixture = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
const envDir = path.join(root, 'output/handoff/empty-env'); fs.mkdirSync(envDir, { recursive: true });
const vite = await createServer({
  root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.js'), envDir,
  define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(browserPublishableKey), 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:1575') },
  plugins: [{ name: 'p01-isolated-auth', enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        const url=new URL(req.url,'http://127.0.0.1');
        if(url.pathname==='/__review/consistency'){
          const occurrence=previewOccurrence(url.searchParams.get('occurrence'),url.searchParams.get('theme')||'light');
          if(req.method!=='GET'||!occurrence){res.writeHead(400).end('Unknown local comparison occurrence');return;}
          res.setHeader('Set-Cookie',['p06_scenario=default; Path=/; SameSite=Lax','fixture_actor=customer; Path=/; SameSite=Lax']);
          res.writeHead(302,{Location:occurrence.route+'?rcsConsistency='+occurrence.id+'&preference='+occurrence.theme,'Cache-Control':'no-store'}).end();return;
        }
        if(url.pathname==='/__review/consistency-bridge.mjs'){
          if(req.method!=='GET'){res.writeHead(405).end();return;}
          res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('./consistency/bridge.mjs',import.meta.url)));return;
        }
        next();
      });
      server.middlewares.use((req,res,next)=>{
        res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:1575 ws://localhost:1575; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self'; form-action 'self'");next();
      });
      server.middlewares.use('/__review/p06',(req,res)=>{
        const query=new URL(req.url,'http://127.0.0.1').searchParams,scenario=query.get('scenario')||'default',issue=query.get('issue')||'';
        if(req.method!=='GET'||!bookingScenarios.has(scenario)||!/^$|^P06-B01-0[1-4]$/.test(issue)){res.writeHead(400).end('Unknown read-only review case');return;}
        res.setHeader('Set-Cookie',[`p06_scenario=${scenario}; Path=/; SameSite=Lax`,`fixture_actor=${issue==='P06-B01-02'?'guest':'customer'}; Path=/; SameSite=Lax`]);
        res.writeHead(302,{Location:'/book'+(issue?'?rcsReview='+issue:''),'Cache-Control':'no-store'}).end();
      });
      server.middlewares.use('/__review/p06-network',(req,res)=>{if(req.method!=='GET'){res.writeHead(405).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({synthetic:true,records:bookingRecords}));});
      server.middlewares.use('/__review/p06-replay.mjs',(_req,res)=>{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('./p06/replay.mjs',import.meta.url)));});
      server.middlewares.use('/__review/open', (req, res) => {
        if(req.method!=='GET'){res.writeHead(405).end();return;}
        const file=path.join(root,'tools/ui-quality/coverage/master-ui-coverage.csv');
        const allowed=new Set(fs.existsSync(file)?parseCoverage(fs.readFileSync(file,'utf8')).map(row=>row.preview_path).filter(Boolean):[]);
        const selected=previewRequest(req.url,allowed);
        if(!selected){res.writeHead(400).end('Unknown or unsafe local preview target');return;}
        // Reuse the existing synthetic Clerk fixture actor; this server is a
        // loopback-only developer process and is never part of the deployed app.
        const cookies=[`fixture_actor=${selected.actor}; Path=/; SameSite=Lax`];
        if(selected.target==='/book')cookies.push('p06_scenario=default; Path=/; SameSite=Lax');
        res.setHeader('Set-Cookie',cookies);
        res.writeHead(302,{Location:selected.target,'Cache-Control':'no-store'}).end();
      });
      server.middlewares.use('/__review/bridge.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(fs.readFileSync(new URL('./review-bridge.mjs', import.meta.url)));
      });
    },
    transformIndexHtml() { return [{tag:'script',children:fs.readFileSync(new URL('./consistency/prelude.js',import.meta.url),'utf8'),injectTo:'head-prepend'},{tag:'script',attrs:{type:'module',src:'/__review/consistency-bridge.mjs'},injectTo:'head-prepend'},{tag:'script',children:fs.readFileSync(new URL('./p06/prelude.js',import.meta.url),'utf8'),injectTo:'head-prepend'},{ tag: 'script', attrs: { type: 'module', src: '/__review/bridge.js' }, injectTo: 'head-prepend' }]; },
    transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/constants/support.js'))
      return code.replaceAll('window.location.href =', 'window.__rcsReviewIntent?.(').replace('`tel:${supportTel()}`;', '`tel:${supportTel()}`);').replace('`mailto:${supportEmail()}`;', '`mailto:${supportEmail()}`);');
    if (!id.replaceAll('\\', '/').endsWith('/src/main.jsx')) return;
    return fs.readFileSync(new URL('./consistency/seed.mjs',import.meta.url),'utf8')+'\n'+code.replace('<ClerkProvider publishableKey={PUBLISHABLE_KEY}>', '<ClerkProvider publishableKey={PUBLISHABLE_KEY} clerkJSUrl="/fixture-clerk/clerk.headless.browser.js" proxyUrl="/fixture-auth">');
  } }],
  server: { host: '127.0.0.1', port: 1575, strictPort: true, cors: false, proxy: { '/api': fixtureUrl, '/fixture-clerk': fixtureUrl, '/fixture-auth': fixtureUrl } },
});
app.use((error, _req, res, _next) => res.status(500).json({ error: 'Fixture error' }));
await vite.listen();
console.log('P01 actual app with synthetic auth/API fixtures: http://127.0.0.1:1575');
console.log('No .env files loaded. Unimplemented mutations return HTTP 409.');
const stop = async () => { await vite.close(); fixture.close(() => process.exit()); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
