#!/usr/bin/env node
// No dependencies. Run from the repository root with node --env-file=.env.
// Credentials are read exclusively from process.env and never persisted.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { Resolver } from 'node:dns/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = resolve(ROOT, '.dns-email-state');
const BACKUP = resolve(ROOT, 'dns-backup.json');
const DOMAINS = ['rcstravels.co.in', 'rcstravels.com'];
export const DESTINATIONS = {
  business: 'rcstravels.business@gmail.com',
  support: 'rcstravels.support@gmail.com',
};
const BASE = { hostinger: 'https://developers.hostinger.com/api', cloudflare: 'https://api.cloudflare.com/client/v4' };
const SECRET_KEYS = { hostinger: 'HOSTINGER_API_TOKEN', cloudflare: 'CLOUDFLARE_API_TOKEN' };
const DNS_TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, DS: 43, CAA: 257 };
const PROVIDERS = { cloudflare: 'https://cloudflare-dns.com/dns-query', google: 'https://dns.google/resolve' };

export function redact(value) {
  let text = String(value);
  for (const key of Object.values(SECRET_KEYS)) {
    const secret = process.env[key]?.trim();
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text;
}
const json = value => redact(JSON.stringify(value, null, 2)) + '\n';
const log = value => console.log(typeof value === 'string' ? redact(value) : json(value));
const fqdn = value => String(value).toLowerCase().replace(/\.$/, '');
export function owner(name, domain) {
  if (name === '@' || name === '' || name === domain) return domain;
  const n = fqdn(name);
  if (n.endsWith('.' + domain)) return n;
  if (String(name).endsWith('.')) throw new Error('DNS owner is outside the domain: ' + n);
  return n + '.' + domain;
}
export function txtContent(value) {
  const text = String(value);
  if (!text.startsWith('"')) return text;
  const chunks = text.match(/"(?:[^"\\]|\\.)*"/g);
  if (!chunks || text.replace(/"(?:[^"\\]|\\.)*"/g, '').trim()) throw new Error('Ambiguous quoted TXT record');
  return chunks.map(chunk => JSON.parse(chunk)).join('');
}
export function identity(record) {
  let content = record.content;
  if (['CNAME', 'MX', 'NS', 'PTR'].includes(record.type)) content = fqdn(content);
  if (record.type === 'TXT') content = txtContent(content);
  let data;
  if (record.type === 'CAA') data = [Number(record.data?.flags), record.data?.tag, record.data?.value];
  if (record.type === 'SRV') data = [Number(record.data?.priority), Number(record.data?.weight), Number(record.data?.port), fqdn(record.data?.target)];
  return JSON.stringify([record.type, fqdn(record.name), data ?? content, record.type === 'MX' ? Number(record.priority) : null]);
}
export function normalizeHost(records, domain) {
  if (!Array.isArray(records)) throw new Error('Unexpected Hostinger DNS response; refusing partial import');
  const required = [], excluded = [], blockers = [];
  for (const group of records) {
    if (!Array.isArray(group.records)) { blockers.push('Missing records array for ' + group.name); continue; }
    for (const item of group.records) {
      if (item.is_disabled) { excluded.push({ ...group, records: [item], reason: 'disabled in Hostinger' }); continue; }
      try {
        const type = String(group.type).toUpperCase(), name = owner(group.name, domain);
        if (type === 'SOA' || (type === 'NS' && name === domain)) {
          excluded.push({ type, name, content: item.content, reason: 'provider-generated zone authority/delegation' }); continue;
        }
        if (!['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA', 'NS', 'PTR', 'SRV'].includes(type)) throw new Error('Unsupported record type ' + type);
        const ttl = Number(group.ttl);
        if (!Number.isInteger(ttl) || (ttl !== 1 && (ttl < 60 || ttl > 86400))) throw new Error('Unsupported TTL ' + group.ttl);
        if (typeof item.content !== 'string' || !item.content.length) throw new Error('Missing DNS content');
        const record = { type, name, ttl, content: item.content };
        if (['A', 'AAAA', 'CNAME'].includes(type)) record.proxied = false;
        if (type === 'TXT') record.content = txtContent(record.content);
        if (['CNAME', 'NS', 'PTR'].includes(type)) record.content = fqdn(record.content);
        if (type === 'MX') {
          const match = record.content.match(/^(\d+)\s+(\S+)\s*$/);
          if (!match) throw new Error('MX content must contain priority and target');
          record.priority = Number(match[1]); record.content = fqdn(match[2]);
        }
        if (type === 'CAA') {
          const match = record.content.match(/^(\d+)\s+(\S+)\s+"(.*)"$/);
          if (!match) throw new Error('Unsupported CAA format');
          record.data = { flags: Number(match[1]), tag: match[2], value: match[3] }; delete record.content;
        }
        if (type === 'SRV') {
          const match = record.content.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/);
          if (!match) throw new Error('Unsupported SRV format');
          record.data = { priority: Number(match[1]), weight: Number(match[2]), port: Number(match[3]), target: fqdn(match[4]) }; delete record.content;
        }
        if (!required.some(r => identity(r) === identity(record))) required.push(record);
      } catch (error) { blockers.push(group.type + ' ' + group.name + ': ' + error.message); }
    }
  }
  return { required, excluded, blockers };
}
export function compareRecords(required, current) {
  const missing = [], blockers = [];
  for (const record of required) {
    const atName = current.filter(r => fqdn(r.name) === fqdn(record.name));
    const group = atName.filter(r => r.type === record.type);
    if (atName.some(r => (r.type === 'CNAME' || record.type === 'CNAME') && r.type !== record.type && r.type !== 'NS')) blockers.push('CNAME conflict at ' + record.name);
    if (group.some(r => !required.some(s => identity(s) === identity(r)))) blockers.push('Different existing Cloudflare ' + record.type + ' record at ' + record.name);
    const equivalent = group.find(r => identity(r) === identity(record));
    if (!equivalent) missing.push(record);
    else if (equivalent.proxied) blockers.push('Existing Cloudflare proxy changes website behavior at ' + record.name);
  }
  return { missing, blockers: [...new Set(blockers)] };
}
export function recordsPreserved(original, current) {
  return original.every(record => current.some(candidate => identity(candidate) === identity(record) && (!['A', 'AAAA', 'CNAME'].includes(record.type) || candidate.proxied !== true)));
}

export class Api {
  constructor({ allowWrites = false, fetcher = fetch } = {}) { this.allowWrites = allowWrites; this.fetcher = fetcher; }
  async request(service, path, method = 'GET', body, { allow404 = false } = {}) {
    if (method !== 'GET' && !this.allowWrites) throw new Error('Read-only mode blocked ' + method + ' ' + path);
    const token = process.env[SECRET_KEYS[service]]?.trim();
    if (!token) throw new Error('Missing environment variable ' + SECRET_KEYS[service]);
    let response;
    try {
      response = await this.fetcher(BASE[service] + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error(service + ' ' + method + ' ' + path + ': network request failed; inspect live state before retrying writes'); }
    if (allow404 && response.status === 404) return null;
    let data;
    try { data = await response.json(); } catch { throw new Error(service + ': non-JSON response (HTTP ' + response.status + ')'); }
    if (!response.ok || data.success === false) {
      // Never log raw response bodies or request headers.
      const codes = (data.errors ?? []).map(e => e.code).filter(Boolean).join(',');
      throw new Error(service + ' ' + method + ' ' + path + ': HTTP ' + response.status + (codes ? ' (error codes ' + codes + ')' : ''));
    }
    return data;
  }
  async list(service, path) {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const data = await this.request(service, path + separator + 'per_page=100&page=' + page);
      const rows = service === 'cloudflare' ? data.result : Array.isArray(data) ? data : data.data;
      if (!Array.isArray(rows)) throw new Error('Unexpected paginated response for ' + path);
      all.push(...rows);
      const info = data.result_info ?? data.meta;
      if (info?.total_pages != null || info?.last_page != null) {
        if (page >= Number(info.total_pages ?? info.last_page)) return all;
      } else if (info?.total_count != null) {
        if (all.length >= Number(info.total_count)) return all;
      } else if (service === 'hostinger' && Array.isArray(data)) return all;
      else if (rows.length < 100) return all;
    }
    throw new Error('Pagination safety limit reached for ' + path);
  }
  async cf(path, method = 'GET', body, options) { return (await this.request('cloudflare', path, method, body, options))?.result ?? null; }
  async host(path, method = 'GET', body) { const data = await this.request('hostinger', path, method, body); return data.data ?? data; }
}

async function dns(name, type, provider) {
  const url = new URL(PROVIDERS[provider]); url.searchParams.set('name', name); url.searchParams.set('type', DNS_TYPES[type] ?? type);
  const response = await fetch(url, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error('Public DNS request failed: ' + provider);
  const data = await response.json();
  if (![0, 3].includes(data.Status)) throw new Error('Public DNS status ' + data.Status + ' for ' + name + ' ' + type);
  return { status: data.Status, answers: (data.Answer ?? []).filter(a => a.type === Number(DNS_TYPES[type] ?? type)), authority: data.Authority ?? [] };
}
async function publicDns(domain) {
  const entries = await Promise.all(Object.keys(PROVIDERS).map(async provider => {
    const rows = await Promise.all(['NS', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'DS'].map(async type => [type, await dns(domain, type, provider)]));
    return [provider, Object.fromEntries(rows)];
  }));
  return Object.fromEntries(entries);
}
const sameSet = (a, b) => JSON.stringify([...new Set(a.map(fqdn))].sort()) === JSON.stringify([...new Set(b.map(fqdn))].sort());
export function mailDnsChecks(records, nameservers, expectedMx, expectedSpf) {
  return {
    nameservers_correct: sameSet(records.NS, nameservers),
    mx_correct: sameSet(records.MX, expectedMx),
    spf_correct: records.TXT.filter(value => txtContent(value).startsWith('v=spf1')).length === 1 && expectedSpf.every(value => records.TXT.some(actual => txtContent(actual) === value)),
  };
}
async function authoritativeDns(domain, nameservers) {
  return Object.fromEntries(await Promise.all(nameservers.map(async nameserver => {
    const addresses = await dns(nameserver, 'A', 'google');
    const ip = addresses.answers[0]?.data;
    if (!ip) throw new Error('Cannot resolve authoritative nameserver ' + nameserver);
    const resolver = new Resolver({ timeout: 4000, tries: 2 }); resolver.setServers([ip]);
    const [NS, MX, TXT] = await Promise.all([resolver.resolveNs(domain), resolver.resolveMx(domain), resolver.resolveTxt(domain)]);
    return [nameserver, { ip, NS, MX: MX.map(record => record.priority + ' ' + fqdn(record.exchange)), TXT: TXT.map(chunks => chunks.join('')) }];
  })));
}
const registrarNs = details => Array.isArray(details.name_servers) ? details.name_servers.map(fqdn) : Object.values(details.name_servers ?? {}).filter(Boolean).map(fqdn);
const zoneSummary = zone => zone ? { id: zone.id, name: zone.name, status: zone.status, type: zone.type, account: zone.account, name_servers: zone.name_servers, plan: zone.plan } : null;

export async function saveBackup(snapshot, backupPath = BACKUP, statePath = STATE) {
  await mkdir(statePath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = resolve(statePath, 'dns-' + stamp + '.json');
  await writeFile(snapshotPath, json(snapshot), { flag: 'wx', mode: 0o600 });
  try { await writeFile(backupPath, json(snapshot), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(backupPath, 'utf8'));
    if (existing.domain !== snapshot.domain) throw new Error('Existing dns-backup.json belongs to another domain');
  }
  return snapshotPath;
}
async function report(name, value) {
  await mkdir(STATE, { recursive: true });
  await writeFile(resolve(STATE, name + '.json'), json(value), { mode: 0o600 });
}
function assertSafe(blockers) { if (blockers.length) throw new Error('Validation blocked changes:\n' + blockers.map(b => '- ' + b).join('\n')); }

async function inspect(api) {
  const portfolio = await api.list('hostinger', '/domains/v1/portfolio');
  const domain = DOMAINS.find(d => portfolio.some(p => fqdn(p.domain) === d));
  if (!domain) throw new Error('Neither requested domain is owned by this Hostinger account; no domain will be purchased');
  const details = await api.host('/domains/v1/portfolio/' + domain);
  if (fqdn(details.domain) !== domain || String(details.status).toLowerCase() !== 'active') throw new Error('Hostinger domain ownership/status could not be validated');
  const hostRecords = await api.host('/dns/v1/zones/' + domain);
  const zones = await api.list('cloudflare', '/zones?name=' + domain);
  if (zones.length > 1) throw new Error('Multiple Cloudflare zones found; account selection is required');
  const zone = zones[0] ? await api.cf('/zones/' + zones[0].id) : null;
  const cloudflareRecords = zone ? await api.list('cloudflare', '/zones/' + zone.id + '/dns_records') : [];
  const publicRecords = await publicDns(domain);
  const snapshot = {
    captured_at: new Date().toISOString(), domain,
    hostinger: { domain: details.domain, status: details.status, name_servers: details.name_servers, dns_records: hostRecords },
    cloudflare: { zone: zoneSummary(zone), dns_records: cloudflareRecords }, public_dns: publicRecords,
  };
  const snapshotPath = await saveBackup(snapshot);
  const normalized = normalizeHost(hostRecords, domain);
  const ns = registrarNs(details), blockers = [...normalized.blockers];
  const delegatedToCloudflare = Boolean(zone && sameSet(ns, zone.name_servers));
  const alreadyCloudflare = zone?.status === 'active' && delegatedToCloudflare;
  if (zone && zone.type !== 'full') blockers.push('Cloudflare zone is not a full DNS zone');
  if (!ns.length) blockers.push('Hostinger did not return registrar nameservers');
  if (!delegatedToCloudflare && !ns.every(n => n.endsWith('.dns-parking.com'))) blockers.push('Current DNS provider is not Hostinger; Hostinger records may be stale');
  for (const [provider, publicData] of Object.entries(publicRecords)) {
    if (!delegatedToCloudflare && !sameSet(publicData.NS.answers.map(a => a.data), ns)) blockers.push(provider + ': public nameservers differ from Hostinger; propagation must finish before changes');
    if (!alreadyCloudflare && publicData.DS.answers.length) blockers.push(provider + ': DNSSEC DS exists; disable old DNSSEC and wait for DS removal before migration');
  }
  // After migration Cloudflare is authoritative; never re-import stale Hostinger mail records.
  const required = alreadyCloudflare ? cloudflareRecords : normalized.required;
  if (!required.some(r => ['A', 'AAAA', 'CNAME'].includes(r.type))) blockers.push('No website address records found');
  const comparison = compareRecords(required, cloudflareRecords);
  if (!alreadyCloudflare) blockers.push(...comparison.blockers);
  const accounts = zone ? [zone.account] : await api.list('cloudflare', '/accounts');
  if (accounts.length !== 1) blockers.push('Expected exactly one accessible Cloudflare account');
  const accountId = zone?.account?.id ?? accounts[0]?.id;
  let email = null;
  if (zone) {
    email = {
      settings: await api.cf('/zones/' + zone.id + '/email/routing', 'GET', undefined, { allow404: true }),
      required_dns: await api.cf('/zones/' + zone.id + '/email/routing/dns', 'GET', undefined, { allow404: true }),
      rules: await api.list('cloudflare', '/zones/' + zone.id + '/email/routing/rules'),
      catch_all: await api.cf('/zones/' + zone.id + '/email/routing/rules/catch_all', 'GET', undefined, { allow404: true }),
    };
    if (email.catch_all?.enabled) blockers.push('An existing catch-all is enabled; review is needed');
  }
  const destinations = accountId ? await api.list('cloudflare', '/accounts/' + accountId + '/email/routing/addresses') : [];
  const plan = {
    domain, account_id: accountId, backup: BACKUP, snapshot: snapshotPath,
    current_nameservers: ns, cloudflare_zone: zoneSummary(zone), cloudflare_nameservers: zone?.name_servers ?? [],
    existing_dns_records: hostRecords, cloudflare_dns_records: cloudflareRecords,
    records_to_copy: alreadyCloudflare ? [] : comparison.missing, excluded_records: normalized.excluded,
    website_records: required.filter(r => ['A', 'AAAA', 'CNAME', 'CAA'].includes(r.type)),
    email, destinations: Object.values(DESTINATIONS).map(address => ({ address, verified: Boolean(destinations.find(d => d.email?.toLowerCase() === address)?.verified) })),
    proposed_changes: [
      ...(!zone ? ['Create a full Cloudflare zone on the Free plan'] : []),
      ...(!alreadyCloudflare ? ['Copy all required DNS records with proxying disabled; validate complete equivalence', 'Set Hostinger nameservers to the two Cloudflare-assigned nameservers', 'Poll Cloudflare activation and public nameservers'] : []),
      'Add/lock the API-provided Email Routing MX/SPF/DKIM records after checking for conflicts',
      'Register both Gmail destinations; stop until both are verified',
      ...Object.entries(DESTINATIONS).map(([local, target]) => local + '@' + domain + ' -> ' + target),
      'Keep catch-all disabled; verify DNS and both enabled routing rules',
    ], blockers: [...new Set(blockers)],
  };
  await report('plan', plan); log(plan);
  return { domain, details, zone, accountId, required, plan, snapshot, alreadyCloudflare };
}

async function prepare(api, state) {
  assertSafe(state.plan.blockers);
  let zone = state.zone;
  if (!zone) {
    zone = await api.cf('/zones', 'POST', { name: state.domain, account: { id: state.accountId }, type: 'full' });
    log('Created Cloudflare zone; assigned nameservers: ' + zone.name_servers.join(', '));
  }
  if (Number(zone.plan?.price ?? 0) !== 0) throw new Error('Zone is not on the Free plan');
  if (!Array.isArray(zone.name_servers) || zone.name_servers.length !== 2) throw new Error('Expected two Cloudflare nameservers');
  if (state.alreadyCloudflare) return zone;
  let current = await api.list('cloudflare', '/zones/' + zone.id + '/dns_records');
  await saveBackup({ ...state.snapshot, cloudflare: { zone: zoneSummary(zone), dns_records: current } });
  let comparison = compareRecords(state.required, current); assertSafe(comparison.blockers);
  for (const record of comparison.missing) {
    await api.cf('/zones/' + zone.id + '/dns_records', 'POST', record);
    log('Copied ' + record.type + ' ' + record.name);
  }
  current = await api.list('cloudflare', '/zones/' + zone.id + '/dns_records');
  comparison = compareRecords(state.required, current);
  assertSafe([...comparison.blockers, ...(comparison.missing.length ? ['Cloudflare is still missing required DNS records'] : [])]);
  await report('prepared', { domain: state.domain, zone: zoneSummary(zone), dns_records: current, required: state.required });
  log('Validated all required DNS records in Cloudflare. Hostinger nameservers have not been changed by prepare.');
  return zone;
}
async function migrate(api, state, zone, waitSeconds) {
  // Re-fetch registrar, source DNS, target DNS and DNSSEC immediately before the switch.
  const details = await api.host('/domains/v1/portfolio/' + state.domain);
  const ns = registrarNs(details);
  if (!sameSet(ns, zone.name_servers)) {
    if (!sameSet(ns, registrarNs(state.details))) throw new Error('Registrar nameservers changed since inspection');
    const source = await api.host('/dns/v1/zones/' + state.domain);
    if (JSON.stringify(source) !== JSON.stringify(state.snapshot.hostinger.dns_records)) throw new Error('Hostinger DNS changed since inspection; re-run plan');
    const current = await api.list('cloudflare', '/zones/' + zone.id + '/dns_records');
    const comparison = compareRecords(state.required, current);
    assertSafe([...comparison.blockers, ...(comparison.missing.length ? ['Target DNS is incomplete'] : [])]);
    const publicRecords = await publicDns(state.domain);
    for (const [provider, data] of Object.entries(publicRecords)) {
      if (data.DS.answers.length || !sameSet(data.NS.answers.map(a => a.data), ns)) throw new Error(provider + ': delegation/DNSSEC changed since inspection');
    }
    await saveBackup({ ...state.snapshot, hostinger: { ...state.snapshot.hostinger, name_servers: details.name_servers, dns_records: source }, cloudflare: { zone: zoneSummary(zone), dns_records: current }, public_dns: publicRecords });
    await api.host('/domains/v1/portfolio/' + state.domain + '/nameservers', 'PUT', { ns1: zone.name_servers[0], ns2: zone.name_servers[1] });
    await report('migration', { changed_at: new Date().toISOString(), domain: state.domain, old_nameservers: ns, new_nameservers: zone.name_servers, zone_id: zone.id });
    log('Hostinger accepted the Cloudflare nameservers. Waiting for activation and public DNS propagation.');
    await api.cf('/zones/' + zone.id + '/activation_check', 'PUT');
  }
  const deadline = Date.now() + waitSeconds * 1000;
  do {
    zone = await api.cf('/zones/' + zone.id);
    const checks = await publicDns(state.domain);
    const propagated = Object.values(checks).every(data => sameSet(data.NS.answers.map(a => a.data), zone.name_servers));
    const registrar = await api.host('/domains/v1/portfolio/' + state.domain);
    log({ zone_status: zone.status, registrar_nameservers: registrarNs(registrar), public_nameservers: Object.fromEntries(Object.entries(checks).map(([p, data]) => [p, data.NS.answers.map(a => a.data)])) });
    if (zone.status === 'active' && sameSet(registrarNs(registrar), zone.name_servers)) {
      if (!propagated) log('Cloudflare is active; cached public NS responses will be checked again during final verification.');
      return zone;
    }
    if (Date.now() >= deadline) break;
    await delay(Math.min(20000, Math.max(1, deadline - Date.now())));
  } while (Date.now() <= deadline);
  throw new Error('Nameservers were submitted but DNS propagation is pending. Re-run --mode apply after propagation; no rollback was attempted.');
}

export function emailConflicts(domain, current, required) {
  const blockers = [];
  for (const record of current) {
    const mail = record.type === 'MX' && fqdn(record.name) === domain;
    const spf = record.type === 'TXT' && fqdn(record.name) === domain && txtContent(record.content).startsWith('v=spf1');
    if ((mail || spf) && !required.some(r => identity({ ...r, name: owner(r.name ?? '@', domain) }) === identity(record))) blockers.push('Existing mail/SPF conflicts with Cloudflare: ' + record.type + ' ' + record.name);
  }
  for (const requiredRecord of required) {
    const r = { ...requiredRecord, name: owner(requiredRecord.name ?? '@', domain) };
    if (r.type === 'TXT' && r.name !== domain && current.some(c => c.type === 'TXT' && fqdn(c.name) === r.name && identity(c) !== identity(r))) blockers.push('Existing DKIM record conflicts at ' + r.name);
  }
  return blockers;
}
export function normalizeRoutingDns(records, domain) {
  if (!Array.isArray(records)) throw new Error('Unexpected Email Routing DNS response');
  return records.map(record => ({ ...record, name: owner(record.name ?? '@', domain), ...(record.type === 'TXT' ? { content: txtContent(record.content) } : {}) }));
}
const matchingRules = (rules, address) => rules.filter(r => r.matchers?.some(m => m.type === 'literal' && m.field === 'to' && m.value?.toLowerCase() === address));
const correctRule = (rule, address, target) => rule.enabled === true && rule.matchers?.length === 1 && rule.matchers[0].type === 'literal' && rule.matchers[0].field === 'to' && rule.matchers[0].value?.toLowerCase() === address && rule.actions?.length === 1 && rule.actions[0].type === 'forward' && rule.actions[0].value?.length === 1 && rule.actions[0].value[0]?.toLowerCase() === target;
async function enableEmail(api, state, zone) {
  if (zone.status !== 'active') throw new Error('Email Routing requires an active Cloudflare zone');
  const z = '/zones/' + zone.id;
  const current = await api.list('cloudflare', z + '/dns_records');
  const required = normalizeRoutingDns(await api.cf(z + '/email/routing/dns'), state.domain);
  if (!Array.isArray(required) || !required.some(r => r.type === 'MX') || !required.some(r => r.type === 'TXT' && r.content?.startsWith('v=spf1'))) throw new Error('Incomplete Email Routing DNS specification');
  const settings = await api.cf(z + '/email/routing');
  const rules = await api.list('cloudflare', z + '/email/routing/rules');
  const catchAll = await api.cf(z + '/email/routing/rules/catch_all');
  if (catchAll?.enabled) throw new Error('Catch-all is already enabled; review required');
  for (const [local, target] of Object.entries(DESTINATIONS)) {
    const address = local + '@' + state.domain;
    const existing = matchingRules(rules, address);
    if (existing.length && (existing.length !== 1 || !correctRule(existing[0], address, target))) throw new Error('Existing routing rule conflicts at ' + address);
  }
  assertSafe(emailConflicts(state.domain, current, required));
  await saveBackup({ ...state.snapshot, cloudflare: { zone: zoneSummary(zone), dns_records: current }, email: { settings, required_dns: required, rules, catch_all: catchAll } });
  await report('email-plan', { domain: state.domain, required_dns: required, destinations: DESTINATIONS, catch_all: catchAll, blockers: [] });
  log({ email_dns_to_enable: required, routes: DESTINATIONS });
  if (!settings.enabled || settings.status !== 'ready') {
    await api.cf(z + '/email/routing/dns', 'POST');
    log('Enabled Email Routing and its required MX/SPF/DKIM DNS records.');
  }
  const account = '/accounts/' + zone.account.id + '/email/routing/addresses';
  let addresses = await api.list('cloudflare', account);
  for (const target of Object.values(DESTINATIONS)) {
    if (!addresses.some(a => a.email?.toLowerCase() === target)) {
      await api.cf(account, 'POST', { email: target }); log('Registered destination ' + target);
    }
  }
  addresses = await api.list('cloudflare', account);
  const pending = Object.values(DESTINATIONS).filter(target => !addresses.find(a => a.email?.toLowerCase() === target)?.verified);
  if (pending.length) {
    const status = { status: 'awaiting_destination_verification', domain: state.domain, pending_destinations: pending, action: 'Open the Cloudflare verification email in each listed Gmail inbox, click Verify email address, then re-run --mode apply. No forwarding rules have been created yet.' };
    await report('status', status); log(status); return false;
  }
  for (const [local, target] of Object.entries(DESTINATIONS)) {
    const address = local + '@' + state.domain;
    if (matchingRules(rules, address).length) continue;
    await api.cf(z + '/email/routing/rules', 'POST', {
      name: 'RCS Travels ' + local, enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: address }], actions: [{ type: 'forward', value: [target] }],
    }); log('Created ' + address + ' -> ' + target);
  }
  return true;
}
async function verify(api, state, zone) {
  zone = await api.cf('/zones/' + zone.id);
  const details = await api.host('/domains/v1/portfolio/' + state.domain);
  const z = '/zones/' + zone.id;
  const settings = await api.cf(z + '/email/routing');
  const current = await api.list('cloudflare', z + '/dns_records');
  const required = await api.cf(z + '/email/routing/dns');
  const rules = await api.list('cloudflare', z + '/email/routing/rules');
  const catchAll = await api.cf(z + '/email/routing/rules/catch_all');
  const publicRecords = await publicDns(state.domain);
  const normalizedRequired = normalizeRoutingDns(required, state.domain);
  const expectedMx = normalizedRequired.filter(r => r.type === 'MX').map(r => r.priority + ' ' + fqdn(r.content));
  const expectedSpf = normalizedRequired.filter(r => r.type === 'TXT' && r.content?.startsWith('v=spf1')).map(r => r.content);
  const authoritativeRecords = await authoritativeDns(state.domain, zone.name_servers);
  const baseline = JSON.parse(await readFile(BACKUP, 'utf8'));
  const original = normalizeHost(baseline.hostinger.dns_records, state.domain);
  const preserved = original.required.filter(r => !(r.type === 'MX' && r.name === state.domain) && !(r.type === 'TXT' && r.name === state.domain && r.content?.startsWith('v=spf1')));
  const checks = {
    zone_active: zone.status === 'active', registrar_nameservers_correct: sameSet(registrarNs(details), zone.name_servers),
    routing_enabled: settings.enabled === true && settings.status === 'ready', catch_all_disabled: catchAll?.enabled === false,
    original_records_preserved: recordsPreserved(preserved, current),
    routing_dns_in_cloudflare: normalizedRequired.every(r => current.some(c => identity(c) === identity(r))),
    routes: Object.fromEntries(Object.entries(DESTINATIONS).map(([local, target]) => {
      const address = local + '@' + state.domain, existing = matchingRules(rules, address);
      return [address, existing.length === 1 && correctRule(existing[0], address, target)];
    })),
    authoritative_dns: Object.fromEntries(Object.entries(authoritativeRecords).map(([nameserver, data]) => [nameserver, mailDnsChecks(data, zone.name_servers, expectedMx, expectedSpf)])),
    public_dns: Object.fromEntries(Object.entries(publicRecords).map(([provider, data]) => [provider, mailDnsChecks({ NS: data.NS.answers.map(a => a.data), MX: data.MX.answers.map(a => a.data), TXT: data.TXT.answers.map(a => a.data) }, zone.name_servers, expectedMx, expectedSpf)])),
  };
  const configurationComplete = Object.values(checks).filter(v => typeof v === 'boolean').every(Boolean) && Object.values(checks.routes).every(Boolean) && Object.values(checks.authoritative_dns).every(c => Object.values(c).every(Boolean));
  const propagated = Object.values(checks.public_dns).every(c => Object.values(c).every(Boolean));
  const complete = configurationComplete && propagated;
  await report('verification', { domain: state.domain, complete, configuration_complete: configurationComplete, public_dns_propagated: propagated, checks, zone: zoneSummary(zone), settings, rules, catch_all: catchAll, authoritative_dns: authoritativeRecords, public_dns: publicRecords });
  await report('status', { status: complete ? 'complete' : configurationComplete ? 'configured_waiting_for_public_dns_caches' : 'verification_failed', domain: state.domain, configuration_complete: configurationComplete, public_dns_propagated: propagated });
  log({ domain: state.domain, complete, configuration_complete: configurationComplete, public_dns_propagated: propagated, checks });
  if (!complete) throw new Error('Configuration or public propagation is not fully verified; see .dns-email-state/verification.json');
}

export async function main() {
  const { values } = parseArgs({ options: { mode: { type: 'string', default: 'plan' }, 'wait-seconds': { type: 'string', default: '300' }, help: { type: 'boolean', default: false } }, strict: true });
  if (values.help) {
    log('Run from project root: node --env-file=.env tools/domain-email/setup.mjs --mode plan|prepare|migrate|email|verify|apply [--wait-seconds 300]\nplan is read-only; prepare adds zone/DNS without switching nameservers; apply validates before writes and stops for Gmail verification. Backups are local and git-ignored.'); return;
  }
  if (!['plan', 'prepare', 'migrate', 'email', 'verify', 'apply'].includes(values.mode)) throw new Error('Invalid mode');
  const waitSeconds = Number(values['wait-seconds']);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 3600) throw new Error('wait-seconds must be between 0 and 3600');
  for (const key of Object.values(SECRET_KEYS)) if (!process.env[key]?.trim()) throw new Error('Missing environment variable ' + key);
  // Inspection uses a separate client that cannot perform writes, in every mode.
  const state = await inspect(new Api());
  if (values.mode === 'plan') return;
  assertSafe(state.plan.blockers);
  const api = new Api({ allowWrites: true });
  let zone = state.zone;
  if (['prepare', 'migrate', 'apply'].includes(values.mode)) zone = await prepare(api, state);
  if (values.mode === 'prepare') return;
  if (!zone) throw new Error('No Cloudflare zone; run --mode prepare first');
  if (['migrate', 'apply'].includes(values.mode)) zone = await migrate(api, state, zone, waitSeconds);
  if (values.mode === 'migrate') return;
  if (['email', 'apply'].includes(values.mode)) {
    if (!(await enableEmail(api, state, zone))) { process.exitCode = 2; return; }
  }
  await verify(new Api(), state, zone);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
}
