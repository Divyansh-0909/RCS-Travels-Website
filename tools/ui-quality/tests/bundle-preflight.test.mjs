import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchNativeBundle } from '../../phase9-native/bundle-preflight.mjs';

async function fixture(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}/index.bundle`;
}
test('waits for delayed Metro headers and retains error status/body for diagnostics', async t => {
  const url = await fixture(t, (_req, res) => setTimeout(() => { res.writeHead(500); res.end('synthetic Metro compile failure'); }, 70));
  const result = await fetchNativeBundle(url, { timeoutMs: 1000 });
  assert.equal(result.status, 500); assert.equal(result.ok, false); assert.equal(await result.text(), 'synthetic Metro compile failure');
});
test('a stalled Metro response aborts at the configured overall deadline', async t => {
  const url = await fixture(t, () => {});
  await assert.rejects(fetchNativeBundle(url, { timeoutMs: 60 }), /deadline exceeded/);
});
test('an oversized bundle and an interrupted response cannot pass preflight', async t => {
  const large = await fixture(t, (_req, res) => res.end('too large for this fixture'));
  await assert.rejects(fetchNativeBundle(large, { maxBytes: 4 }), /size bound/);
  const interrupted = await fixture(t, (_req, res) => { res.writeHead(200, { 'Content-Length': '100' }); res.write('partial'); setTimeout(() => res.destroy(), 20); });
  await assert.rejects(fetchNativeBundle(interrupted), /interrupted|aborted|reset|closed/i);
});
test('only loopback URLs and bounded deadlines are accepted', () => {
  assert.throws(() => fetchNativeBundle('https://example.test/index.bundle'), /loopback/);
  assert.throws(() => fetchNativeBundle('http://127.0.0.1/x', { timeoutMs: 600001 }), /deadline/);
});
