import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { verifyBaseline, output, hash } from './baseline.mjs';

const root = resolve(import.meta.dirname, '../..');
const mode = process.argv[2] ?? 'unit';
const quality = join(tmpdir(), 'rcs-phase1-quality-tools/node_modules');
const commands = {
  unit: { cwd: join(root, 'backend'), args: ['--test','--test-reporter=tap','tests/phase9dReadiness.test.js'] },
  full: { cwd: join(root, 'backend'), args: ['--import','tsx','--test','--test-reporter=tap','--test-concurrency=4','tests/*.test.js'] },
  typecheck: { cwd: join(root, 'backend'), args: ['node_modules/typescript/bin/tsc','--noEmit'] },
  db: { cwd: root, args: ['tools/phase9d/db.mjs'] },
  phase9: { cwd: root, args: ['backend/tests/run-phase9.js'] },
  replay: { cwd: root, args: ['backend/tests/run-phase9.js','--replay'] },
  historical: { cwd: root, args: ['tools/phase9d/db.mjs','historical'] },
  cross: { cwd: root, args: ['backend/tests/run-phase9-cross-db.js','cross'] },
  lint: { cwd: root, args: [join(quality,'eslint/bin/eslint.js'),'--config','tools/phase9d/eslint.config.mjs','tools/phase9d','backend/tests/phase9dReadiness.test.js','backend/tests/integration/phase9dReadiness.test.js'] },
  coverage: { cwd: root, args: [join(quality,'c8/bin/c8.js'),'--all','--src=tools/phase9d','--extension=.mjs','--reporter=json','--reporter=json-summary','--reporter=text','--report-dir='+resolve(output,'coverage'),'--temp-directory='+resolve(output,'coverage-raw'),'--include=tools/phase9d/privacy.mjs','--include=tools/phase9d/repository.mjs',process.execPath,'--test','--test-reporter=tap','backend/tests/phase9dReadiness.test.js'] },
};
if (!Object.hasOwn(commands,mode)) throw new Error('Unknown Phase 9D verification mode');
await mkdir(output,{recursive:true});
const baseline = await verifyBaseline();
const run = mode+'-'+Date.now()+'-'+randomUUID();
const sourceFiles = ['tools/phase9d/permissions.sql','tools/phase9d/privacy.mjs','tools/phase9d/repository.mjs','tools/phase9d/run.mjs','tools/phase9d/db.mjs','tools/phase9d/worker.mjs','backend/tests/phase9dReadiness.test.js','backend/tests/integration/phase9dReadiness.test.js'];
const sources = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file,hash(await readFile(join(root,file)))])));
const before = await sources();
const {cwd,args} = commands[mode];
const inherited = Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const env = {...inherited,NODE_ENV:'test',DOTENV_CONFIG_PATH:join(root,'backend/tests/helpers/phase9-empty.env'),DATABASE_URL:'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden',DIRECT_URL:'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden'};
const started = new Date().toISOString();
const child = spawn(process.execPath,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env});
let log = '';
child.stdout.on('data',b=>{log+=b}); child.stderr.on('data',b=>{log+=b});
const code = await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail)});
log = log.replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g,'[key-redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[jwt-redacted]').replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]');
await writeFile(join(output,run+'.log'),log,{flag:'wx'});
const record = {run,mode,started,finished:new Date().toISOString(),code,sources:before,sourcesUnchanged:JSON.stringify(before)===JSON.stringify(await sources()),baseline,summary:log.split('\n').filter(l=>/^# (tests|pass|fail|skipped|duration_ms)|error TS|Error:/.test(l)).slice(-12)};
await writeFile(join(output,run+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
console.log(JSON.stringify({run,code,sourcesUnchanged:record.sourcesUnchanged,summary:record.summary}));
process.exitCode = code || (record.sourcesUnchanged?0:1);
