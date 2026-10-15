import { readFileSync } from 'node:fs'
import base from './stryker.owner-policy-development.config.mjs'
const report = JSON.parse(readFileSync(new URL('../../coverage/owner-policy-development-mutation.json', import.meta.url), 'utf8'))
const ranges = Object.entries(report.files).flatMap(([file, detail]) => [...new Set(detail.mutants
  .filter(mutant => ['Survived', 'Timeout', 'NoCoverage'].includes(mutant.status)).map(mutant => `${file}:${mutant.location.start.line}-${mutant.location.end.line}`))])
export default { ...base,
  commandRunner: { command: `${base.commandRunner.command} tests/responsibilityDevelopmentCache.test.js` },
  mutate: [...ranges, 'benchmarks/responsibility/developmentCache.js'],
  jsonReporter: { fileName: 'coverage/owner-policy-witness-mutation.json' },
}
