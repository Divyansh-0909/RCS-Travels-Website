// Compare additions run independently of the document watcher.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditHandler } from './audit-server.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origins = ['http://127.0.0.1:4317', 'http://localhost:4317'];
const config = { root, runtime: path.join(root, 'output/handoff'), port: 4319, auditOrigins: origins };
http.createServer((req, res) => {
  if (!['127.0.0.1:4319', 'localhost:4319'].includes(req.headers.host)) { res.writeHead(403).end(); return; }
  if (req.headers.origin && !origins.includes(req.headers.origin)) { res.writeHead(403).end(); return; }
  if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    if (!req.headers.origin || req.url !== '/api/consistency/audit-decision' || req.headers['access-control-request-method'] !== 'POST' || !/^(?:content-type)?$/i.test(req.headers['access-control-request-headers'] || '')) { res.writeHead(403).end(); return; }
    res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204).end(); return;
  }
  if (!auditHandler(config, req, res)) res.writeHead(404).end();
}).listen(4319, '127.0.0.1', () => console.log('Compare audit additions: http://127.0.0.1:4319'));
