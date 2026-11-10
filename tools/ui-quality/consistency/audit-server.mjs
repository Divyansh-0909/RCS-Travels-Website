import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, readJson } from '../../handoff/core.mjs';
import { auditBatch, auditCatalog, auditDirectory } from './audit-catalog.mjs';

export const auditRegistryFile = config => path.join(config.runtime, 'consistency-audit-decisions.json');
export const auditDecisions = config => readJson(auditRegistryFile(config), { schema: 1, batch: auditBatch, revision: 0, decisions: [], history: [] });
export function validateAuditChoice(body, catalog) {
  const family = catalog?.families.find(item => item.id === body?.familyId);
  if (!family || body.catalogRevision !== catalog.catalogRevision || !Number.isInteger(body.revision) || body.revision < 0) return null;
  if (!Array.isArray(body.screenIds) || !body.screenIds.length || new Set(body.screenIds).size !== body.screenIds.length || !body.screenIds.every(id => family.screens.includes(id))) return null;
  if (![...family.choices.map(choice => choice.id), 'CUSTOM'].includes(body.choice) || typeof body.note !== 'string' || body.note.length > 2000 || (body.choice === 'CUSTOM' && !body.note.trim())) return null;
  return { familyId: family.id, choice: body.choice, screenIds: body.screenIds, note: body.note.trim(), catalogRevision: catalog.catalogRevision, ownerDecision: body.choice === 'REVIEW' ? 'OWNER_REVIEW_REQUIRED' : 'OWNER_SELECTED', implementationStatus: 'NOT_CHANGED', aestheticAcceptance: 'NOT_RECORDED', at: new Date().toISOString() };
}
export function auditHandler(config, req, res) {
  const route = req.url?.split('?')[0];
  if (!['/api/consistency/audit', '/api/consistency/audit-decision', '/consistency-audit.js', '/consistency-audit/font.woff2'].includes(route) && !route.startsWith('/consistency-audit/images/')) return false;
  const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  if (route === '/api/consistency/audit-decision') {
    if (req.method !== 'POST') { json(405, { error: 'Use the review form' }); return true; }
    const origins = config.auditOrigins || [`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`];
    if (!origins.includes(req.headers.origin) || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { json(403, { error: 'Trusted reviewer JSON only' }); return true; }
    let size = 0, body = '', finished = false;
    req.on('data', chunk => { size += chunk.length; if (size > 8192) { if (!finished) { finished = true; json(413, { error: 'Review is too large' }); } return; } body += chunk; });
    req.on('end', () => {
      if (finished) return;
      let parsed; try { parsed = JSON.parse(body); } catch { json(400, { error: 'Invalid review' }); return; }
      const catalog = auditCatalog(config.root), choice = validateAuditChoice(parsed, catalog);
      if (!choice) { json(400, { error: 'Choose a listed finding, option and screens. Custom needs a note.' }); return; }
      const current = auditDecisions(config);
      if (parsed.revision !== current.revision) { json(409, { error: 'Choices changed. Reload before saving.' }); return; }
      try {
        atomicJson(auditRegistryFile(config), { schema: 1, batch: auditBatch, revision: current.revision + 1, decisions: [...current.decisions.filter(item => item.familyId !== choice.familyId), choice], history: [...current.history, choice] });
        json(200, { saved: choice, revision: current.revision + 1 });
      } catch { json(500, { error: 'Could not save the choice' }); }
    }); return true;
  }
  if (req.method !== 'GET') { json(405, { error: 'Read only' }); return true; }
  if (route === '/api/consistency/audit') {
    const catalog = auditCatalog(config.root);
    if (!catalog) json(503, { error: 'Audit evidence unavailable' });
    else json(200, { ...catalog, registry: auditDecisions(config) });
  } else if (route === '/consistency-audit.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(fs.readFileSync(new URL('./audit-compare.js', import.meta.url)));
  } else if (route === '/consistency-audit/font.woff2') {
    res.setHeader('Content-Type', 'font/woff2'); fs.createReadStream(path.join(config.root, 'frontend/src/assets/fonts/PPMori-Regular.woff2')).pipe(res);
  } else {
    const name = route.slice('/consistency-audit/images/'.length);
    if (!/^[a-z0-9-]+\.png$/.test(name)) { json(404, { error: 'Unknown audit image' }); return true; }
    const file = path.join(config.root, auditDirectory, 'images', name);
    if (!fs.existsSync(file)) json(404, { error: 'Image unavailable' });
    else { res.setHeader('Content-Type', 'image/png'); fs.createReadStream(file).pipe(res); }
  }
  return true;
}
