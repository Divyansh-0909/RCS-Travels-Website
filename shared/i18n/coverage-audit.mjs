// Legacy regex audit retained below; use source-audit.mjs for AST-based JSX coverage.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const roots = ['frontend/src', 'driver-app/src'];
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const literal = /(?:>\s*|(?:title|placeholder|aria-label|alt|accessibilityLabel|accessibilityHint)\s*=\s*)["'`]([^"'`{}\n]{2,})["'`]/g;
const alertCall = /(?:Alert\.alert|window\.alert)\(\s*['"]([^'"]+)['"]/g;
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extensions.has(path.slice(path.lastIndexOf('.')))) files.push(path);
  }
}
for (const root of roots) await walk(root);
const findings = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const regex of [literal, alertCall]) {
    let match;
    while ((match = regex.exec(text))) {
      const line = text.slice(0, match.index).split('\n').length;
      const value = match[1].trim();
      if (/^[A-Za-z]|[\u0900-\u097f]/.test(value) && !/^(className|div|span)$/.test(value)) findings.push({ file: relative('.', file), line, value });
    }
  }
}
console.log(JSON.stringify({ filesScanned: files.length, literalFindings: findings.length, findings }, null, 2));
