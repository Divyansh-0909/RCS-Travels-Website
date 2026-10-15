import { fileURLToPath } from 'node:url';
process.env.RCS_PHASE9_REPOSITORY_ROOT = fileURLToPath(new URL('../../',import.meta.url));
export default {
  testRunner:'command',coverageAnalysis:'off',tsconfigFile:'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner:{ command:'node tools/phase9-native/test-command.mjs' },
  mutate:['tools/phase9-native/device.mjs','tools/phase9-native/stage.mjs','tools/phase9-native/transport.mjs',
    'tools/phase9-native/metro-loopback.cjs','tools/phase9-native/metro-dependencies.cjs','tools/phase9-native/path.mjs',
    'tools/phase9-native/phone-awake-core.mjs','backend/tests/helpers/phase9NativeGateway.js',
    'backend/tests/helpers/phase9NativeClerkEnvironment.js'],
  ignorePatterns:['**/node_modules/**','**/.env','**/.env.*','.*','**/.*','output','docs','frontend','driver-app','shared','plugins',
    'decisions','ds-bundle','legal-review','screenshots','search_assignment','temporary screenshots','test-results','tmp',
    'backend/{benchmarks,config,constants,coverage,data,db,hosting,lib,middleware,prisma,rcs-rag,routes,scripts,services}',
    'backend/tests/{e2e,fixtures,integration}'],
  reporters:['clear-text','json'],jsonReporter:{ fileName:'output/phase9-native-device-2026-10-10/mutation.json' },
  concurrency:1,timeoutMS:30000,timeoutFactor:4,cleanTempDir:true,
};
