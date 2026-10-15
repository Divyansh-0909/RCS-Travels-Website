import { criticalFiles } from './scope.mjs';
const label = process.env.AUTH_MUTATION_LABEL ?? 'final';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid mutation report label');
export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --test backend/tests/liveSession.test.js backend/tests/authMiddleware.test.js backend/tests/sessionLogout.test.js' },
  mutate: criticalFiles,
  ignorePatterns: ['**/node_modules/**', '**/.env', '**/.env.*', '.*', '**/.*', 'output', 'docs',
    'plugins', 'decisions', 'ds-bundle', 'legal-review', 'screenshots', 'search_assignment',
    'temporary screenshots', 'test-results', 'tmp', 'backend/{coverage,uploads,rcs-rag}',
    'frontend/{dist,public}', 'driver-app/{android,assets}'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: 'output/session-revocation-2026-10-12/mutation-' + label + '.json' },
  concurrency: 2, timeoutMS: 10000, timeoutFactor: 2, cleanTempDir: true,
};
