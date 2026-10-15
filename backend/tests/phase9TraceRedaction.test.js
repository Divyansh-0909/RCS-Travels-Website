import test from 'node:test';
import assert from 'node:assert/strict';
import { redactBrowserTrace } from './helpers/phase9TraceRedaction.js';

test('trace credentials are redacted while decisions, paths and binary screenshots remain exact', () => {
  const token = 'eyJtest_header.test_payload.test_signature';
  const signature = 'a'.repeat(64);
  const source = { '0.network': Buffer.from(JSON.stringify({ headers: [
    { name: 'authorization', value: `Bearer ${token}` }, { name: 'Cookie', value: 'fixture_actor=admin; __session=value' },
    { name: 'set-cookie', value: 'fixture_actor=admin' },
  ], token, payment: { razorpay_signature: signature }, decision: 'NEEDS_ADMIN_REVIEW' })),
  '0.trace': Buffer.from('fixture_actor=customer\n{"name": "fixture_actor", "value": "admin"}\n{"name":"__session","value":"a-session"}\n{"name":"__clerk_db_jwt","value":"a-browser-token"}'),
  'resources/binary': new Uint8Array([0, 255, 128, 3]), 'resources/empty': new Uint8Array() };
  const original = structuredClone(source);
  const result = redactBrowserTrace(source);
  const network = JSON.parse(Buffer.from(result['0.network']).toString());
  assert.deepEqual(network.headers, ['authorization', 'Cookie', 'set-cookie'].map(name => ({ name, value: '[redacted]' })));
  assert.equal(network.token, '[synthetic-session-redacted]');
  assert.equal(network.payment.razorpay_signature, '[synthetic-payment-signature-redacted]');
  assert.equal(network.decision, 'NEEDS_ADMIN_REVIEW');
  assert.equal(Buffer.from(result['0.trace']).toString(), 'fixture_actor=[redacted]\n{"name": "fixture_actor", "value": "[redacted]"}\n{"name":"__session","value":"[redacted]"}\n{"name":"__clerk_db_jwt","value":"[redacted]"}');
  for (const key of Object.keys(source)) assert.deepEqual(new Uint8Array(source[key]), new Uint8Array(original[key]));
  assert.deepEqual(result['resources/binary'], source['resources/binary']);
  assert.deepEqual(result['resources/empty'], source['resources/empty']);
  assert.deepEqual(redactBrowserTrace({}), {});
});

test('trace redaction covers formatted and escaped authentication and payment records', () => {
  const signature = 'b'.repeat(64);
  const formatted = '{ "name" \n : "__session" \n , "value" : "a-session" }';
  const payment = '{"razorpay_signature" \n : \n "' + signature + '"}';
  const escaped = JSON.stringify(payment);
  const result = redactBrowserTrace({ formatted: Buffer.from(formatted), payment: Buffer.from(payment), escaped: Buffer.from(escaped) });
  assert.equal(JSON.parse(Buffer.from(result.formatted).toString()).value, '[redacted]');
  assert.equal(JSON.parse(Buffer.from(result.payment).toString()).razorpay_signature, '[synthetic-payment-signature-redacted]');
  assert.equal(JSON.parse(JSON.parse(Buffer.from(result.escaped).toString())).razorpay_signature, '[synthetic-payment-signature-redacted]');
});
