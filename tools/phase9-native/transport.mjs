export function createNativeFetch(originalFetch, api, debug) {
  if (!debug || !api || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) {
    throw new Error('Phase9 requires a debug build and loopback API');
  }
  return async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
    if (url.hostname === 'phase9.clerk.accounts.dev') {
      headers.set('cookie', 'fixture_actor=captain');
      const target = api + '/fixture-auth' + url.pathname + url.search;
      const forwarded = typeof input === 'object' && 'url' in input ? new Request(target, input) : target;
      return originalFetch(forwarded, { ...init, headers });
    }
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Phase9 external transport denied');
    return originalFetch(input, init);
  };
}
