// Existing review UI with a manual P07 board. No document worker/dispatcher.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { viewerHandler } from '../../handoff/viewer-server.mjs';
import { issues } from './issues.mjs';
const root = process.cwd(), out = path.resolve('output/handoff/P07-2026-10-29');
const config = { root, runtime: path.resolve('output/handoff'), port: 4317, previewUrl: 'http://127.0.0.1:1578' };
const history = JSON.parse(fs.readFileSync(path.join(config.runtime, 'review.json'), 'utf8'));
const review = { ...history, issues: [...(history.issues || []).filter(i => !issues.some(p => p.id === i.id)), ...issues] };
const state = { state: 'APPROVAL_REQUIRED', action: 'Read-only P07 review; document automation OFF', updatedAt: new Date().toISOString(), connections: { google: 'Manual connector; watcher OFF' }, run: { phase: 'P07', id: 'P07-2026-10-29', stage: 'owner-review' } };
const handler = viewerHandler(config, { state });
http.createServer((req, res) => {
  if (!['127.0.0.1:4317', 'localhost:4317'].includes(req.headers.host)) return res.writeHead(403).end();
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method !== 'GET') return res.writeHead(405).end('P07 reviewer is read-only; give exact choices in the chat.');
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/review') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(review)); }
  if (pathname === '/api/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ previewUrl: config.previewUrl, progress: { status: 'P07 review', doing: state.action, updatedAt: state.updatedAt }, state })); }
  if (pathname === '/p07') { res.setHeader('Content-Type', 'text/html'); return res.end(fs.readFileSync(new URL('./board.html', import.meta.url))); }
  if (pathname === '/p07/issues.json') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(issues)); }
  if (pathname === '/p07/theme.css') { res.setHeader('Content-Type', 'text/css'); return res.end(fs.readFileSync(path.join(root, 'frontend/src/theme.generated.css'))); }
  if (pathname === '/p07/font.woff2') { res.setHeader('Content-Type', 'font/woff2'); return res.end(fs.readFileSync(path.join(root, 'frontend/src/assets/fonts/PPMori-Regular.woff2'))); }
  handler(req, res);
}).listen(4317, '127.0.0.1', () => console.log('P07 live issue/compare board: http://127.0.0.1:4317/p07 (GET-only, no watcher)'));
