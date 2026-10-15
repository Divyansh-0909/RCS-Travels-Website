import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { CODEX_MODEL, buildCodexArgs, digest, disabledFeatures, isolationConfig, isolatedEnvironment } from './config.js'
import { collectProcess } from './process.js'
import { eventIsSafe, failureCategory, observedCodexUsage, parseCodexEvents } from './events.js'

export function codexConfiguration({ cliVersion, instructions, schema, task }) {
  return { version: 'codex-inference-only-v1', backendId: 'luna-codex', model: CODEX_MODEL,
    executionSurface: 'codex-exec-chatgpt', cliVersion, task, promptHash: digest(instructions),
    schemaHash: digest(schema), isolation: isolationConfig, disabledFeatures,
    maxInputTokens: 30_000, maxOutputTokens: 4_000, timeoutMs: 120_000,
    apiEquivalent: false, monetaryCost: 'NOT_COMPARABLE_TO_API_TOKEN_BILLING' }
}
export function validateCodexResponse(result, lastMessage, validate, budget) {
  if (result.termination) throw new Error(result.termination)
  if (result.code !== 0) throw new Error(failureCategory(result.stdout + result.stderr))
  const parsed = parseCodexEvents(result.stdout)
  let output
  try {
    output = JSON.parse(lastMessage)
    if (!isDeepStrictEqual(output, JSON.parse(parsed.text))) throw new Error('MESSAGE_MISMATCH')
    output = validate(output)
  } catch { throw new Error('PROVIDER_SCHEMA_FAILURE') }
  if (parsed.usage.inputTokens > budget.maxInputTokens || parsed.usage.outputTokens > budget.maxOutputTokens) {
    throw new Error('PROVIDER_RESOURCE_BUDGET_EXCEEDED')
  }
  return { output, ...parsed }
}
export function createCodexEvaluationBackend({ config, instructions, schema, validate, launcher,
  env = process.env, runProcess = collectProcess, workspaceParent = tmpdir(), now = () => performance.now() }) {
  if (config.promptHash !== digest(instructions) || config.schemaHash !== digest(schema)) throw new Error('CODEX_CONFIGURATION_MISMATCH')
  return { id: 'luna-codex', config, configHash: digest(config),
    async evaluate({ input, signal }) {
      const cwd = await mkdtemp(join(workspaceParent, 'rcs-codex-case-'))
      const schemaPath = join(cwd, 'schema.json'), resultPath = join(cwd, 'result.json'), instructionsPath = join(cwd, 'instructions.txt')
      await Promise.all([writeFile(schemaPath, JSON.stringify(schema)), writeFile(instructionsPath, instructions)])
      const args = buildCodexArgs({ schemaPath, resultPath, instructionsPath })
      const started = now()
      const processResult = await runProcess({ command: launcher.command, args: [...launcher.prefix, ...args],
        cwd, env: isolatedEnvironment(env), stdin: JSON.stringify(input), signal,
        timeoutMs: config.timeoutMs, onEvent: eventIsSafe })
      const audit = { backendId: 'luna-codex', model: CODEX_MODEL, executionSurface: config.executionSurface,
        inputHash: digest(input), promptHash: config.promptHash, configHash: digest(config), schemaHash: config.schemaHash,
        latencyMs: now() - started, success: false, usage: observedCodexUsage(processResult.stdout),
        unexpectedToolCalls: processResult.termination === 'UNEXPECTED_TOOL_USE' ? 1 : 0 }
      let lastMessage = ''
      try { lastMessage = await readFile(resultPath, 'utf8') }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      const directory = join(cwd, 'outer-audit')
      await mkdir(directory)
      await Promise.all([writeFile(join(directory, 'events.jsonl'), processResult.stdout),
        writeFile(join(directory, 'stderr.txt'), processResult.stderr)])
      try {
        const response = validateCodexResponse(processResult, lastMessage, validate, config)
        return { ...audit, success: true, output: response.output, usage: response.usage,
          artifactDirectory: directory, unexpectedToolCalls: 0, error: null }
      } catch (error) {
        return { ...audit, artifactDirectory: directory, error: error.message, output: null }
      }
    },
  }
}
