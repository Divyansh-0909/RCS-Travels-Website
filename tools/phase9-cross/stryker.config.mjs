import { fileURLToPath } from 'node:url';
import { criticalFiles, mutationGroups } from './scope.mjs';
process.env.RCS_PHASE9_REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const group = process.env.PHASE9_MUTATION_GROUP;
const reportLabel = process.env.PHASE9_MUTATION_REPORT_LABEL ?? 'initial';
if (!/^[a-z-]+$/.test(reportLabel)) throw new Error('Invalid mutation report label');
if (group && !Object.hasOwn(mutationGroups, group)) throw new Error('Unknown mutation group');
export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node tools/phase9-cross/test-command.mjs' + (group ? ' ' + group : '') },
  mutate: group ? mutationGroups[group].files : criticalFiles,
  ignorePatterns: ['**/node_modules/**', '**/.env', '**/.env.*', '.*', '**/.*', 'output', 'docs',
    'plugins', 'decisions', 'ds-bundle', 'legal-review', 'screenshots', 'search_assignment',
    'temporary screenshots', 'test-results', 'tmp', 'backend/{coverage,uploads,rcs-rag}',
    'frontend/{dist,public}', 'driver-app/{android,assets}'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: 'output/phase9-cross-application-2026-10-11/mutation-' + (group ?? 'all') + '-' + reportLabel + '.json' },
  concurrency: 1, timeoutMS: 30000, timeoutFactor: 3, cleanTempDir: true,
};
