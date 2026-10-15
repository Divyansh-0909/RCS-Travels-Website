import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RESPONSIBILITY_LUNA_SCHEMA } from '../../benchmarks/responsibility/lunaBaseline.js'
import { codexConfiguration } from '../../benchmarks/codex/adapter.js'

export const temp = () => mkdtemp(join(tmpdir(), 'rcs-codex-fixture-'))
export const output = Object.freeze({ responsibility: 'EXTERNAL_OR_UNCERTAIN', confidence: 0.7,
  evidenceSufficient: false, platformMateriallyContributed: false, externalCauseMaterial: false,
  needsHumanReview: true, severity: 'LOW' })
export const validate = value => RESPONSIBILITY_LUNA_SCHEMA.parse(value)
export const usage = { input_tokens: 100, output_tokens: 40, cached_input_tokens: 0 }
export function events(value = output, tokenUsage = usage) {
  return [{ type: 'thread.started', thread_id: 'fixture' }, { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'fixture', type: 'agent_message', text: JSON.stringify(value) } },
    { type: 'turn.completed', usage: tokenUsage }]
}
export const jsonl = values => values.map(value => JSON.stringify(value)).join('\n') + '\n'
export const successProcess = (value = output) => ({ code: 0, termination: null, stdout: jsonl(events(value)), stderr: '' })
export const schema = { type: 'object', properties: { fixture: { type: 'boolean' } } }
export const config = () => codexConfiguration({ cliVersion: 'fixture-cli', instructions: 'fixture instructions', schema, task: 'responsibility-development' })
export function fakeProcess(behavior) {
  const child = new EventEmitter()
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough()
  child.killCount = 0
  child.kill = () => { child.killCount++; queueMicrotask(() => child.emit('close', null)); return true }
  queueMicrotask(() => behavior(child))
  return child
}
export const verifiedPreflight = () => ({ status: 'VERIFIED', model: 'gpt-6-luna', cliVersion: 'fixture-cli',
  authentication: 'Logged in using ChatGPT', authRestriction: 'forced_login_method=chatgpt',
  providerRestriction: 'model_provider=openai', userConfigIgnored: true, sandbox: 'read-only',
  toolFeaturesDisabled: true, unexpectedToolCalls: 0, failure: null })
