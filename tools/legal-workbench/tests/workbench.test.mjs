import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, TOOLS, createWorkbench, checkCitations, comparePolicies, reviewPolicy } from '../workbench.mjs';

const call = createWorkbench();

test('registered, missing, draft and mismatched citations never become legal approval', () => {
  const sources = [
    { id: 'final', status: 'final', primary: true, url: 'https://example.test/final' },
    { id: 'draft', status: 'draft', primary: true, url: 'https://example.test/draft' },
  ];
  const result = checkCitations([
    { sourceId: 'final', quote: 'A B', evidenceText: 'A\n B', locator: 'rule 1' },
    { sourceId: 'final', quote: 'invented', evidenceText: 'actual source' },
    { sourceId: 'final', quote: 'unsupported' },
    { sourceId: 'draft' },
    { sourceId: 'missing' },
  ], sources);
  assert.equal(result[0].quotation, 'exact-normalised-match');
  assert.equal(result[0].evidenceProvenance, 'caller-supplied-not-authenticated');
  assert.equal(result[1].quotation, 'no-exact-match');
  assert.equal(result[2].quotation, 'missing-evidence');
  assert.equal(result[3].status, 'draft-not-operative-authority');
  assert.equal(result[4].status, 'unknown-source');
  assert.ok(result.every(row => row.semanticSupportVerified === false));
});

test('policy checks report unresolved clauses and assurances with correct line numbers', () => {
  const result = reviewPolicy('# Policy\n\n[TO CONFIRM: timing]\nFully compliant.\nTBD');
  assert.deepEqual(result.findings.map(row => [row.code, row.line]), [
    ['unresolved-marker', 3], ['placeholder', 5], ['unsupported-assurance', 4],
  ]);
  assert.equal(result.legalClearance, false);
  assert.equal(reviewPolicy('Ordinary completed text.').legalClearance, false);
});

test('comparison surfaces changed monetary terms and removed paragraphs', () => {
  const result = comparePolicies('Advance 15%.\n\nAll money retained.', 'Advance 10%.\n\nFee capped at ₹100.');
  assert.deepEqual(result.removedNumericTokens, ['15%']);
  assert.ok(result.addedNumericTokens.includes('₹100'));
  assert.equal(result.removedCount, 2);
  assert.equal(result.addedCount, 2);
});

test('tools reject unknown fields, oversized input, invalid shapes and path traversal', async () => {
  await assert.rejects(call('legal_profile', { path: '../secret' }), /Unknown/);
  await assert.rejects(call('legal_policy_review', { text: 'x'.repeat(80_001) }), /Invalid/);
  await assert.rejects(call('legal_cite_check', { citations: [] }), /Invalid/);
  await assert.rejects(call('legal_cite_check', { citations: [{ sourceId: 'a', path: '/secret' }] }), /Unknown/);
  await assert.rejects(call('legal_document', { id: '../data/profile' }), /Invalid/);
  await assert.rejects(call('legal_document', { id: 'not-a-document' }), /Unknown/);
  await assert.rejects(call('shell', {}), /Unknown tool/);
});

test('source and requirement records preserve unknown coverage and valid references', async () => {
  const { sources } = await call('legal_sources');
  const ids = new Set(sources.map(row => row.id));
  assert.equal(ids.size, sources.length);
  for (const source of sources) {
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.equal(typeof source.readStatus, 'string');
  }
  const { rows } = await call('legal_jurisdiction_matrix');
  assert.ok(rows.every(row => row.sources.every(id => ids.has(id))));
  const up = await call('legal_sources', { jurisdiction: 'IN-UP' });
  assert.ok(up.sources.some(source => source.status === 'draft'));
  assert.deepEqual((await call('legal_sources', { jurisdiction: 'UNKNOWN' })).sources, []);
});

test('all eight document families exist without unresolved replacement markers', async () => {
  const { documents, status } = await call('legal_document');
  assert.equal(documents.length, 8);
  assert.equal(status, 'completed-drafting-candidates-not-adopted');
  for (const id of documents) {
    const result = await call('legal_document', { id });
    assert.equal(result.status, 'candidate-not-adopted');
    assert.ok(result.text.length > 1500);
    const scan = reviewPolicy(result.text);
    assert.equal(scan.findings.filter(row => ['unresolved-marker', 'placeholder', 'unsupported-assurance'].includes(row.code)).length, 0, id);
  }
});

test('portable and compatibility manifests identify the same runnable package', async () => {
  const json = async name => JSON.parse(await readFile(path.join(ROOT, name), 'utf8'));
  const portable = await json('plugin.json');
  const legacy = await json('.codex-plugin/plugin.json');
  const config = await json('mcp.json');
  assert.equal(portable.name, legacy.name);
  assert.equal(portable.version, legacy.version);
  assert.equal(portable.extensions['com.openai'].interface.shortDescription.length <= 30, true);
  assert.equal(portable.extensions['com.openai'].requires_local_executor, true);
  assert.equal(config.mcpServers['rcs-legal'].type, 'stdio');
  assert.ok(config.mcpServers['rcs-legal'].args[0].endsWith('/server.mjs'));
  for (const tool of TOOLS) assert.equal(tool.inputSchema.additionalProperties, false);
});

test('real stdio process negotiates MCP and executes all tools without diagnostic stdout', async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 3, method: 'tools/list' },
    ...TOOLS.map((tool, index) => ({
      jsonrpc: '2.0', id: 10 + index, method: 'tools/call', params: {
        name: tool.name,
        arguments: tool.name === 'legal_cite_check' ? { citations: [{ sourceId: 'IN-UP-MARCH-2026-DRAFT' }] }
          : tool.name === 'legal_policy_review' ? { text: 'A policy.' }
            : tool.name === 'legal_compare' ? { currentText: '10%', proposedText: '15%' } : {},
      },
    })),
    { jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'legal_document', arguments: { id: '../secret' } } },
    { jsonrpc: '2.0', id: 31, method: 'made-up-method' },
  ];
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('MCP smoke test timed out')); }, 10_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  // Split the first message to exercise stream framing, not only whole lines.
  const wire = requests.map(value => JSON.stringify(value)).join('\n') + '\n';
  child.stdin.write(wire.slice(0, 13)); child.stdin.end(wire.slice(13));
  assert.equal(await completed, 0);
  assert.equal(stderr, '');
  const replies = stdout.trim().split('\n').map(line => JSON.parse(line));
  const byId = id => replies.find(reply => reply.id === id);
  assert.equal(byId(1).error.code, -32002);
  assert.equal(byId(2).result.protocolVersion, '2025-11-25');
  assert.equal(byId(3).result.tools.length, 8);
  for (let index = 0; index < TOOLS.length; index++) assert.equal(byId(10 + index).result.isError, false);
  assert.equal(byId(30).result.isError, true);
  assert.equal(byId(31).error.code, -32601);
});
