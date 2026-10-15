import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { verifyBaseline,hash } from './baseline.mjs';
const child=spawn('git',['diff','--check'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});
const code=await new Promise((done,fail)=>{child.once('close',done);child.once('error',fail);});
// Git can print source text on errors. Retain status and bounded diagnostic types,
// never arbitrary dirty-tree content or unrelated user credentials.
const report={schema:'phase9d-whitespace-check-v1',checkedAt:new Date().toISOString(),code,
  whitespaceDiagnostics:stdout.split('\n').filter(line=>/:\d+: (trailing whitespace|new blank line at EOF|space before tab)/.test(line)),
  lineEndingWarningCount:stderr.split('\n').filter(line=>line.startsWith('warning:')).length,
  sourceSha256:hash(await readFile(new URL(import.meta.url))),baseline:await verifyBaseline()};
await writeFile('output/phase9d-1-continuation-2026-10-13/whitespace-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({code,whitespaceIssues:report.whitespaceDiagnostics.length,lineEndingWarnings:report.lineEndingWarningCount}));assert.equal(code,0);
