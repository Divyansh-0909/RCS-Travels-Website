import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const destination = path.resolve('legal-review/2026-11-01-audit/sources');
await mkdir(destination, { recursive: true });
const inputs = process.argv.slice(2);
if (inputs.length === 0 || inputs.length % 2) throw new Error('Use pairs: <safe-filename> <public-https-url>');
for (let i = 0; i < inputs.length; i += 2) {
  const [filename, address] = inputs.slice(i, i + 2);
  if (!/^[a-z0-9-]+\.(?:html|pdf|js|json)$/u.test(filename)) throw new Error('Invalid source filename');
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Public HTTPS sources only');
  const start = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'RCS-Legal-Research/1.0 (public-source-verification)' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 15_000_000) throw new Error('Source too large');
    if (filename.endsWith('.pdf') && buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Expected PDF; server returned another format');
    await writeFile(path.join(destination, filename), buffer);
    const record = { filename, url: url.href, finalUrl: response.url, fetchedOn: '2026-11-01', bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), contentType: response.headers.get('content-type') };
    await writeFile(path.join(destination, `${filename}.provenance.json`), `${JSON.stringify(record, null, 2)}\n`);
    if (filename.endsWith('.html')) {
      const html = buffer.toString('utf8');
      const links = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/giu)].map(match => match[1]);
      record.interestingLinks = links.filter(value => /\.pdf|\.js|\.json|download|2026|2025/iu.test(value)).slice(0, 35);
    }
    process.stdout.write(`${JSON.stringify(record)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify({ filename, url: url.href, error: error.message, elapsedMs: Date.now() - start })}\n`); }
}
