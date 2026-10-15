import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { CODEX_MODEL, digest, isolatedEnvironment, buildCodexArgs, disabledFeatures,
  isolationConfig, resolveCodexLauncher, verifyCliHelp, codexNativePath } from '../benchmarks/codex/config.js'
import { collectProcess as nativeCollectProcess } from '../benchmarks/codex/process.js'
import { parseCodexEvents, eventIsSafe, failureCategory, startupWarning, observedCodexUsage } from '../benchmarks/codex/events.js'
import { codexConfiguration, createCodexEvaluationBackend, validateCodexResponse } from '../benchmarks/codex/adapter.js'
import { config, events, fakeProcess, jsonl, output, schema, successProcess, temp, usage, validate } from './helpers/codexFixtures.js'
// Fixture processes finish in microtasks. Short fixture deadlines prevent orphaned mutation workers.
// A separate injected-clock test verifies the real default deadline and cancellation contract.
const collectProcess = options => nativeCollectProcess({ timeoutMs: 250, ...options })

test('Codex arguments enforce native authentication, isolated config, readonly sandbox and no shell interpolation', () => {
  const args = buildCodexArgs({ schemaPath: 'schema path', resultPath: 'result path', instructionsPath: 'instructions path' })
  assert.deepEqual(args.slice(0, 16), ['exec', '--model', 'gpt-6-luna', '--ignore-user-config', '--ignore-rules',
    '--strict-config', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--output-schema',
    'schema path', '--output-last-message', 'result path', '--json', '--color'])
  assert.equal(args.at(-1), '-')
  for (const feature of disabledFeatures) assert.ok(args.includes(feature))
  assert.ok(args.includes('forced_login_method="chatgpt"'))
  assert.ok(args.includes('model_provider="openai"'))
  assert.ok(args.includes('web_search="disabled"'))
  assert.ok(args.includes('model_instructions_file="instructions path"'))
  assert.ok(!args.some(value => /danger-full|bypass|full-auto/.test(value)))
  assert.equal(CODEX_MODEL, 'gpt-6-luna')
  assert.deepEqual(isolationConfig.mcp_servers, {})
  assert.deepEqual(disabledFeatures, ['shell_tool', 'unified_exec', 'apps', 'plugins', 'remote_plugin', 'multi_agent',
    'multi_agent_v2', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'view_image',
    'hooks', 'memories', 'skill_search', 'skill_mcp_dependency_install', 'code_mode', 'code_mode_host', 'goals', 'sleep_tool'])
  assert.deepEqual(isolationConfig, { model_provider: 'openai', forced_login_method: 'chatgpt', web_search: 'disabled',
    model_reasoning_effort: 'low', approval_policy: 'never', project_doc_max_bytes: 0, mcp_servers: {},
    'apps._default.enabled': false, 'features.skip_host_skill_discovery': true, 'features.unbounded_connection_retries': false })
  assert.ok(Object.isFrozen(disabledFeatures)); assert.ok(Object.isFrozen(isolationConfig))
  assert.equal(args[16], 'never')
  const expected = args.slice(0, 17)
  for (const [key, value] of Object.entries({ ...isolationConfig, model_instructions_file: 'instructions path' })) expected.push('-c', `${key}=${JSON.stringify(value)}`)
  for (const feature of disabledFeatures) expected.push('--disable', feature)
  expected.push('-')
  assert.deepEqual(args, expected)
})
test('Codex execution configuration records task identity and resource boundaries independently of API billing', () => {
  const result = codexConfiguration({ cliVersion: 'fixture-cli', instructions: 'fixture instructions', schema, task: 'responsibility-development' })
  assert.deepEqual(result, { version: 'codex-inference-only-v1', backendId: 'luna-codex', model: 'gpt-6-luna',
    executionSurface: 'codex-exec-chatgpt', cliVersion: 'fixture-cli', task: 'responsibility-development',
    promptHash: digest('fixture instructions'), schemaHash: digest(schema), isolation: isolationConfig, disabledFeatures,
    maxInputTokens: 30000, maxOutputTokens: 4000, timeoutMs: 120000, apiEquivalent: false,
    monetaryCost: 'NOT_COMPARABLE_TO_API_TOKEN_BILLING' })
})
test('Codex child environment excludes API credentials, bridge overrides and parent session state', () => {
  const env = isolatedEnvironment({ Path: 'fixture', USERPROFILE: 'profile', CODEX_HOME: 'auth home',
    OPENAI_API_KEY: 'sensitive fixture', OPENAI_BASE_URL: 'http://127.0.0.1:17841/v1',
    CODEX_API_KEY: 'fixture', CODEX_THREAD_ID: 'outer', HTTPS_PROXY: 'fixture', TYPESAFE_API_KEY: 'fixture' })
  assert.deepEqual(env, { Path: 'fixture', USERPROFILE: 'profile', CODEX_HOME: 'auth home' })
  const permitted = { path: 'a', pathext: 'b', systemroot: 'c', windir: 'd', userprofile: 'e', homedrive: 'f',
    homepath: 'g', home: 'h', temp: 'i', tmp: 'j', tmpdir: 'k', appdata: 'l', localappdata: 'm', codex_home: 'n' }
  assert.deepEqual(isolatedEnvironment(permitted), permitted)
})
test('Codex checks every required installed flag and isolation feature', () => {
  const help = buildCodexArgs({ schemaPath: 's', resultPath: 'r', instructionsPath: 'i' }).join(' ')
  const featureList = [...disabledFeatures, 'skip_host_skill_discovery', 'unbounded_connection_retries'].map(name => `${name} stable false`).join('\n')
  verifyCliHelp(help, featureList)
  for (const flag of ['--model', '--ignore-user-config', '--ignore-rules', '--strict-config', '--sandbox',
    '--skip-git-repo-check', '--ephemeral', '--output-schema', '--output-last-message', '--json']) {
    assert.throws(() => verifyCliHelp(help.replace(flag, ''), featureList), { message: 'CODEX_CLI_UNSUPPORTED_FLAG' })
  }
  assert.throws(() => verifyCliHelp(help, featureList.replace('shell_tool ', 'unknown ')), { message: 'CODEX_CLI_UNSUPPORTED_ISOLATION' })
})
test('missing Codex CLI fails before a process is spawned', () => {
  assert.throws(() => resolveCodexLauncher({ PATH: 'nonexistent-codex-fixture' }), { message: 'CODEX_CLI_MISSING' })
  assert.throws(() => resolveCodexLauncher({}), { message: 'CODEX_CLI_MISSING' })
})
test('Codex native launcher supports an executable on PATH and the installed npm binary', async () => {
  const directory = await temp()
  await writeFile(join(directory, 'codex.exe'), '')
  assert.deepEqual(resolveCodexLauncher({ PATH: directory }, 'win32'), { command: join(directory, 'codex.exe'), prefix: [] })
  await writeFile(join(directory, 'codex'), '')
  assert.deepEqual(resolveCodexLauncher({ PATH: directory }, 'linux'), { command: join(directory, 'codex'), prefix: [] })
  assert.ok(resolveCodexLauncher().command.endsWith('codex.exe'))
  const packagePath = join(directory, 'package.json')
  assert.equal(codexNativePath(packagePath, 'darwin', 'arm64'), join(directory, 'vendor', 'aarch64-apple-darwin', 'bin', 'codex'))
  assert.equal(codexNativePath(packagePath, 'linux', 'x64'), join(directory, 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex'))
  const installed = resolveCodexLauncher()
  const packageRoot = dirname(createRequire(import.meta.url).resolve('@openai/codex-win32-x64/package.json', { paths: [dirname(installed.command)] }))
  assert.deepEqual(installed, { command: join(packageRoot, 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'), prefix: [] })
})
test('Codex native launcher does not fall through to another installed binary when a package binary is absent', async () => {
  const directory = await temp()
  const scriptDirectory = join(directory, 'node_modules', '@openai', 'codex', 'bin')
  const packageDirectory = join(directory, 'node_modules', '@openai', `codex-win32-${process.arch}`)
  await mkdir(scriptDirectory, { recursive: true }); await mkdir(packageDirectory, { recursive: true })
  await writeFile(join(scriptDirectory, 'codex.js'), '')
  await writeFile(join(packageDirectory, 'package.json'), '{}')
  assert.throws(() => resolveCodexLauncher({ PATH: directory }, 'win32'), { message: 'CODEX_CLI_MISSING' })
})
test('Codex startup warnings are diagnostics and never counted as tool calls', () => {
  const warning = { type: 'item.completed', item: { type: 'error', message: 'Under-development features enabled: skip_host_skill_discovery. Fixture warning.' } }
  const unavailable = { type: 'item.completed', item: { type: 'error', message: 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.' } }
  assert.ok(eventIsSafe(warning)); assert.ok(startupWarning(warning)); assert.ok(startupWarning(unavailable))
  assert.ok(!startupWarning({ type: 'error' }))
  assert.ok(!startupWarning({ type: 'item.completed' }))
  assert.ok(!startupWarning({ type: 'item.completed', item: { type: 'error', message: 5 } }))
  assert.ok(!startupWarning({ type: 'item.completed', item: { type: 'error', message: 'Usage limit hit' } }))
  assert.ok(!startupWarning({ ...warning, type: 'item.started' }))
  assert.equal(parseCodexEvents(jsonl([warning, unavailable, ...events()])).unexpectedToolCalls, 0)
})
test('Codex fails closed for shell, file, MCP, web, plan, agent and unknown events', () => {
  for (const type of ['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'plan', 'spawn_agent', 'unknown']) {
    const event = { type: 'item.started', item: { type } }
    assert.equal(eventIsSafe(event), false)
    assert.throws(() => parseCodexEvents(jsonl([event, ...events()])), { message: 'UNEXPECTED_TOOL_USE' })
  }
  for (const event of [null, 'invalid', {}, { type: 7 }, { type: 'unexpected' }, { type: 'item.updated' }]) assert.equal(eventIsSafe(event), false)
  assert.ok(eventIsSafe({ type: 'item.started', item: { type: 'reasoning' } }))
  assert.ok(eventIsSafe({ type: 'item.updated', item: { type: 'reasoning' } }))
  const executableValue = Object.assign(() => {}, { type: 'thread.started' })
  assert.equal(eventIsSafe(executableValue), false)
})
test('Codex JSONL captures observed usage without fabricating billing costs', () => {
  const parsed = parseCodexEvents(jsonl(events()))
  assert.deepEqual(parsed, { text: JSON.stringify(output), usage: { inputTokens: 100, outputTokens: 40, cachedInputTokens: 0, requestCount: 1,
    requestCountScope: 'CODEX_CLI_INVOCATION_NOT_HTTP_REQUESTS' }, unexpectedToolCalls: 0 })
  assert.deepEqual(parseCodexEvents('  \n' + jsonl(events()) + '\n  '), parsed)
})
test('Codex rejects malformed, partial, duplicate and missing final outputs', () => {
  assert.throws(() => parseCodexEvents('malformed JSON'), { message: 'PROVIDER_SCHEMA_FAILURE' })
  for (const value of [[], events().slice(0, 3), [...events(), events().at(-1)], events().filter(e => !e.item), [...events(), events()[2]]]) {
    assert.throws(() => parseCodexEvents(jsonl(value)), { message: 'PROVIDER_PARTIAL_OUTPUT' })
  }
})
test('Codex rejects missing, negative, fractional and incomplete usage receipts', () => {
  for (const invalid of [null, {}, { ...usage, input_tokens: -1 }, { ...usage, output_tokens: 0.5 }, { ...usage, cached_input_tokens: '0' }]) {
    assert.throws(() => parseCodexEvents(jsonl(events(output, invalid))), { message: 'PROVIDER_USAGE_UNVERIFIED' })
  }
})
test('Codex provider failures retain explicit categories and stop instead of using another backend', () => {
  const pairs = [['usage limit hit', 'PROVIDER_USAGE_EXHAUSTED'], ['429', 'PROVIDER_USAGE_EXHAUSTED'],
    ['unsupported model', 'PROVIDER_MODEL_UNAVAILABLE'], ['model not found', 'PROVIDER_MODEL_UNAVAILABLE'],
    ['model gpt-6-luna is not supported', 'PROVIDER_MODEL_UNAVAILABLE'],
    ['unauthorized 401', 'PROVIDER_AUTH_FAILURE'], ['sandbox policy denied', 'PROVIDER_ISOLATION_FAILURE'], ['unknown failure', 'PROVIDER_PROCESS_FAILURE']]
  for (const [message, category] of pairs) {
    assert.equal(failureCategory(message), category)
    for (const event of [{ type: 'error', message }, { type: 'turn.failed', error: { message } }, { type: 'item.completed', item: { type: 'error', message } }]) {
      assert.throws(() => parseCodexEvents(jsonl([...events(), event])), { message: category })
    }
  }
})
test('Codex schema validation rejects malformed JSON, schema errors and message disagreement', () => {
  const budget = config()
  assert.deepEqual(validateCodexResponse(successProcess(), JSON.stringify(output), validate, budget).output, output)
  for (const last of ['invalid', '{}', JSON.stringify({ ...output, invented: true }), JSON.stringify({ ...output, severity: 'EXTREME' })]) {
    assert.throws(() => validateCodexResponse(successProcess(), last, validate, budget), { message: 'PROVIDER_SCHEMA_FAILURE' })
  }
  assert.throws(() => validateCodexResponse({ ...successProcess(), stdout: jsonl(events('invalid')) }, JSON.stringify(output), validate, budget), { message: 'PROVIDER_SCHEMA_FAILURE' })
  assert.throws(() => validateCodexResponse({ ...successProcess(), code: 1, stderr: 'login failed' }, '', validate, budget), { message: 'PROVIDER_AUTH_FAILURE' })
  assert.throws(() => validateCodexResponse({ ...successProcess(), termination: 'PROCESS_TIMEOUT' }, '', validate, budget), { message: 'PROCESS_TIMEOUT' })
  for (const tokens of [{ ...usage, input_tokens: 30001 }, { ...usage, output_tokens: 4001 }]) {
    assert.throws(() => validateCodexResponse({ ...successProcess(), stdout: jsonl(events(output, tokens)) }, JSON.stringify(output), validate, budget), { message: 'PROVIDER_RESOURCE_BUDGET_EXCEEDED' })
  }
  const boundary = { ...usage, input_tokens: 30000, output_tokens: 4000 }
  assert.deepEqual(validateCodexResponse({ ...successProcess(), stdout: jsonl(events(output, boundary)) }, JSON.stringify(output), validate, budget).output, output)
})
test('Codex process construction uses stdin and never a shell or visible helper window', async () => {
  let invocation, inner
  const result = await collectProcess({ command: 'fixture', args: ['arg'], cwd: 'isolated', env: { PATH: 'safe' }, stdin: 'evidence only',
    launch: (command, args, options) => {
      invocation = { command, args, options }
      inner = fakeProcess(child => { child.stdout.end('plain output\n'); child.stderr.end('diagnostic'); child.emit('close', 0); child.emit('close', 1) })
      return inner
    } })
  assert.deepEqual(result, { code: 0, termination: null, stdout: 'plain output\n', stderr: 'diagnostic' })
  assert.equal(invocation.command, 'fixture'); assert.deepEqual(invocation.args, ['arg'])
  assert.deepEqual(invocation.options, { cwd: 'isolated', env: { PATH: 'safe' }, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  assert.equal(inner.stdin.read().toString(), 'evidence only')
})
test('Codex process captures missing CLI, synchronous launch failure and other spawn errors', async () => {
  const options = { command: 'fixture', args: [], cwd: 'fixture', env: {} }
  const thrown = await collectProcess({ ...options, launch: () => { throw new Error('not installed') } })
  assert.equal(thrown.termination, 'CODEX_CLI_MISSING')
  for (const [code, expected] of [['ENOENT', 'CODEX_CLI_MISSING'], ['EACCES', 'PROCESS_FAILURE']]) {
    const result = await collectProcess({ ...options, launch: () => fakeProcess(child => child.emit('error', { code })) })
    assert.equal(result.termination, expected)
  }
})
test('Codex process stops on timeout, abort, stdin failure, output cap and unsafe events', async () => {
  const base = { command: 'fixture', args: [], cwd: 'fixture', env: {} }
  const controller = new AbortController(); controller.abort()
  assert.equal((await collectProcess({ ...base, signal: controller.signal, launch: () => { throw new Error('must not launch') } })).termination, 'PROCESS_ABORTED')
  const cases = [
    { reason: 'PROCESS_TIMEOUT', timeoutMs: 1, behavior: () => {} },
    { reason: 'PROCESS_FAILURE', behavior: child => child.stdin.emit('error', new Error('stdin closed')) },
    { reason: 'PROCESS_OUTPUT_LIMIT', maxBytes: 1, behavior: child => child.stdout.write('large output') },
    { reason: 'PROCESS_OUTPUT_LIMIT', maxBytes: 1, behavior: child => child.stderr.write('large diagnostic') },
    { reason: 'PROVIDER_SCHEMA_FAILURE', onEvent: eventIsSafe, behavior: child => child.stdout.write('invalid json\n') },
    { reason: 'UNEXPECTED_TOOL_USE', onEvent: eventIsSafe, behavior: child => child.stdout.write(jsonl([{ type: 'item.started', item: { type: 'command_execution' } }])) },
  ]
  for (const { reason, behavior, ...extra } of cases) {
    let inner
    const result = await collectProcess({ ...base, ...extra, launch: () => { inner = fakeProcess(behavior); return inner } })
    assert.equal(result.termination, reason); assert.ok(inner.killCount > 0)
  }
  const live = new AbortController()
  const aborted = await collectProcess({ ...base, signal: live.signal, launch: () => fakeProcess(() => live.abort()) })
  assert.equal(aborted.termination, 'PROCESS_ABORTED')
})
test('Codex JSONL streaming handles split lines and split UTF8 without changing Hindi input', async () => {
  const bytes = Buffer.from(jsonl(events({ ...output, note: 'दिल्ली' })))
  const result = await collectProcess({ command: 'fixture', args: [], cwd: 'fixture', env: {}, onEvent: eventIsSafe,
    launch: () => fakeProcess(child => {
      for (const byte of bytes) child.stdout.write(Buffer.from([byte]))
      for (const byte of Buffer.from('दिल्ली')) child.stderr.write(Buffer.from([byte]))
      child.emit('close', 0)
    }) })
  assert.equal(result.termination, null); assert.ok(result.stdout.includes('दिल्ली'))
  assert.equal(result.stderr, 'दिल्ली')
})
test('Codex process removes the abort listener after completion', async () => {
  const listenerCalls = [], signal = { aborted: false,
    addEventListener: (...args) => listenerCalls.push(['add', ...args]),
    removeEventListener: (...args) => listenerCalls.push(['remove', ...args]) }
  await collectProcess({ command: 'fixture', args: [], cwd: 'fixture', env: {}, signal,
    launch: () => fakeProcess(child => child.emit('close', 0)) })
  assert.equal(listenerCalls[0][1], 'abort'); assert.equal(listenerCalls[1][1], 'abort')
  assert.equal(listenerCalls[0][2], listenerCalls[1][2])
})
test('Codex process schedules its live deadline and cancels it after completion', async () => {
  const pending = new Map()
  const result = await nativeCollectProcess({ command: 'fixture', args: [], cwd: 'fixture', env: {},
    setDeadline: (callback, milliseconds) => {
      assert.equal(milliseconds, 120000); assert.equal(typeof callback, 'function')
      pending.set('deadline-fixture', callback); return 'deadline-fixture'
    }, clearDeadline: id => pending.delete(id),
    launch: () => fakeProcess(child => child.emit('close', 0)) })
  assert.equal(result.termination, null); assert.equal(pending.size, 0)
})
test('Codex process output cap accepts its boundary and includes combined stdout/stderr bytes', async () => {
  const base = { command: 'fixture', args: [], cwd: 'fixture', env: {}, maxBytes: 4 }
  for (const stream of ['stdout', 'stderr']) {
    const boundary = await collectProcess({ ...base, launch: () => fakeProcess(child => { child[stream].write('four'); child.emit('close', 0) }) })
    assert.equal(boundary.termination, null)
  }
  const result = await collectProcess({ ...base, launch: () => fakeProcess(child => { child.stderr.write('two'); child.stdout.write('two') }) })
  assert.equal(result.termination, 'PROCESS_OUTPUT_LIMIT')
})
test('Codex process accepts blank JSONL lines without calling the event monitor for them', async () => {
  const observed = []
  const result = await collectProcess({ command: 'fixture', args: [], cwd: 'fixture', env: {}, onEvent: event => { observed.push(event); return eventIsSafe(event) },
    launch: () => fakeProcess(child => { child.stdout.write('\n   \n' + jsonl(events())); child.emit('close', 0) }) })
  assert.equal(result.termination, null); assert.equal(observed.length, 4)
})
test('Codex adapter preserves independent identity, usage, original output and isolated artifacts', async () => {
  let called, clock = 100
  const backend = createCodexEvaluationBackend({ config: config(), instructions: 'fixture instructions', schema, validate,
    launcher: { command: 'fixture', prefix: ['fixture-prefix'] }, env: { PATH: 'safe', OPENAI_API_KEY: 'secret fixture' }, now: () => clock,
    runProcess: async options => {
      called = options
      clock = 105
      await writeFile(options.args[options.args.indexOf('--output-last-message') + 1], JSON.stringify(output))
      return successProcess()
    } })
  const input = { evidence: { original: 'unchanged' } }
  const result = await backend.evaluate({ input })
  assert.equal(backend.id, 'luna-codex'); assert.equal(backend.configHash, digest(config()))
  assert.equal(result.success, true); assert.equal(result.error, null)
  assert.equal(result.backendId, 'luna-codex'); assert.equal(result.model, 'gpt-6-luna')
  assert.equal(result.executionSurface, 'codex-exec-chatgpt'); assert.equal(result.inputHash, digest(input))
  assert.equal(result.configHash, digest(config())); assert.equal(result.schemaHash, config().schemaHash)
  assert.equal(result.promptHash, config().promptHash); assert.ok(result.latencyMs >= 0)
  assert.equal(result.latencyMs, 5)
  assert.deepEqual(result.output, output); assert.equal(result.usage.inputTokens, 100)
  assert.deepEqual(called.env, { PATH: 'safe' }); assert.equal(called.stdin, JSON.stringify(input))
  assert.equal(called.command, 'fixture'); assert.equal(called.args[0], 'fixture-prefix')
  assert.equal(called.timeoutMs, 120000); assert.equal(called.onEvent, eventIsSafe)
  assert.equal(await readFile(join(called.cwd, 'schema.json'), 'utf8'), JSON.stringify(schema))
  assert.equal(await readFile(join(called.cwd, 'instructions.txt'), 'utf8'), 'fixture instructions')
  assert.equal(await readFile(join(result.artifactDirectory, 'events.jsonl'), 'utf8'), successProcess().stdout)
  assert.equal(await readFile(join(result.artifactDirectory, 'stderr.txt'), 'utf8'), '')
})
test('Codex adapter rejects config drift and retains failures without inventing a valid result', async () => {
  const options = { config: config(), instructions: 'fixture instructions', schema, validate, launcher: { command: 'fixture', prefix: [] } }
  assert.throws(() => createCodexEvaluationBackend({ ...options, instructions: 'changed' }), { message: 'CODEX_CONFIGURATION_MISMATCH' })
  assert.throws(() => createCodexEvaluationBackend({ ...options, schema: {} }), { message: 'CODEX_CONFIGURATION_MISMATCH' })
  for (const processResult of [{ ...successProcess(), code: 1, stderr: 'usage limit hit' },
    { ...successProcess(), termination: 'UNEXPECTED_TOOL_USE' }, successProcess()]) {
    const backend = createCodexEvaluationBackend({ ...options, runProcess: async () => processResult })
    const result = await backend.evaluate({ input: {} })
    assert.equal(result.success, false); assert.equal(result.output, null)
    assert.deepEqual(result.usage, observedCodexUsage(processResult.stdout))
    assert.ok(result.error); assert.equal(result.unexpectedToolCalls, processResult.termination === 'UNEXPECTED_TOOL_USE' ? 1 : 0)
  }
})
test('Codex retains observed usage for schema or process failures while incomplete usage stays unknown', () => {
  assert.equal(observedCodexUsage('not json'), null)
  assert.equal(observedCodexUsage(jsonl(events().slice(0, 3))), null)
  assert.equal(observedCodexUsage(jsonl([...events(), events().at(-1)])), null)
  assert.equal(observedCodexUsage(jsonl([null])), null)
  for (const value of [null, {}, { ...usage, input_tokens: -1 }, { ...usage, output_tokens: 1.5 }]) {
    assert.equal(observedCodexUsage(jsonl(events(output, value))), null)
  }
  assert.deepEqual(observedCodexUsage(jsonl(events())), { inputTokens: 100, outputTokens: 40, cachedInputTokens: 0, requestCount: 1,
    requestCountScope: 'CODEX_CLI_INVOCATION_NOT_HTTP_REQUESTS' })
  assert.deepEqual(observedCodexUsage(jsonl(events()).replaceAll('\n', '\n\n')), observedCodexUsage(jsonl(events())))
})
test('Codex adapter reports output-file filesystem failures without treating them as missing output', async () => {
  const backend = createCodexEvaluationBackend({ config: config(), instructions: 'fixture instructions', schema, validate,
    launcher: { command: 'fixture', prefix: [] }, runProcess: async options => {
      await mkdir(options.args[options.args.indexOf('--output-last-message') + 1])
      return successProcess()
    } })
  await assert.rejects(backend.evaluate({ input: {} }))
})
