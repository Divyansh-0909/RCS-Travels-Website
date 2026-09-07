/** Run from the repository root. --json emits individual findings.
 * This inventories literals; dynamic API copy still needs manual review.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(resolve('frontend/package.json'));
const { parse } = require('@babel/parser');
const roots = process.argv.filter(arg => /^(frontend|driver-app)\//.test(arg));
if (!roots.length) roots.push('frontend/src', 'driver-app/src');
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (['.js', '.jsx', '.ts', '.tsx'].includes(extname(path))) files.push(path);
  }
}
for (const root of roots) await walk(root);
const props = new Set(['title', 'label', 'placeholder', 'aria-label', 'alt', 'accessibilityLabel', 'accessibilityHint', 'description', 'message', 'subtitle', 'helperText', 'emptyMessage']);
const findings = [];
const parseErrors = [];
const hasCopy = value => /[A-Za-z\u0900-\u097f]/.test(value) && !/^https?:|^[\w.-]+@/.test(value);
for (const file of files) {
  const source = await readFile(file, 'utf8');
  let ast;
  try { ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx', ...(extname(file).startsWith('.ts') ? ['typescript'] : [])] }); }
  catch (error) { parseErrors.push({ file, error: error.message }); continue; }
  const add = (node, value, kind) => {
    value = value.replace(/\s+/g, ' ').trim();
    if (hasCopy(value)) findings.push({ file: relative('.', file).replaceAll('\\', '/'), line: node.loc.start.line, kind, value });
  };
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    const parent = ancestors.at(-1);
    if (node.type === 'JSXText') add(node, node.value, 'visible text');
    if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') {
      const value = node.type === 'StringLiteral' ? node.value : node.quasis.map(part => part.value.cooked).join('{{value}}');
      const translated = ancestors.some(p => p.type === 'CallExpression' && (/^(t|translate|translateText|localizeText|tr)$/.test(p.callee?.name || '') || /^(t|translate)$/.test(p.callee?.property?.name || '')));
      if (!translated) {
        if (parent?.type === 'JSXAttribute' && props.has(parent.name.name)) add(node, value, 'visible attribute');
        else if (parent?.type === 'ObjectProperty' && props.has(parent.key?.name || parent.key?.value) && parent.value === node) add(node, value, 'copy data');
        else if (parent?.type === 'CallExpression' && parent.callee?.property?.name === 'alert') add(node, value, 'alert');
        else {
          const container = ancestors.findLast(p => p.type === 'JSXExpressionContainer');
          if (container && !ancestors.some(p => p.type === 'JSXAttribute') && ['JSXExpressionContainer', 'ConditionalExpression', 'LogicalExpression'].includes(parent?.type)) add(node, value, 'visible expression');
        }
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'tokens', 'extra'].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(value => visit(value, [...ancestors, node]));
      else if (child?.type) visit(child, [...ancestors, node]);
    }
  }
  visit(ast);
}
const grouped = Object.entries(findings.reduce((result, item) => {result[item.file] = (result[item.file] || 0) + 1; return result;}, {})).sort((a,b) => b[1] - a[1]);
console.log(JSON.stringify({ filesScanned: files.length, literalFindings: findings.length, parseErrors, ...(process.argv.includes('--json') ? { findings } : { files: Object.fromEntries(grouped) }) }, null, 2));
if (parseErrors.length) process.exitCode = 1;
