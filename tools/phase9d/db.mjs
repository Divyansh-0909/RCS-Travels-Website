import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { startPostgisTestEnvironment } from '../../backend/tests/helpers/postgisEnvironment.js';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from '../../backend/tests/helpers/phase9Isolation.js';
const historical = process.argv[2] === 'historical';
const output = resolve(process.env.PHASE9D_OUTPUT ?? 'output/phase9d-1-2026-10-12');
if (!['output/phase9d-1-2026-10-12', 'output/phase9d-1-continuation-2026-10-13'].some(path => resolve(path) === output)) throw new Error('Unowned evidence output');
const environment = await startPostgisTestEnvironment();
try {
  const inherited = Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const files = historical ? ['tests/integration/phase5DeferredPostgisValidation.test.js','tests/integration/phase7ShadowAdjudicationPostgres.test.js'] : ['tests/integration/phase9dReadiness.test.js'];
  console.log(JSON.stringify({postgres:environment.postgresVersion,postgis:environment.postgisVersion,pgvector:environment.vectorVersion,imageRecipeHash:environment.imageRecipeHash,isolated:true}));
  const child = spawn(process.execPath,['--import','./tests/helpers/phase9Isolation.js','--import','tsx','--test','--test-reporter=tap','--test-concurrency=1',...files],{cwd:resolve('backend'),windowsHide:true,stdio:'inherit',env:{...inherited,NODE_ENV:'test',PHASE9_ISOLATED:'1',TEST_DATABASE_URL:environment.connectionString,DATABASE_URL:PHASE9_FORBIDDEN_DATABASE,DIRECT_URL:PHASE9_FORBIDDEN_DATABASE,DOTENV_CONFIG_PATH:PHASE9_EMPTY_ENV,PHASE9D_OUTPUT:output,...(process.env.NODE_V8_COVERAGE?{NODE_V8_COVERAGE:process.env.NODE_V8_COVERAGE}:{})}});
  process.exitCode = await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail)}) ?? 1;
} finally { await environment.stop(); }
