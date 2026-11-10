import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('output/handoff/website-consistency-2026-10-26');
const known = new Map([
  ['/', [path.join(root, 'index.html'), 'text/html; charset=utf-8']],
  ['/font.woff2', [path.resolve('frontend/src/assets/fonts/PPMori-Regular.woff2'), 'font/woff2']],
  ['/report.md', [path.resolve('docs/ui-quality/VC-B02-website-consistency-2026-10-26.md'), 'text/plain; charset=utf-8']],
  ...['audit.json', 'source-inventory.json', 'browser-observations.json'].map(name => ['/' + name, [path.join(root, name), 'application/json; charset=utf-8']]),
  ...fs.readdirSync(path.join(root, 'images')).filter(name => /^[a-z0-9-]+\.png$/.test(name)).map(name => ['/images/' + name, [path.join(root, 'images', name), 'image/png']]),
]);
http.createServer((req, res) => {
  if (!['127.0.0.1:4318', 'localhost:4318'].includes(req.headers.host)) { res.writeHead(403).end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const route = new URL(req.url, 'http://127.0.0.1:4318').pathname, entry = known.get(route);
  if (!entry || !fs.existsSync(entry[0])) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', entry[1]); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(entry[0]).pipe(res);
}).listen(4318, '127.0.0.1', () => console.log('Website consistency audit: http://127.0.0.1:4318/'));
