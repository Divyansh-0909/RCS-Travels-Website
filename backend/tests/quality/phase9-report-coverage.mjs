import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const scope = JSON.parse(readFileSync(resolve(root, 'output/phase9-final-integration-2026-10-09/critical-scope.json')))
const raw = resolve(process.argv[2]), report = resolve(process.argv[3])
const toolRoot = process.env.RCS_QUALITY_TOOLS_DIR ?? join(tmpdir(), 'rcs-phase1-quality-tools')
const result = spawnSync(process.execPath, [join(toolRoot, 'node_modules/c8/bin/c8.js'), 'report',
  '--all', '--src=.', '--extension=.js', '--extension=.ts', '--exclude=node_modules/**',
  `--temp-directory=${raw}`, `--report-dir=${report}`, '--reporter=json', '--reporter=json-summary',
  ...scope.files.map(file => `--include=${file.replace(/^backend\//, '')}`)],
{ cwd: resolve(root, 'backend'), stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
