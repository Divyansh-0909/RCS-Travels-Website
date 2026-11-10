import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureNativePreviewForwards, nativePreviewHealth } from './helpers/phase9NativePreviewHealth.mjs';
function device(initial = []) {
  const bindings = [...initial], writes = [];
  return { writes, adb: async (...args) => {
    if (args.join(' ') === 'reverse --list') return bindings.map(([a, b]) => `UsbFfs ${a} ${b}`).join('\n');
    writes.push(args); bindings.push(args.slice(-2)); return '';
  } };
}
test('lost USB mappings are restored without touching unrelated mappings', async () => {
  const d = device([['tcp:9999', 'tcp:8888']]);
  assert.equal(await ensureNativePreviewForwards(d, [12000, 12001]), 2);
  assert.deepEqual(d.writes, [['reverse', '--no-rebind', 'tcp:12000', 'tcp:12000'], ['reverse', '--no-rebind', 'tcp:12001', 'tcp:12001']]);
  assert.equal(await ensureNativePreviewForwards(d, [12000, 12001]), 0);
  assert.equal(d.writes.length, 2);
});
test('conflicting mapping fails before any recovery mutation', async () => {
  const d = device([['tcp:12001', 'tcp:14000']]);
  await assert.rejects(ensureNativePreviewForwards(d, [12000, 12001]), /conflicting/);
  assert.deepEqual(d.writes, []);
});
test('preview needs both Metro and the isolated gateway, not Metro alone', async () => {
  const native = { device: device(), launchUrl: 'rcsphase9://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A12000', gateway: { url: 'http://127.0.0.1:12001' } };
  const request = async url => url.pathname === '/status' ? new Response('packager-status:running') : Response.json({ mode: 'isolated-phase9', production: false });
  assert.equal((await nativePreviewHealth(native, request)).healthy, true);
  assert.equal((await nativePreviewHealth(native, async url => url.pathname === '/status' ? request(url) : new Response('', { status: 502 }))).healthy, false);
  await assert.rejects(nativePreviewHealth({ ...native, gateway: { url: 'https://example.com:443' } }, request), /owned loopback/);
});
