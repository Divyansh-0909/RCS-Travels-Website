import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check } from './hook.mjs';
import { render, readSource } from './read.mjs';

test('guard rejects bulk reads but permits bounded reads and unrelated commands', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-guard-'));
  const file = path.join(dir, 'large file.js');
  try {
    fs.writeFileSync(file, 'const example = 1;\n'.repeat(400));
    const event = (command) => ({ tool_name: 'Bash', cwd: dir, tool_input: { command } });
    assert.ok(check(event('Get-Content "large file.js"')));
    assert.ok(check(event('git status; cat "large file.js"')));
    assert.equal(check(event('Get-Content "large file.js" -TotalCount 100')), null);
    assert.equal(check(event('npm test')), null);
    assert.equal(check(event('cat missing.js')), null);
    assert.ok(check({ tool_name: 'Read', tool_input: { file_path: file } }));
    assert.equal(check({ tool_name: 'Read', tool_input: { file_path: file, offset: 10, limit: 80 } }), null);
    fs.writeFileSync(file, 'x'.repeat(13000));
    assert.ok(check(event('cat "large file.js"')));
  } finally { fs.unlinkSync(file); fs.rmdirSync(dir); }
});

test('reader preserves locations, performs literal search, and caps output', () => {
  const lines = ['// note', 'export function example() {', '  return "a.b";', '}'];
  assert.match(render(lines, 'outline'), /2: export function/);
  assert.match(render(lines, 'find', 'a.b'), /3:.*a\.b/);
  assert.match(render(lines, 'read', '3', '1'), /3:.*return/);
  assert.throws(() => render(lines, 'read', '0', '10'));
  assert.throws(() => render(lines, 'read', '1', '351'));
  assert.ok(render(Array(1000).fill('const x = ' + 'x'.repeat(500)), 'outline').length < 12500);
});

test('reader excludes environment paths and repository escapes', () => {
  assert.throws(() => readSource('../outside-repository.js'));
  assert.throws(() => readSource('backend/.env.example'), /Excluded/);
  assert.ok(readSource('AGENTS.md').length > 0);
});
