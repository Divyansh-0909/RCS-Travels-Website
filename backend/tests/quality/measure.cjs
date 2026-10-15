#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')

const repositoryRoot = path.resolve(__dirname, '../../..')
const toolDirectory = process.env.RCS_QUALITY_TOOLS_DIR
  || path.join(os.tmpdir(), 'rcs-phase1-quality-tools')
const coverageArgument = process.argv.indexOf('--coverage')
const outputArgument = process.argv.indexOf('--output')
const coveragePath = coverageArgument === -1 ? null : path.resolve(process.argv[coverageArgument + 1])
const outputPath = outputArgument === -1 ? null : path.resolve(process.argv[outputArgument + 1])

const requireTool = (name) => require(path.join(toolDirectory, 'node_modules', name))
const { parse } = requireTool('@babel/parser')
const escomplex = requireTool('typhonjs-escomplex')
const { ESLint } = requireTool('eslint')
const sonarjs = requireTool('eslint-plugin-sonarjs')

const defaultScopedFiles = [
  'backend/lib/clock.js',
  'backend/services/driverDelay.js',
  'backend/services/cancellationLocationEvidence.js',
  'backend/services/notificationProvenance.js',
  'backend/services/routeProvenance.js',
  'backend/config/razorpayX.js',
  'backend/routes/razorpayXWebhook.js',
  'backend/services/driverPayouts.js',
  'backend/services/payments.js',
  'backend/services/providerReconciliation.js',
  'backend/services/razorpay.js',
  'backend/services/razorpayXPayoutWebhook.js',
  'backend/services/refundProviderState.js',
  'backend/tests/helpers/database.js',
  'backend/tests/helpers/paymentDb.js',
  'backend/tests/helpers/paymentDefaultNotificationProbe.mjs',
  'backend/tests/helpers/payoutWebhookDbProbe.mjs',
  'backend/tests/helpers/financialInvariants.js',
  'backend/tests/helpers/scheduledScenario.js',
  'backend/tests/helpers/testClock.js',
  'backend/tests/helpers/driverDelayProbe.mjs',
  'backend/tests/helpers/providerPlan.js',
  'backend/tests/helpers/postgisEnvironment.js',
  'backend/tests/helpers/postgisPrerequisites.js',
  'backend/tests/helpers/razorpayFake.js',
  'backend/tests/helpers/razorpayXFake.js',
  'backend/tests/helpers/routingEvidence.js',
  'backend/tests/helpers/locationEvidence.js',
  'backend/tests/helpers/connectivityEvidence.js',
  'backend/tests/helpers/notificationSink.js',
  'backend/tests/helpers/responsibilityEvidence.js',
  'backend/services/responsibilityEvidence.js',
  'backend/services/responsibilityContracts.js',
  'backend/services/responsibilityAnalyst.js',
  'backend/services/responsibilityCaseState.js',
  'backend/services/responsibilityPolicyGate.js',
  'backend/services/responsibilityDecisionRepository.js',
  'backend/services/responsibilityDecisionService.js',
  'backend/tests/helpers/settlementBoundary.js',
  'backend/tests/clock.test.js',
  'backend/tests/databaseHarness.test.js',
  'backend/tests/financialInvariants.test.js',
  'backend/tests/scheduledScenario.test.js',
  'backend/tests/integration/databaseHarness.test.js',
  'backend/tests/integration/scheduledScenario.test.js',
  'backend/tests/integration/paymentReliability.test.js',
  'backend/tests/payments.test.js',
  'backend/tests/paymentRefunds.test.js',
  'backend/tests/paymentMutationGaps.test.js',
  'backend/tests/payoutBatchExecution.test.js',
  'backend/tests/payoutWebhook.test.js',
  'backend/tests/payoutWebhookDbIsolation.test.js',
  'backend/tests/razorpayBoundary.test.js',
  'backend/tests/providerReconciliation.test.js',
  'backend/tests/refundGateway.test.js',
  'backend/tests/refundProviderState.test.js',
  'backend/tests/providerFakes.test.js',
  'backend/tests/providerFakes.edges.test.js',
  'backend/tests/phase3Evidence.test.js',
  'backend/tests/responsibilityEvidence.test.js',
  'backend/tests/postgisPrerequisites.test.js',
  'backend/tests/run-db-integration.js',
  'backend/tests/prisma.config.js',
  'backend/tests/quality/measure.cjs',
  'backend/tests/quality/stryker.config.mjs',
  'backend/tests/quality/stryker.phase2a.config.mjs',
  'backend/tests/quality/stryker.phase2.config.mjs',
  'backend/tests/quality/stryker.phase2-5.config.mjs',
  'backend/tests/quality/stryker.phase2-signoff.config.mjs',
  'backend/tests/quality/stryker.payments-gaps.config.mjs',
  'backend/tests/quality/stryker.payment-errors.config.mjs',
  'backend/tests/quality/stryker.payment-debt.config.mjs',
  'backend/tests/quality/stryker.payment-effect-boundary.config.mjs',
  'backend/tests/quality/stryker.payout-db-boundary.config.mjs',
  'backend/tests/quality/stryker.phase4.config.mjs',
  'backend/tests/quality/eslint.config.mjs',
]

const scopedFiles = process.env.RCS_QUALITY_SCOPED_FILES
  ? process.env.RCS_QUALITY_SCOPED_FILES.split(',').map((file) => file.trim()).filter(Boolean)
  : defaultScopedFiles

const isNode = (value) => value && typeof value.type === 'string'
const functionNodes = (node, found = []) => {
  if (!isNode(node)) return found
  if (['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression', 'ObjectMethod', 'ClassMethod'].includes(node.type)) {
    found.push(node)
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => functionNodes(item, found))
    else if (isNode(value)) functionNodes(value, found)
  }
  return found
}

const coverageFor = (coverage, file, method) => {
  if (!coverage) return null
  const entry = Object.entries(coverage).find(([coveredFile]) => path.resolve(coveredFile) === file)
  if (!entry) return null
  const [, data] = entry
  const statements = Object.entries(data.statementMap)
    .filter(([, location]) => location.start.line >= method.lineStart && location.start.line <= method.lineEnd)
  if (!statements.length) return null
  const covered = statements.filter(([key]) => data.s[key] > 0).length
  return { covered, total: statements.length, percent: (covered / statements.length) * 100 }
}

const cognitiveComplexityByLine = async (file, strippedSource) => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.{js,jsx,cjs,mjs}'],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { sonarjs },
      rules: { 'sonarjs/cognitive-complexity': ['error', 0] },
    }],
  })
  const [result] = strippedSource === undefined ? await eslint.lintFiles([file])
    : await eslint.lintText(strippedSource, { filePath: `${file}.js` })
  return new Map(result.messages
    .filter((message) => message.ruleId === 'sonarjs/cognitive-complexity')
    .map((message) => [message.line, Number(message.message.match(/from (\d+) to/)?.[1])]))
}

const cyclomaticComplexityByLine = async (file, strippedSource) => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.{js,jsx,cjs,mjs}'],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: { complexity: ['error', { max: 0, variant: 'classic' }] },
    }],
  })
  const [result] = strippedSource === undefined ? await eslint.lintFiles([file])
    : await eslint.lintText(strippedSource, { filePath: `${file}.js` })
  return new Map(result.messages
    .filter((message) => message.ruleId === 'complexity')
    .map((message) => [message.line, Number(message.message.match(/complexity of (\d+)/)?.[1])]))
}

const toolTraitCheck = async () => {
  const source = `export function loops(values) {
    for (const value of values) {}
    for (const value of values) {}
    for (const value of values) {}
    for (const value of values) {}
    for (const value of values) {}
    return values?.[0] ?? null
  }`
  const typhonMethod = escomplex.analyzeModule(source, { loc: true }).methods[0]
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.js'],
      rules: { complexity: ['error', { max: 0, variant: 'classic' }] },
    }],
  })
  const [result] = await eslint.lintText(source, { filePath: 'trait-fixture.js' })
  const eslintCyclomatic = Number(result.messages
    .find((message) => message.ruleId === 'complexity')?.message.match(/complexity of (\d+)/)?.[1])

  return {
    typhonCyclomatic: typhonMethod.cyclomatic,
    typhonErrors: typhonMethod.errors,
    eslintCyclomatic,
    warning: 'Typhon undercounts for-of loops; ESLint is the authoritative cyclomatic metric. Typhon Halstead is advisory because it emits no unsupported-node warning.',
  }
}

const measureFile = async (relativeFile, coverage) => {
  const file = path.join(repositoryRoot, relativeFile)
  const source = fs.readFileSync(file, 'utf8')
  const strippedSource = relativeFile.endsWith('.ts') ? stripTypeScriptTypes(source, { mode: 'strip' }) : undefined
  const parserOptions = { sourceType: 'module', plugins: ['jsx'] }
  const ast = parse(strippedSource ?? source, parserOptions)
  const parsedFunctions = functionNodes(ast.program)
  const wholeModuleMethods = escomplex.analyzeModuleAST(ast, { loc: true }).methods
  // Typhon misses callbacks nested in for-of iterable expressions. Measure each
  // Babel-discovered function independently so no callback or class method vanishes.
  const measurementSource = strippedSource ?? source
  const typhonMethods = parsedFunctions.map(node => {
    const snippet = measurementSource.slice(node.start, node.end)
    const wrapper = node.type === 'ObjectMethod' ? `const measured = ${node.async ? 'async ' : ''}function${node.generator ? '*' : ''}${snippet.slice(snippet.indexOf('('))};`
      : node.type === 'ClassMethod' ? `class Measured extends Object { ${snippet} }`
        : `const measured = ${snippet};`
    const method = escomplex.analyzeModule(wrapper, { loc: true }, parserOptions).methods[0]
    if (!method) throw new Error(`Unmeasured function: ${relativeFile}:${node.loc.start.line}`)
    return { ...method, lineStart: node.loc.start.line, lineEnd: node.loc.end.line }
  })
  const cognitive = await cognitiveComplexityByLine(file, strippedSource)
  const cyclomatic = await cyclomaticComplexityByLine(file, strippedSource)

  const methods = typhonMethods.map((method) => {
    const statementCoverage = coverageFor(coverage, file, method)
    const diagnosticLine = cyclomatic.has(method.lineStart)
      ? method.lineStart
      : [...cyclomatic.keys()]
        .filter((line) => line >= method.lineStart && line <= method.lineEnd)
        .sort((left, right) => left - right)[0]
    if (diagnosticLine === undefined) {
      console.error(`${relativeFile}:${method.lineStart}: ESLint did not report cyclomatic complexity`)
    }
    const cc = diagnosticLine === undefined ? undefined : cyclomatic.get(diagnosticLine)
    const coverageFraction = statementCoverage ? statementCoverage.percent / 100 : null
    return {
      name: method.name,
      lineStart: method.lineStart,
      lineEnd: method.lineEnd,
      cyclomatic: cc,
      cognitive: cognitive.get(method.lineStart) ?? 0,
      halsteadVolume: method.halstead.volume,
      halsteadDifficulty: method.halstead.difficulty,
      statementCoverage,
      crap: Number.isFinite(coverageFraction) ? cc ** 2 * (1 - coverageFraction) ** 3 + cc : null,
    }
  })

  return {
    file: relativeFile,
    physicalLines: source.split(/\r?\n/).length,
    babelFunctionCount: parsedFunctions.length,
    typhonFunctionCount: typhonMethods.length,
    wholeModuleTyphonFunctionCount: wholeModuleMethods.length,
    independentlyMeasuredFunctions: true,
    methods,
  }
}

const main = async () => {
  const coverage = coveragePath ? JSON.parse(fs.readFileSync(coveragePath, 'utf8')) : null
  const [files, traitCheck] = await Promise.all([
    Promise.all(scopedFiles.map((file) => measureFile(file, coverage))),
    toolTraitCheck(),
  ])
  const report = {
    tools: { babelParser: true, typhonjsEscomplex: true, eslintSonarjs: true },
    coveragePath,
    scopedFiles,
    traitCheck,
    files,
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (outputPath) fs.writeFileSync(outputPath, serialized)
  else process.stdout.write(serialized)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
