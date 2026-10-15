import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const scope = JSON.parse(readFileSync(resolve(root, 'output/phase9-final-integration-2026-10-09/critical-scope.json')))
const included = new Set(scope.files.map(file => resolve(root, file).toLowerCase()))
const raw = resolve(process.argv[2]), copy = resolve(process.argv[3])
assert.notEqual(raw, copy, 'the original V8 files must remain untouched')
mkdirSync(copy, { recursive: true })
const sha = value => createHash('sha256').update(value).digest('hex')
const matches = url => {
  try { return included.has(resolve(fileURLToPath(url)).toLowerCase()) } catch { return false }
}
const files = []
for (const name of readdirSync(raw).filter(name => /^coverage-.*\.json$/.test(name))) {
  const bytes = readFileSync(join(raw, name)), original = JSON.parse(bytes)
  const result = original.result.filter(script => matches(script.url))
  const maps = Object.fromEntries(Object.entries(original['source-map-cache'] ?? {}).filter(([url]) => matches(url)))
  // Keep every scoped counter and source map verbatim; skip unrelated CLI/SDK scripts in this report copy.
  const curated = { ...original, result, ...(original['source-map-cache'] ? { 'source-map-cache': maps } : {}) }
  writeFileSync(join(copy, name), JSON.stringify(curated))
  files.push({ name, rawSha256: sha(bytes), scopedCountersSha256: sha(JSON.stringify(result)),
    scopedMapsSha256: sha(JSON.stringify(maps)), keptScripts: result.length, omittedScripts: original.result.length - result.length })
}
writeFileSync(`${copy}-manifest.json`, JSON.stringify({ schema: 'phase9-v8-report-copy-v1',
  originalFilesChanged: false, scope: scope.files, files }, null, 2))
console.log(`Report copy: ${files.length} original V8 files; all scoped counters/maps retained; original files unchanged.`)
