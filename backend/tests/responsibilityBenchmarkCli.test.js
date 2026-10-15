import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execute = promisify(execFile)

test('real benchmark CLI writes an empty read-only run and rejects a corrupted frozen hash before inference', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'rcs-phase8-cli-'))
  const args = ['--import', './tests/helpers/responsibilityBenchmarkCliProbe.mjs', './benchmarks/responsibility/run.js', `--output=${outputDir}`]
  const env = { ...process.env, TYPESAFE_API_KEY: 'phase8-test-key' }
  delete env.DATABASE_URL
  delete env.DIRECT_URL
  try {
    const success = await execute(process.execPath, [...args, '--source=real', '--run-id=cli'], { env, windowsHide: true })
    const result = JSON.parse(success.stdout)
    assert.equal(result.cases, 0)
    assert.equal(result.records, 0)
    assert.equal(result.evaluation.labeledCases, 0)
    assert.equal(result.config.source, 'real')
    assert.equal(result.config.baselineModelOverride, null)
    assert.deepEqual(result.config.inferenceSettings, { timeoutMs: 60000, maxRetries: 0 })
    const summaries = (await readFile(result.summary, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(summaries[0].records, 0)
    const frozen = await execute(process.execPath, [...args, '--source=frozen', '--run-id=frozen-cli', '--existing-model=gpt-5-mini-2025-08-07'], { env, windowsHide: true })
    const frozenResult = JSON.parse(frozen.stdout)
    assert.equal(frozenResult.cases, 56)
    assert.equal(frozenResult.config.baselineModelOverride, 'gpt-5-mini-2025-08-07')
    assert.equal(frozenResult.config.existing.model, 'gpt-5-mini-2025-08-07')
    assert.equal(frozenResult.evaluation.existing.failures.errors, 0)
    assert.equal(frozenResult.evaluation.jev.failures.errors, 0)
    assert.equal(frozenResult.config.jev.configuration.questionsHash, 'acd405820422d6eb4df25effbaa2a8f2da00ee6c7c01839b0e1242685c65409f')
    await assert.rejects(execute(process.execPath, [...args, '--source=frozen'], {
      env: { ...env, PHASE8_TEST_BAD_HASH: '1' }, windowsHide: true,
    }), error => error.stderr.includes('RESPONSIBILITY_BENCHMARK_DATASET_HASH_MISMATCH'))
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
