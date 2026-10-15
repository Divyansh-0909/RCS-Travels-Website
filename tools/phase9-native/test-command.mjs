import { access, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const repository = process.env.RCS_PHASE9_REPOSITORY_ROOT;
if (!repository) throw new Error('Native mutation runner requires an explicit repository root');
const dependencies = join(process.cwd(),'backend/node_modules');
try { await access(dependencies); }
catch { await symlink(join(repository,'backend/node_modules'),dependencies,'junction'); }
const child = spawn(process.execPath,['--import','./backend/tests/helpers/phase9UnitIsolation.js','--import',
  './backend/node_modules/tsx/dist/loader.mjs','--test','--test-timeout=12000','backend/tests/phase9NativeInfrastructure.test.js','backend/tests/phase9NativeTransport.test.js','backend/tests/phase9PhoneAwake.test.js'],
  { windowsHide: true,stdio:'inherit' });
child.once('error',error => { throw error; });
child.once('close',code => { process.exitCode = code; });
