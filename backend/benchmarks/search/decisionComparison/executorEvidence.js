import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';

export async function durableJson(path, value) {
  const handle = await open(path, 'wx');
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
}
export async function claimActivation(directory, identity) {
  await mkdir(directory, { recursive: true });
  try { await durableJson(join(directory, 'activation-claim.json'), identity); }
  catch (error) {
    const failure = new Error(error.code === 'EEXIST' ? 'ACTIVATION_ALREADY_CLAIMED' : 'ACTIVATION_CLAIM_FAILED');
    failure.category = failure.message; throw failure;
  }
  await mkdir(join(directory, 'requests'));
  await mkdir(join(directory, 'cases'));
}
export function evidenceStore(directory, identity) {
  let sequence = 0;
  return {
    async provider(provider) { await durableJson(join(directory, `${provider}-claim.json`), { ...identity, provider }); },
    async intent(value) {
      sequence += 1;
      const id = String(sequence).padStart(4, '0');
      await durableJson(join(directory, 'requests', `${id}-intent.json`), { ...identity, ...value, id, outcome: 'UNKNOWN_UNTIL_RESPONSE' });
      return id;
    },
    async response(id, value) { await durableJson(join(directory, 'requests', `${id}-response.json`), { ...identity, ...value }); },
    async caseResult(provider, index, value) {
      await durableJson(join(directory, 'cases', `${provider}-${String(index).padStart(2, '0')}.json`), { ...identity, ...value });
    },
    async finish(value) { await durableJson(join(directory, 'terminal.json'), { ...identity, ...value }); },
  };
}
export function safeObservation(observation) {
  const result = structuredClone(observation);
  if (result.error) {
    // Keep successful model outputs even when normalization rejects them, but
    // exclude HTTP/Cloudflare error envelopes and arbitrary error text.
    if (result.httpStatus >= 300 || result.raw?.success === false || result.raw?.error) result.raw = null;
    const retry = result.error.retryAfter;
    result.error = { category: result.error.category, ...(Number.isInteger(result.error.httpStatus) ? { httpStatus: result.error.httpStatus } : {}),
      retryAfter: typeof retry === 'string' && retry.length <= 128 && (/^\d+(?:\.\d+)?$/u.test(retry)
        || /^[A-Za-z]{3}, [\d :A-Za-z]+ GMT$/u.test(retry) && Number.isFinite(Date.parse(retry))) ? retry : null };
  }
  return result;
}
