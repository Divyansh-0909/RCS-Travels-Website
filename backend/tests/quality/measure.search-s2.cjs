#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '../../..')
const backendRoot = path.join(repositoryRoot, 'backend')
const toolDirectory = process.env.RCS_QUALITY_TOOLS_DIR
  || path.join(os.tmpdir(), 'rcs-phase1-quality-tools')
const coverageArgument = process.argv.indexOf('--coverage')
const outputArgument = process.argv.indexOf('--output')
const coveragePath = coverageArgument === -1 ? null : path.resolve(process.argv[coverageArgument + 1])
const outputPath = outputArgument === -1 ? null : path.resolve(process.argv[outputArgument + 1])

const requireTool = (name) => require(path.join(toolDirectory, 'node_modules', name))
const { parse } = requireTool('@babel/parser')
const { transformFromAstSync } = requireTool('@babel/core')
const transformTypeScript = requireTool('@babel/plugin-transform-typescript')
const escomplex = requireTool('typhonjs-escomplex')
const { ESLint } = requireTool('eslint')
const sonarjs = requireTool('eslint-plugin-sonarjs')
const tsParser = require(path.join(repositoryRoot, 'frontend/node_modules/@typescript-eslint/parser/dist/index.js'))

const limits = { cyclomatic: 21, cognitive: 21, halsteadDifficulty: 79.999999, physicalLines: 499, crap: 24.999999 }
const defaultScopedFiles = [
  ...fs.readdirSync(path.join(backendRoot, 'services/search'))
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => `backend/services/search/${file}`),
  'backend/lib/scheduling.js',
]
const scopedFiles = process.env.RCS_QUALITY_SCOPED_FILES
  ? process.env.RCS_QUALITY_SCOPED_FILES.split(',').map((file) => file.trim()).filter(Boolean)
  : defaultScopedFiles

const isNode = (value) => value && typeof value.type === 'string'
const functionNodes = (node, found = []) => {
  if (!isNode(node)) return found
  if (['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression', 'ObjectMethod', 'ClassMethod'].includes(node.type)) found.push(node)
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

const eslintFor = (isTypeScript) => new ESLint({
  overrideConfigFile: true,
  overrideConfig: [{
    files: [isTypeScript ? '**/*.ts' : '**/*.js'],
    languageOptions: isTypeScript ? {
      parser: tsParser,
      parserOptions: { project: path.join(backendRoot, 'tsconfig.json'), tsconfigRootDir: backendRoot },
    } : {},
    plugins: { sonarjs },
    rules: {
      complexity: ['error', { max: 0, variant: 'classic' }],
      'sonarjs/cognitive-complexity': ['error', 0],
    },
  }],
})

const complexityByLine = async (file, isTypeScript) => {
  const [result] = await eslintFor(isTypeScript).lintFiles([file])
  const cyclomatic = new Map(result.messages
    .filter((message) => message.ruleId === 'complexity')
    .map((message) => [message.line, Number(message.message.match(/complexity of (\d+)/)?.[1])]))
  const cognitive = new Map(result.messages
    .filter((message) => message.ruleId === 'sonarjs/cognitive-complexity')
    .map((message) => [message.line, Number(message.message.match(/from (\d+) to/)?.[1])]))
  return { cyclomatic, cognitive, parsingErrors: result.messages.filter((message) => !message.ruleId) }
}

const runtimeAst = (source, relativeFile) => {
  const sourceAst = parse(source, { sourceType: 'module', plugins: ['typescript'] })
  const transformed = transformFromAstSync(sourceAst, source, {
    ast: false, babelrc: false, configFile: false, filename: relativeFile, retainLines: true,
    plugins: [[transformTypeScript, { allowDeclareFields: true }]],
  })
  return parse(transformed.code, { sourceType: 'module' })
}

const violationsFor = (method) => Object.entries(limits)
  .filter(([key, limit]) => method[key] !== null && method[key] !== undefined && method[key] > limit)
  .map(([key, limit]) => ({ metric: key, limit, actual: method[key] }))

// Babel stores regex pattern/flags directly. Typhon's regex formatter expects
// the ESTree metadata too; retain both without changing the measured code.
const addRegexMetadata = (node) => {
  if (!isNode(node)) return
  if (node.type === 'RegExpLiteral') node.regex = { pattern: node.pattern, flags: node.flags }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(addRegexMetadata)
    else if (isNode(value)) addRegexMetadata(value)
  }
}

// Typhon omits async object methods. Analyze each runtime function explicitly,
// retaining its original body and source locations, including class constructors.
const halsteadForFunction = (node) => {
  addRegexMetadata(node)
  const fn = { ...node, type: node.type === 'ArrowFunctionExpression' ? node.type : 'FunctionExpression' }
  const ast = { type: 'File', loc: node.loc, program: { type: 'Program', loc: node.loc, sourceType: 'module', body: [
    { type: 'ExpressionStatement', expression: fn, loc: node.loc },
  ] } }
  const method = escomplex.analyzeModuleAST(ast, { loc: true }).methods[0]
  if (!method) throw new Error(`Halstead did not measure function at ${node.loc.start.line}`)
  return { ...method, lineStart: node.loc.start.line, lineEnd: node.loc.end.line }
}

const measureFile = async (relativeFile, coverage) => {
  const file = path.join(repositoryRoot, relativeFile)
  const source = fs.readFileSync(file, 'utf8')
  const isTypeScript = relativeFile.endsWith('.ts')
  const typedAst = isTypeScript
    ? tsParser.parseForESLint(source, {
      filePath: file, project: path.join(backendRoot, 'tsconfig.json'), tsconfigRootDir: backendRoot,
    }).ast
    : parse(source, { sourceType: 'module' }).program
  const erasedAst = isTypeScript ? runtimeAst(source, relativeFile).program : typedAst
  const typedFunctions = functionNodes(typedAst)
  const erasedFunctions = functionNodes(erasedAst)
  const typhonMethods = erasedFunctions.map(halsteadForFunction)
  const countMismatch = typedFunctions.length !== erasedFunctions.length || erasedFunctions.length !== typhonMethods.length
  if (countMismatch) console.error(`${relativeFile}: typed AST ${typedFunctions.length}, erased runtime AST ${erasedFunctions.length}, Typhon ${typhonMethods.length} functions`)
  const { cyclomatic, cognitive, parsingErrors } = await complexityByLine(file, isTypeScript)
  if (parsingErrors.length) console.error(`${relativeFile}: ESLint parser errors: ${parsingErrors.map((message) => message.message).join('; ')}`)

  const methods = typhonMethods.map((method) => {
    const diagnosticLine = cyclomatic.has(method.lineStart)
      ? method.lineStart
      : [...cyclomatic.keys()].filter((line) => line >= method.lineStart && line <= method.lineEnd).sort((a, b) => a - b)[0]
    if (diagnosticLine === undefined) console.error(`${relativeFile}:${method.lineStart}: ESLint did not report cyclomatic complexity`)
    const cc = diagnosticLine === undefined ? null : cyclomatic.get(diagnosticLine)
    const statementCoverage = coverageFor(coverage, file, method)
    const coverageFraction = statementCoverage ? statementCoverage.percent / 100 : null
    const measured = {
      name: method.name, lineStart: method.lineStart, lineEnd: method.lineEnd,
      cyclomatic: cc, cognitive: cognitive.get(method.lineStart) ?? 0,
      halsteadVolume: method.halstead.volume, halsteadDifficulty: method.halstead.difficulty,
      statementCoverage,
      crap: Number.isFinite(coverageFraction) && cc !== null ? cc ** 2 * (1 - coverageFraction) ** 3 + cc : null,
    }
    return { ...measured, violations: violationsFor(measured) }
  })
  const physicalLines = source.split(/\r?\n/).length
  return {
    file: relativeFile, physicalLines, physicalLineViolation: physicalLines > limits.physicalLines,
    typedAstFunctionCount: typedFunctions.length, erasedRuntimeFunctionCount: erasedFunctions.length,
    typhonFunctionCount: typhonMethods.length, countMismatch, methods,
  }
}

const main = async () => {
  const coverage = coveragePath ? JSON.parse(fs.readFileSync(coveragePath, 'utf8')) : null
  const files = await Promise.all(scopedFiles.map((file) => measureFile(file, coverage)))
  const failures = files.flatMap((file) => [
    ...(file.countMismatch ? [{ file: file.file, metric: 'function-count-mismatch' }] : []),
    ...(file.physicalLineViolation ? [{ file: file.file, metric: 'physicalLines', limit: limits.physicalLines, actual: file.physicalLines }] : []),
    ...file.methods.flatMap((method) => method.violations.map((violation) => ({ file: file.file, method: method.name, line: method.lineStart, ...violation }))),
  ])
  const report = {
    tools: { typescriptEstree: true, babelTypeErasure: true, typhonjsEscomplex: true, eslintSonarjs: true },
    limits, coveragePath, scopedFiles, files, failures,
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (outputPath) fs.writeFileSync(outputPath, serialized)
  else process.stdout.write(serialized)
  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
