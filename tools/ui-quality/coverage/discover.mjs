import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'frontend/package.json'));
const { parse } = require('@babel/parser');
const codeFiles = execFileSync('rg', ['--files', 'frontend/src', 'driver-app/src'], { cwd: root, encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter(f => /\.[jt]sx?$/.test(f)).map(f => f.replaceAll('\\', '/'));
const label = node => node?.type === 'JSXIdentifier' || node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : null;
const value = node => node?.type === 'StringLiteral' || node?.type === 'NumericLiteral' || node?.type === 'BooleanLiteral' ? node.value : undefined;
const files = [], errors = [];
for (const file of codeFiles) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  let ast; try { ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: false }); }
  catch (e) { errors.push({ file, reason: e.reasonCode || e.name }); continue; }
  const result = { file, imports: [], routes: [], navigation: [], dynamic_navigation: [], arrays: [], states: [], branches: [], render_conditions: [], overlays: [], dialogs: [], jsx: [] };
  const snippet = n => code.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, 180);
  const at = n => ({ line: n.loc.start.line, code: snippet(n) });
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'ImportDeclaration') result.imports.push({ from: n.source.value, names: n.specifiers.map(s => s.local.name), line: n.loc.start.line });
    if (n.type === 'VariableDeclarator') {
      if (n.id.type === 'Identifier' && n.init?.type === 'CallExpression' && label(n.init.callee) === 'lazy') {
        const body = n.init.arguments[0]?.body;
        if (body?.type === 'CallExpression' && body.callee.type === 'Import' && typeof value(body.arguments[0]) === 'string') result.imports.push({ from: body.arguments[0].value, names: [n.id.name], line: n.loc.start.line });
      }
      if (n.id.type === 'Identifier' && n.init?.type === 'ArrayExpression') {
        const values = n.init.elements.map(e => value(e)).filter(v => v !== undefined);
        if (values.length) result.arrays.push({ name: n.id.name, values, ...at(n) });
      }
      if (n.id.type === 'ArrayPattern' && n.init?.type === 'CallExpression' && label(n.init.callee) === 'useState') result.states.push({ name: label(n.id.elements[0]), setter: label(n.id.elements[1]), ...at(n) });
    }
    if (n.type === 'BinaryExpression' && ['===', '==', '!==', '!='].includes(n.operator)) {
      const left = label(n.left), right = value(n.right);
      if (left && right !== undefined) result.branches.push({ variable: left, value: right, ...at(n) });
    }
    if (n.type === 'SwitchStatement') for (const c of n.cases) if (value(c.test) !== undefined) result.branches.push({ variable: snippet(n.discriminant), value: value(c.test), ...at(c.test) });
    const jsx = v => v?.type === 'JSXElement' || v?.type === 'JSXFragment';
    if (n.type === 'ConditionalExpression' && (jsx(n.consequent) || jsx(n.alternate))) result.render_conditions.push({ condition: snippet(n.test), ...at(n.test) });
    if (n.type === 'LogicalExpression' && jsx(n.right)) result.render_conditions.push({ condition: snippet(n.left), ...at(n.left) });
    if (n.type === 'IfStatement') {
      const body=n.consequent.type==='BlockStatement'?n.consequent.body:[n.consequent];
      if(body.some(b=>b.type==='ReturnStatement'&&jsx(b.argument)))result.render_conditions.push({ condition:snippet(n.test),...at(n.test) });
    }
    if (n.type === 'ObjectExpression') {
      const route = n.properties.find(p => p.type === 'ObjectProperty' && label(p.key) === 'path' && typeof value(p.value) === 'string');
      const element = n.properties.find(p => p.type === 'ObjectProperty' && label(p.key) === 'element');
      if (route && element) result.routes.push({ path: route.value.value, element: snippet(element.value), ...at(route) });
    }
    if (n.type === 'CallExpression' && /^(navigate|push|replace)$/.test(label(n.callee) || '') && typeof value(n.arguments[0]) === 'string') result.navigation.push({ path: n.arguments[0].value, ...at(n) });
    if (n.type === 'CallExpression' && /^(navigate|push|replace)$/.test(label(n.callee) || '') && n.arguments[0] && value(n.arguments[0]) === undefined) result.dynamic_navigation.push({ expression:snippet(n.arguments[0]),...at(n) });
    if (n.type === 'JSXOpeningElement') {
      const name = label(n.name), attrs = Object.fromEntries(n.attributes.filter(a => a.type === 'JSXAttribute').map(a => [label(a.name), a.value?.type === 'JSXExpressionContainer' ? snippet(a.value.expression) : value(a.value) ?? true]));
      if (name) result.jsx.push({ name, line: n.loc.start.line });
      if (name === 'Route' && typeof attrs.path === 'string') result.routes.push({ path: attrs.path, element: attrs.element, ...at(n) });
      if (name === 'Route' && attrs.index) result.routes.push({ path: '/', element: attrs.element, index: true, ...at(n) });
      if (typeof attrs.to === 'string' && attrs.to.startsWith('/')) result.navigation.push({ path: attrs.to, ...at(n) });
      else if(typeof attrs.to==='string')result.dynamic_navigation.push({expression:attrs.to,...at(n)});
      if (name && /(?:Modal|Dialog|Sheet|Drawer|Panel)$/.test(name) && !['BackgroundPanel', 'RoutePanel'].includes(name)) result.overlays.push({ name, attrs, ...at(n) });
      if (['dialog', 'alertdialog'].includes(attrs.role) || name === 'Modal') result.dialogs.push({ name, attrs, ...at(n) });
    }
    for (const [key, child] of Object.entries(n)) if (!['loc', 'extra', 'comments', 'tokens'].includes(key)) { if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child); }
  }
  walk(ast.program); files.push(result);
}
const result = { generatedAt: new Date().toISOString(), scanner: 'Babel syntax inventory; routes/branches are navigation hints and do not imply runtime verification', fileCount: files.length, errors, files };
const target = process.argv[2] || 'output/handoff/P05-source-discovery.json'; fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, parseErrors: errors, target, webRoutes: files.find(f => f.file === 'frontend/src/main.jsx').routes.map(r => r.path) }));
