import { createWorkbench, TOOLS, VERSION } from './workbench.mjs';

const call = createWorkbench();
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
let state = 'new';
let pending = '';
let chain = Promise.resolve();
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const failure = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(line) {
  let request;
  try { request = JSON.parse(line); } catch { failure(null, -32700, 'Parse error'); return; }
  if (!request || Array.isArray(request) || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (Object.hasOwn(request, 'id') && typeof request.id !== 'string' && typeof request.id !== 'number')) {
    failure(null, -32600, 'Invalid Request'); return;
  }
  if (!Object.hasOwn(request, 'id')) {
    if (request.method === 'notifications/initialized' && state === 'initializing') state = 'ready';
    return;
  }
  const { id, method, params = {} } = request;
  if (!params || typeof params !== 'object' || Array.isArray(params)) { failure(id, -32602, 'Invalid params'); return; }
  let result;
  if (method === 'initialize') {
    if (state !== 'new') { failure(id, -32600, 'Already initialized'); return; }
    if (typeof params.protocolVersion !== 'string') { failure(id, -32602, 'protocolVersion required'); return; }
    state = 'initializing';
    result = { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'rcs-legal-workbench', version: VERSION }, instructions: 'Local evidence and document tools. Use primary-source research separately. These tools never certify legal compliance.' };
  } else if (method === 'ping') result = {};
  else if (state !== 'ready') { failure(id, -32002, 'Initialize the session first'); return; }
  else if (method === 'tools/list') result = { tools: TOOLS.map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) };
  else if (method === 'tools/call') {
    if (typeof params.name !== 'string' || !TOOLS.some(tool => tool.name === params.name)) { failure(id, -32602, 'Unknown tool'); return; }
    try {
      const output = await call(params.name, params.arguments ?? {});
      result = { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], isError: false };
    } catch (error) {
      const safeMessage = error.code ? 'Local evidence package unavailable; check installation.' : error.message;
      result = { content: [{ type: 'text', text: safeMessage }], isError: true };
    }
  } else { failure(id, -32601, 'Method not found'); return; }
  send({ jsonrpc: '2.0', id, result });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  pending += chunk;
  if (pending.length > 600_000) {
    failure(null, -32600, 'Message exceeds local input limit');
    process.stdin.pause(); process.exitCode = 1; process.stdin.destroy(); return;
  }
  let index;
  while ((index = pending.indexOf('\n')) !== -1) {
    const line = pending.slice(0, index).trim();
    pending = pending.slice(index + 1);
    if (line) chain = chain.then(() => handle(line)).catch(() => failure(null, -32603, 'Internal error'));
  }
});
process.stdin.on('end', () => {
  if (pending.trim()) chain = chain.then(() => handle(pending.trim()));
});
