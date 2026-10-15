import { prisma } from '../../db/prisma.js'
import { createHash } from 'node:crypto'
import { createOpenAIResponsibilityAnalyst, RESPONSIBILITY_ANALYST_INSTRUCTIONS } from '../../services/responsibilityAnalyst.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION } from '../../services/responsibilityContracts.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../../services/responsibilityPolicyGate.js'
import { RESPONSIBILITY_ANALYST_CONFIG_VERSION } from '../../services/responsibilityShadowConfig.js'
import {
  JEV_ADAPTER_VERSION,
  JEV_BINARY_THRESHOLD,
  JEV_BENCHMARK_CONFIGURATION,
  createAppendOnlyResponsibilityArtifactWriter,
  createJevResponsibilityAdapter,
  createReadOnlyResponsibilityBenchmarkLoader,
  createResponsibilityBenchmarkRunner,
} from './benchmark.js'
import {
  RESPONSIBILITY_BENCHMARK_DATASET_VERSION,
  RESPONSIBILITY_BENCHMARK_FROZEN_HASH,
  RESPONSIBILITY_BENCHMARK_SEED,
  buildFrozenResponsibilityBenchmarkDataset,
  responsibilityBenchmarkDatasetHash,
  splitResponsibilityBenchmark,
} from './dataset.js'
import { evaluateResponsibilityBenchmark } from './evaluation.js'

const argument = (argv, name) => argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
const integerArgument = (argv, name, fallback, { min = 0, max = 10_000 } = {}) => {
  const value = Number(argument(argv, name) ?? String(fallback))
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name.slice(2).toUpperCase().replaceAll('-', '_')}_INVALID`)
  }
  return value
}

const loadFrozen = splitName => {
  const dataset = buildFrozenResponsibilityBenchmarkDataset()
  const hash = responsibilityBenchmarkDatasetHash(dataset)
  if (hash !== RESPONSIBILITY_BENCHMARK_FROZEN_HASH) throw new Error('RESPONSIBILITY_BENCHMARK_DATASET_HASH_MISMATCH')
  const split = splitResponsibilityBenchmark(dataset)
  const cases = splitName === 'development' ? split.development : splitName === 'all' ? dataset : split.heldOut
  return { cases: [...cases], hash, split }
}

const selectConsistencyCases = (cases, count) => [...cases]
  .sort((left, right) => left.id.localeCompare(right.id))
  .slice(0, Math.min(count, cases.length))

const loadExistingClientModule = () => import('../../lib/openai.js')
const BENCHMARK_INFERENCE_SETTINGS = Object.freeze({ timeoutMs: 60_000, maxRetries: 0 })
const defaultExistingAnalystFactory = model => createOpenAIResponsibilityAnalyst({ model: model ?? undefined,
  clientModuleLoader: async () => {
    const { openai } = await loadExistingClientModule()
    return { openai: { responses: { parse: params => openai.responses.parse(params,
      { timeout: BENCHMARK_INFERENCE_SETTINGS.timeoutMs, maxRetries: BENCHMARK_INFERENCE_SETTINGS.maxRetries }) } } }
  } })
const defaultJevAdapterFactory = () => createJevResponsibilityAdapter({ timeout: BENCHMARK_INFERENCE_SETTINGS.timeoutMs })

export function parseResponsibilityBenchmarkOptions({ argv = process.argv.slice(2), env = process.env } = {}) {
  const outputDir = argument(argv, '--output') ?? env.RESPONSIBILITY_BENCHMARK_OUTPUT_DIR
  if (!outputDir) throw new Error('RESPONSIBILITY_BENCHMARK_OUTPUT_DIR_REQUIRED')
  const source = argument(argv, '--source') ?? 'frozen'
  const splitName = argument(argv, '--split') ?? 'heldout'
  if (!['frozen', 'real', 'all'].includes(source)) throw new Error('RESPONSIBILITY_BENCHMARK_SOURCE_INVALID')
  if (!['development', 'heldout', 'all'].includes(splitName)) throw new Error('RESPONSIBILITY_BENCHMARK_SPLIT_INVALID')
  return {
    outputDir,
    source,
    splitName,
    take: integerArgument(argv, '--take', 100, { min: 1 }),
    repeats: integerArgument(argv, '--repeats', 1, { min: 1, max: 10 }),
    consistencyCount: integerArgument(argv, '--consistency-count', 8, { max: 100 }),
    existingModel: argument(argv, '--existing-model'),
    runId: argument(argv, '--run-id') ?? undefined,
  }
}

export async function runResponsibilityBenchmark(options, dependencies = {}) {
  const {
    prismaClient = prisma,
    createExistingAnalyst = defaultExistingAnalystFactory,
    createJevAdapter = defaultJevAdapterFactory,
    createRunner = createResponsibilityBenchmarkRunner,
    createWriter = createAppendOnlyResponsibilityArtifactWriter,
    evaluate = evaluateResponsibilityBenchmark,
  } = dependencies
  const { outputDir, source, splitName, take, repeats, consistencyCount, runId, existingModel = null } = options

  let frozen = null
  const cases = []
  if (source === 'frozen' || source === 'all') {
    frozen = loadFrozen(splitName)
    cases.push(...frozen.cases)
  }
  if (source === 'real' || source === 'all') {
    cases.push(...await createReadOnlyResponsibilityBenchmarkLoader(prismaClient).load({ take }))
  }

  const existingAnalyst = createExistingAnalyst(existingModel)
  const jevAdapter = createJevAdapter()
  const runner = createRunner({ existingAnalyst, jevAdapter })
  const records = await runner.run(cases, { runNumber: 1 })
  if (repeats > 1) {
    const consistencyCases = selectConsistencyCases(cases, consistencyCount)
    for (let runNumber = 2; runNumber <= repeats; runNumber += 1) {
      records.push(...await runner.run(consistencyCases, { runNumber }))
    }
  }

  const evaluation = evaluate(records)
  const config = {
    baselineModelOverride: existingModel,
    inferenceSettings: BENCHMARK_INFERENCE_SETTINGS,
    datasetVersion: RESPONSIBILITY_BENCHMARK_DATASET_VERSION,
    datasetHash: frozen?.hash ?? null,
    pinnedDatasetHash: RESPONSIBILITY_BENCHMARK_FROZEN_HASH,
    splitSeed: RESPONSIBILITY_BENCHMARK_SEED,
    split: splitName,
    heldOutScenarioFamilies: frozen?.split.heldOutScenarioFamilies ?? [],
    source,
    existing: { provider: existingAnalyst.provider, model: existingAnalyst.model, configVersion: RESPONSIBILITY_ANALYST_CONFIG_VERSION,
      contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION,
      promptHash: createHash('sha256').update(RESPONSIBILITY_ANALYST_INSTRUCTIONS).digest('hex') },
    jev: { provider: jevAdapter.provider, model: jevAdapter.model, adapterVersion: JEV_ADAPTER_VERSION, binaryThreshold: JEV_BINARY_THRESHOLD,
      configuration: JEV_BENCHMARK_CONFIGURATION },
    policyVersion: DEFAULT_RESPONSIBILITY_POLICY.policyVersion,
    repeats,
    consistencyCaseCount: Math.min(consistencyCount, cases.length),
  }
  const writer = createWriter({ outputDir, runId })
  await writer.append(records, { config, evaluation })
  return { cases: cases.length, records: records.length, artifacts: writer.artifacts, summary: writer.summary, config, evaluation }
}

export async function main(input = {}) {
  const options = parseResponsibilityBenchmarkOptions(input)
  return runResponsibilityBenchmark(options, input.dependencies)
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().then(result => console.info(JSON.stringify(result))).finally(() => prisma.$disconnect())
}
