import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { atomicJson, hash } from '../../handoff/core.mjs';

const require = createRequire(path.resolve('frontend/package.json'));
const { parse } = require('@babel/parser');
const out = 'output/handoff/website-consistency-2026-10-26';
fs.mkdirSync(out, { recursive: true });
const files = execFileSync('rg', ['--files', 'frontend/src', '-g', '*.jsx', '-g', '*.tsx', '-g', '!*.stories.jsx'], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
const occurrences = [], routes = [], errors = [];
for (const original of files) {
  const file = original.replaceAll('\\', '/'), source = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] }); }
  catch (error) { errors.push({ file, error: error.message }); continue; }
  const slice = node => source.slice(node.start, node.end);
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectProperty' && (node.key.name === 'path' || node.key.value === 'path') && node.value.type === 'StringLiteral') routes.push({ path: node.value.value, file, line: node.loc.start.line });
    if (node.type === 'JSXElement') {
      const tag = node.openingElement.name.name;
      const attrs = Object.fromEntries(node.openingElement.attributes.filter(attr => attr.type === 'JSXAttribute').map(attr => [attr.name.name, attr.value ? attr.value.type === 'StringLiteral' ? attr.value.value : slice(attr.value) : true]));
      const classes = String(attrs.className || '');
      const input = ['input', 'textarea', 'select', 'Input'].includes(tag);
      const repeated = ['Button', 'ActionControl', 'CircleIconButton', 'Toggle', 'SliderToggle', 'Chips', 'NoticePill', 'RefreshNotice', 'InlineError', 'SettingRow'].includes(tag);
      const round = classes.includes('rounded-full') || /rounded:\s*["']999(?:9)?px["']/.test(String(attrs.prop || ''));
      const interactive = ['button', 'Button', 'ActionControl', 'CircleIconButton', 'Toggle', 'SliderToggle'].includes(tag) || Boolean(attrs.onClick);
      if (input || repeated || round || (tag === 'Icon' && attrs.onClick)) occurrences.push({
        file, line: node.loc.start.line, tag,
        category: input ? 'input' : round && interactive ? 'pill-or-icon-control' : round ? 'rounded-wrapper-or-indicator' : repeated ? 'shared-control' : 'interactive-icon',
        inputType: attrs.type || (tag === 'textarea' ? 'multiline' : tag === 'select' ? 'select' : ''),
        classes, props: attrs.prop || '', style: attrs.style || '',
        ariaLabel: attrs['aria-label'] || attrs.ariaLabel || '',
        events: Object.keys(attrs).filter(key => key.startsWith('on')),
        role: attrs.role || '',
        text: node.children.filter(child => child.type === 'JSXText' || child.type === 'JSXExpressionContainer').map(child => child.type === 'JSXText' ? child.value : slice(child)).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200),
      });
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
}
const summary = {
  sourceFiles: files.length, parseErrors: errors.length,
  inputs: occurrences.filter(item => item.category === 'input').length,
  inputFiles: [...new Set(occurrences.filter(item => item.category === 'input').map(item => item.file))],
  pillOrIconControls: occurrences.filter(item => item.category === 'pill-or-icon-control').length,
  interactiveIcons: occurrences.filter(item => item.category === 'interactive-icon').length,
  roundedWrappersAndIndicators: occurrences.filter(item => item.category === 'rounded-wrapper-or-indicator').length,
  repeatedControlUses: occurrences.filter(item => item.category === 'shared-control').length,
};
atomicJson(path.join(out, 'source-inventory.json'), { at: new Date().toISOString(), summary, routes, occurrences, errors, files: files.map(file => ({ file: file.replaceAll('\\', '/'), sha256: hash(fs.readFileSync(file)) })), interpretation: 'JSX declarations, not runtime instances or defect counts. Round shapes include intentional indicators and wrappers; each candidate requires semantic and browser review.' });
console.log(JSON.stringify(summary));
