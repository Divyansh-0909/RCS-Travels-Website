import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';

// Only documented, read-only model discovery. This script never invokes inference,
// credits activation, billing mutations, API-key creation, or account provisioning.
const root = new URL('../../', import.meta.url), out = new URL('output/search-v1-b1-comparison-2026-11-01/', root);
let fileEnv = {};
try { fileEnv = parse(await readFile(new URL('backend/.env', root))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const env = { ...fileEnv, ...process.env };
const report = { checkedAt: new Date().toISOString(), inferenceCalls: 0, additionalChargeUsd: 0,
  credentialPresence: Object.fromEntries(['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_AUTH_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
    .map(name => [name, Boolean(env[name])])), providers: {} };
for (const [provider, variable, url] of [
  ['jev', 'TYPESAFE_API_KEY', 'https://api.typesafe.ai/v1/models'],
  ['decisions', 'OPENAI_API_KEY', 'https://api.openai.com/v1/models/gpt-6-luna'],
]) {
  const entry = { credentialsAvailable: Boolean(env[variable]), modelDiscovery: 'NOT_RUN', noAdditionalChargeAllocation: 'UNKNOWN',
    applicableAccountRateLimit: 'UNKNOWN', inferenceAccess: 'NOT_VERIFIED', billingMutations: 0 };
  if (env[variable]) {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${env[variable]}` } });
      entry.httpStatus = response.status;
      entry.modelDiscovery = response.ok ? 'READ_ONLY_DISCOVERY_SUCCEEDED' : response.status === 429 ? 'RATE_LIMIT' : response.status === 401 || response.status === 403 ? 'AUTH_OR_ACCESS' : 'UNAVAILABLE';
      if (response.ok) {
        const body = await response.json();
        const names = provider === 'jev' ? body.models?.map(item => item.name) : [body.id];
        entry.documentedTargetListed = names?.some(name => provider === 'jev' ? ['jev-latest', 'jev-1.14.0'].includes(name) : name === 'gpt-6-luna') ?? false;
      }
    } catch { entry.modelDiscovery = 'TRANSPORT_OR_TIMEOUT'; }
  }
  report.providers[provider] = entry;
}
for (const provider of ['clefFlash', 'clef']) report.providers[provider] = {
  credentialsAvailable: Boolean((env.CLOUDFLARE_API_TOKEN ?? env.CLOUDFLARE_AUTH_TOKEN) && env.CLOUDFLARE_ACCOUNT_ID),
  modelDiscovery: 'NOT_RUN', inferenceAccess: 'NOT_VERIFIED', remainingDailyNeurons: 'UNKNOWN',
  noAdditionalChargeAllocation: 'UNKNOWN', reason: 'No verified Workers AI account quota/overage receipt; public eligibility does not establish account allocation.', billingMutations: 0 };
await writeFile(new URL('account-access.json', out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
