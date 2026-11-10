import OpenAI from 'openai';
import { createHttpTransport } from '../decisionComparison/adapters.js';
import { stop } from './accounting.js';

export function createLiveTransport(phase, env, fetcher = globalThis.fetch) {
  let guard = null;
  const guardedFetch = async (resource, options) => {
    const endpoint = typeof resource === 'string' || resource instanceof URL ? String(resource) : resource.url;
    const body = JSON.parse(options?.body ?? await resource.clone().text());
    await guard?.({ endpoint, method: options?.method ?? resource.method, body });
    return fetcher(resource, options);
  };
  if (phase === 'B') {
    if (!env.TYPESAFE_API_KEY?.trim()) stop('JEV_CONFIGURATION_MISSING');
    const transport = createHttpTransport('jev', { apiKey: env.TYPESAFE_API_KEY, fetch: guardedFetch });
    return { kind: 'LIVE', async send(request, signal, beforeFetch) {
      guard = beforeFetch;
      try { return await transport.send(request, signal); } finally { guard = null; }
    } };
  }
  if (phase !== 'A' || !env.OPENAI_API_KEY?.trim()) stop('LUNA_CONFIGURATION_MISSING');
  let captured = null;
  const observedFetch = async (...args) => {
    const response = await guardedFetch(...args);
    if (captured && response.ok) {
      captured.status = response.status;
      try { captured.body = await response.clone().json(); }
      catch { captured.malformedJson = true; }
    }
    return response;
  };
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1',
    timeout: 15000, maxRetries: 0, fetch: observedFetch, fetchOptions: { redirect: 'error' } });
  return { kind: 'LIVE', async send(request, signal, beforeFetch) {
    guard = beforeFetch;
    captured = {};
    try {
      const response = await client.responses.parse(request, { signal, timeout: 15000, maxRetries: 0 }).withResponse();
      return { status: response.response.status, body: response.data, rawBody: captured.body,
        retryAfter: response.response.headers.get('retry-after'), requestId: response.request_id };
    } catch (error) {
      if (captured.status) return { status: captured.status, body: captured.body ?? null, rawBody: captured.body ?? null,
        normalizationError: captured.malformedJson ? 'SUCCESS_JSON_PARSE_FAILURE' : 'SDK_STRUCTURED_OUTPUT_FAILURE' };
      return { status: Number.isInteger(error.status) ? error.status : null, body: null,
        retryAfter: error.headers?.get?.('retry-after') ?? null,
        errorCategory: /timeout/i.test(error.name ?? '') ? 'TIMEOUT' : 'TRANSPORT_FAILURE' };
    } finally { captured = null; guard = null; }
  } };
}
export async function captureWireRequest(phase, request) {
  let body;
  const transport = createLiveTransport(phase, { OPENAI_API_KEY: 'SYNTHETIC_WIRE_CAPTURE', TYPESAFE_API_KEY: 'SYNTHETIC_WIRE_CAPTURE' },
    async () => { throw new Error('NETWORK_FORBIDDEN_DURING_CAPTURE'); });
  try { await transport.send(request, undefined, value => { body = value.body; throw new Error('OFFLINE_WIRE_CAPTURE_COMPLETE'); }); }
  catch { if (!body) stop('SDK_WIRE_CAPTURE_FAILED'); }
  if (!body) stop('SDK_WIRE_CAPTURE_FAILED');
  return body;
}
