import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Api, normalizeHost, compareRecords, recordsPreserved, identity, emailConflicts, normalizeRoutingDns, mailDnsChecks, saveBackup, redact } from './setup.mjs';
const domain = 'rcstravels.co.in';
const group = (type, name, content, extra = {}) => ({ type, name, ttl: 300, records: [{ content, ...extra }] });

test('read-only client rejects writes before any network request', async () => {
  let called = false;
  const api = new Api({ fetcher: async () => { called = true; } });
  await assert.rejects(api.cf('/zones', 'POST', {}), /Read-only mode blocked/);
  assert.equal(called, false);
});
test('all enabled website and service records are preserved; quoted TXT and MX normalize correctly', () => {
  const records = [group('A', '@', '216.198.79.1'), group('CNAME', 'www', 'vercel.example.'), group('CNAME', 'clerk', 'clerk.example.'), group('TXT', '@', '"first" "second"'), group('MX', '@', '10 mx.example.'), group('AAAA', 'v6', '2001:db8::1')];
  const result = normalizeHost(records, domain);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.required.length, 6);
  assert.equal(result.required.find(r => r.type === 'TXT').content, 'firstsecond');
  assert.equal(result.required.find(r => r.type === 'MX').priority, 10);
  assert.ok(result.required.filter(r => ['A', 'AAAA', 'CNAME'].includes(r.type)).every(r => r.proxied === false));
});
test('disabled records and provider authority are explicitly excluded; unsupported records block migration', () => {
  const result = normalizeHost([group('NS', '@', 'old.example.'), group('A', 'unused', '192.0.2.1', { is_disabled: true }), group('ALIAS', '@', 'example.com')], domain);
  assert.equal(result.excluded.length, 2);
  assert.equal(result.required.length, 0);
  assert.equal(result.blockers.length, 1);
});
test('target conflicts and proxy changes block migration; equivalent records do not duplicate', () => {
  const source = normalizeHost([group('A', '@', '216.198.79.1')], domain).required;
  assert.equal(compareRecords(source, [{ ...source[0] }]).missing.length, 0);
  assert.ok(compareRecords(source, [{ ...source[0], content: '192.0.2.1' }]).blockers.length);
  assert.ok(compareRecords(source, [{ ...source[0], proxied: true }]).blockers.length);
  assert.ok(compareRecords(source, [{ type: 'CNAME', name: domain, content: 'example.com' }]).blockers.length);
});
test('DNS equality preserves TXT case and MX priority but ignores target trailing dots', () => {
  assert.equal(identity({ type: 'CNAME', name: domain, content: 'EXAMPLE.COM.' }), identity({ type: 'CNAME', name: domain, content: 'example.com' }));
  assert.notEqual(identity({ type: 'TXT', name: domain, content: 'ABC' }), identity({ type: 'TXT', name: domain, content: 'abc' }));
  assert.notEqual(identity({ type: 'MX', name: domain, content: 'mx.example', priority: 10 }), identity({ type: 'MX', name: domain, content: 'mx.example', priority: 20 }));
});
test('existing MX/SPF cannot be silently replaced; matching Cloudflare mail records are safe', () => {
  const required = [{ type: 'MX', name: '@', content: 'route1.mx.cloudflare.net', priority: 10 }, { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' }];
  assert.equal(emailConflicts(domain, [], required).length, 0);
  assert.equal(emailConflicts(domain, required.map(r => ({ ...r, name: domain })), required).length, 0);
  assert.equal(emailConflicts(domain, [{ type: 'MX', name: domain, content: 'mx.other.com', priority: 10 }], required).length, 1);
  assert.equal(emailConflicts(domain, [{ type: 'TXT', name: domain, content: 'v=spf1 include:other.com ~all' }], required).length, 1);
});
test('Cloudflare returns quoted SPF/DKIM values which must normalize before checks', () => {
  const records = normalizeRoutingDns([{ type: 'TXT', name: '@', content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' }, { type: 'TXT', name: 'cf2024-1._domainkey', content: '"v=DKIM1; p=abc"' }], domain);
  assert.equal(records[0].name, domain);
  assert.ok(records[0].content.startsWith('v=spf1'));
  assert.equal(records[1].name, 'cf2024-1._domainkey.' + domain);
  assert.equal(records[1].content, 'v=DKIM1; p=abc');
});
test('final preservation audit allows new email TXT records but detects deleted originals and changed proxying', () => {
  const original = normalizeHost([group('TXT', '@', '"google-site-verification=abc"'), group('A', '@', '216.198.79.1')], domain).required;
  const current = [...original, { type: 'TXT', name: domain, content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' }];
  assert.equal(recordsPreserved(original, current), true);
  assert.equal(recordsPreserved(original, current.filter(r => r.type !== 'A')), false);
  assert.equal(recordsPreserved(original, current.map(r => r.type === 'A' ? { ...r, proxied: true } : r)), false);
});
test('DNS checks detect stale NS, missing MX, changed priorities and duplicate SPF records', () => {
  const ns = ['cortney.ns.cloudflare.com', 'dante.ns.cloudflare.com'];
  const mx = ['10 route1.mx.cloudflare.net', '20 route2.mx.cloudflare.net'];
  const spf = ['v=spf1 include:_spf.mx.cloudflare.net ~all'];
  const records = { NS: [...ns].reverse().map(n => n + '.'), MX: [...mx].reverse(), TXT: ['google-site-verification=abc', ...spf] };
  assert.deepEqual(mailDnsChecks(records, ns, mx, spf), { nameservers_correct: true, mx_correct: true, spf_correct: true });
  assert.equal(mailDnsChecks({ ...records, NS: ['aster.dns-parking.com'] }, ns, mx, spf).nameservers_correct, false);
  assert.equal(mailDnsChecks({ ...records, MX: [] }, ns, mx, spf).mx_correct, false);
  assert.equal(mailDnsChecks({ ...records, MX: ['30 route1.mx.cloudflare.net', mx[1]] }, ns, mx, spf).mx_correct, false);
  assert.equal(mailDnsChecks({ ...records, TXT: [...spf, 'v=spf1 ~all'] }, ns, mx, spf).spf_correct, false);
});
test('pagination retrieves every page and read requests never expose API error response content', async () => {
  const prior = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = 'test-secret-for-unit-tests';
  try {
    let count = 0;
    const api = new Api({ fetcher: async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: [{ id: ++count }], result_info: { total_pages: 2 } }) }) });
    assert.equal((await api.list('cloudflare', '/zones')).length, 2);
    const denied = new Api({ fetcher: async () => ({ ok: false, status: 403, json: async () => ({ errors: [{ code: 10000, message: process.env.CLOUDFLARE_API_TOKEN }] }) }) });
    await assert.rejects(denied.cf('/zones'), error => error.message.includes('10000') && !error.message.includes(process.env.CLOUDFLARE_API_TOKEN));
    assert.equal(redact('token=' + process.env.CLOUDFLARE_API_TOKEN), 'token=[REDACTED]');
  } finally { if (prior === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = prior; }
});
test('original DNS backup is immutable across repeated runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rcs-dns-test-'));
  const backup = join(directory, 'dns-backup.json');
  await saveBackup({ domain, marker: 'original' }, backup, directory);
  await new Promise(resolve => setTimeout(resolve, 5));
  await saveBackup({ domain, marker: 'updated' }, backup, directory);
  assert.equal(JSON.parse(await readFile(backup, 'utf8')).marker, 'original');
});
