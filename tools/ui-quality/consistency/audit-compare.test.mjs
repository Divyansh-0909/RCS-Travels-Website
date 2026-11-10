import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { viewerHandler } from '../../handoff/viewer-server.mjs';
import { auditCatalog } from './audit-catalog.mjs';
import { validateAuditChoice } from './audit-server.mjs';
import { catalogRevision } from './server.mjs';
import { parse } from '../coverage/core.mjs';

test('all 14 audit findings bind existing website scopes without changing the live catalog', () => {
  const catalog = auditCatalog(process.cwd()), ids = new Set(parse(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv', 'utf8')).map(row => row.id));
  assert.equal(catalog.families.length, 14);
  assert.equal(new Set(catalog.families.map(family => family.id)).size, 14);
  assert(catalog.families.every(family => family.screens.every(id => ids.has(id))));
  assert(catalog.families.every(family => family.sourceSamples.length && family.sourceSamples.every(source => source.line > 0 && source.sha256.length === 64)));
  assert.equal(catalogRevision, 'a9b13a967a9c571a90d08e646ced757a6bc38ea6dd6a3767a682ba71adc9e15f');
  const family = catalog.families.find(item => item.id === 'VC-B02-06');
  const body = { familyId: family.id, choice: 'A', screenIds: family.screens, note: '', catalogRevision: catalog.catalogRevision, revision: 0 };
  assert.equal(validateAuditChoice(body, catalog).implementationStatus, 'NOT_CHANGED');
  for (const change of [{ familyId: 'unknown' }, { choice: 'EXECUTE' }, { screenIds: ['W.LOGIN'] }, { screenIds: [] }, { screenIds: [...family.screens, ...family.screens] }, { catalogRevision: 'stale' }, { revision: -1 }, { choice: 'CUSTOM', note: '' }]) assert.equal(validateAuditChoice({ ...body, ...change }, catalog), null);
});

test('audit choices persist independently, reject stale writes, and cannot execute changes', async () => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'rcs-audit-compare-'));
  const original = Buffer.from('{"schema":1,"revision":9,"decisions":[{"familyId":"VC-B01-ADDRESS","choice":"CUSTOM"}],"history":[]}');
  fs.writeFileSync(path.join(runtime, 'consistency-decisions.json'), original);
  const config = { root: process.cwd(), runtime, port: 0 }, server = http.createServer(viewerHandler(config, { state: {} }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); config.port = server.address().port;
  const base = 'http://127.0.0.1:' + config.port;
  const post = (body, origin = base) => fetch(base + '/api/consistency/audit-decision', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const response = await fetch(base + '/api/consistency/audit'); assert.equal(response.status, 200); const data = await response.json();
    assert.equal(data.families.length, 14); assert.equal(data.registry.revision, 0);
    const family = data.families.find(item => item.id === 'VC-B02-04');
    const body = { familyId: family.id, choice: 'CUSTOM', screenIds: ['W.LOGIN'], note: 'Synthetic review instruction', revision: 0, catalogRevision: data.catalogRevision };
    assert.equal((await post(body, 'https://external.invalid')).status, 403);
    assert.equal((await post({ ...body, note: 'x'.repeat(9000) })).status, 413);
    const saved = await post(body); assert.equal(saved.status, 200); const result = await saved.json();
    assert.equal(result.saved.implementationStatus, 'NOT_CHANGED'); assert.equal(result.saved.aestheticAcceptance, 'NOT_RECORDED'); assert.deepEqual(result.saved.screenIds, ['W.LOGIN']);
    assert.equal((await post(body)).status, 409);
    const after = await (await fetch(base + '/api/consistency/audit')).json();
    assert.equal(after.registry.revision, 1); assert.equal(after.registry.history.length, 1); assert.equal(after.registry.decisions[0].note, body.note);
    assert.deepEqual(fs.readFileSync(path.join(runtime, 'consistency-decisions.json')), original);
    assert.equal((await fetch(base + '/consistency-audit.js')).status, 200);
    assert.equal((await fetch(base + '/consistency-audit/font.woff2')).status, 200);
    assert.equal((await fetch(base + '/consistency-audit/images/login-phone-390-dark.png')).status, 200);
    assert.equal((await fetch(base + '/consistency-audit/images/not-an-image.txt')).status, 404);
    assert.equal((await fetch(base + '/api/consistency/audit', { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const name of ['consistency-decisions.json', 'consistency-audit-decisions.json']) { const file = path.join(runtime, name); if (fs.existsSync(file)) fs.unlinkSync(file); }
    fs.rmdirSync(runtime);
  }
});
