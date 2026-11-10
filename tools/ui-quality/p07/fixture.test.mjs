import test from 'node:test';
import assert from 'node:assert/strict';
import { cases, responseFor } from './cases.mjs';
const origin = 'http://127.0.0.1:1578';
test('pending and processed fixture responses remain distinct without changing product logic', () => {
  assert.equal(responseFor('refund-pending', 1).body.financials.advanceDisposition, 'refund_pending');
  assert.equal(responseFor('refund-pending', 2).body.financials.advanceDisposition, 'refunded');
  assert.equal(responseFor('partial-refund-pending', 1).body.financials.advanceDisposition, 'partial_refund_pending');
  assert.equal(responseFor('partial-refund-pending', 2).body.financials.advanceDisposition, 'partially_refunded');
  assert.equal(responseFor('hidden-notice', 2).http, 503);
  assert.equal(responseFor('hidden-notice', 3).body.status, 'started');
});
test('read-only review redirects use the finite synthetic case catalogue', async () => {
  const good = await fetch(origin + '/__review/p07?case=completed', { redirect: 'manual' });
  assert.equal(good.status, 302); assert.match(good.headers.get('location'), /^\/booking\/p07-completed--[a-z0-9]+$/);
  for (const bad of ['__proto__', 'constructor', 'https://example.invalid/customer', '../private']) {
    const r = await fetch(origin + '/__review/p07?case=' + encodeURIComponent(bad), { redirect: 'manual' }); assert.equal(r.status, 400);
  }
});
test('all synthetic booking writes are denied and do not change the stable assigned fixture', async () => {
  const before = await fetch(origin + '/api/bookings/p07-assigned--safety/status').then(r => r.json());
  for (const suffix of ['ride-now-final/cash', 'scheduled-final/cash', 'scheduled-advance/order', 'cancel']) {
    const r = await fetch(origin + '/api/bookings/p07-assigned--safety/' + suffix, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(r.status, 409);
  }
  const after = await fetch(origin + '/api/bookings/p07-assigned--safety/status').then(r => r.json()); assert.deepEqual(after, before);
  const unknown = await fetch(origin + '/api/bookings/real-or-unknown-customer/status'); assert.equal(unknown.status, 404);
});
test('served UI intercepts contact navigation and refuses provider frames', async () => {
  const response = await fetch(origin + '/booking/p07-assigned--safety');
  const csp = response.headers.get('content-security-policy'); assert.match(csp, /frame-src 'none'/); assert.match(csp, /connect-src 'self'/);
  for (const file of ['/src/pages/TrackingPage.jsx', '/src/constants/support.js']) {
    const body = await fetch(origin + file).then(r => r.text());
    assert(!body.includes('window.location.href ='));
    assert(body.includes('__p07Intent'));
  }
  assert(Object.keys(cases).length >= 20);
});
