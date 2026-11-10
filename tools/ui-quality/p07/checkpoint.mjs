import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const out = path.resolve('output/handoff/P07-2026-10-29');
export const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(out, { recursive: true });
if (!fs.existsSync(path.join(out, 'source-before.json'))) {
  const files = execFileSync('rg', ['--files', 'frontend/src', 'driver-app/src', 'shared'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => /\.(?:jsx?|tsx?|css|cjs|json)$/.test(f));
  const extra = ['tools/ui-quality/coverage/master-ui-coverage.csv', 'tools/ui-quality/coverage/registered-surfaces.json', 'docs/ui-quality/component-consistency-inventory.json', 'docs/ui-quality/owner-approved-patterns.json', 'output/handoff/consistency-decisions.json', 'output/handoff/consistency-audit-decisions.json'];
  for (const f of extra) if (fs.existsSync(f)) files.push(f);
  fs.writeFileSync(path.join(out, 'source-before.json'), JSON.stringify(files.map(file => ({ file: file.replaceAll('\\', '/'), sha256: sha(file) })), null, 2));
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  for (const file of extra) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(out, 'before', file.replaceAll('/', '__')));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const index = execFileSync('git', ['rev-parse', '--git-path', 'index'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(out, 'git-before.json'), JSON.stringify({ head, index: fs.existsSync(index) ? sha(index) : null, status: execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }) }, null, 2));
}
console.log('P07 protected source checkpoint ready');
