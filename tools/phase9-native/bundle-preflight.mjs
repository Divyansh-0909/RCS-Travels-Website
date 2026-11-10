import http from 'node:http';

// Metro's first native bundle can legitimately take longer than Undici's default
// five-minute headers timeout. Bound the whole request with the harness budget.
export function fetchNativeBundle(address, { timeoutMs = 600_000, maxBytes = 100 * 1024 * 1024 } = {}) {
  const url = new URL(address);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Native bundle preflight requires loopback HTTP');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error('Invalid native bundle deadline');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 100 * 1024 * 1024) throw new Error('Invalid native bundle size bound');
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0, response, settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(deadline);
      if (error) { request.destroy(); response?.destroy(); reject(error); }
      else resolve(value);
    };
    const request = http.get(url, incoming => {
      response = incoming;
      incoming.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) finish(new Error('Native bundle exceeds the preflight size bound'));
        else chunks.push(chunk);
      });
      incoming.once('error', error => finish(error));
      incoming.once('aborted', () => finish(new Error('Native bundle response interrupted')));
      incoming.once('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        finish(null, { status: incoming.statusCode, ok: incoming.statusCode >= 200 && incoming.statusCode < 300, text: async () => body });
      });
    });
    const deadline = setTimeout(() => finish(new Error('Native bundle preflight deadline exceeded')), timeoutMs);
    request.once('error', error => finish(error));
  });
}
