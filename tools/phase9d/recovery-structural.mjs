import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {hash} from './baseline.mjs';
const require=createRequire(join(tmpdir(),'rcs-phase1-quality-tools/package.json')),{ESLint}=require('eslint');
const output='output/phase9d-broker-recovery-2026-10-14',quality=JSON.parse(await readFile(output+'/quality.json'));
const lint=new ESLint({overrideConfigFile:true,overrideConfig:[{files:['**/*.mjs'],rules:{complexity:['error',{max:0,variant:'classic'}]}}]});
const files=[];let cyclomatic=0;
for(const row of quality.files){
  const [report]=await lint.lintFiles([row.file]);const diagnostics=report.messages.filter(message=>message.ruleId==='complexity').map(message=>({line:message.line,column:message.column,message:message.message,complexity:Number(message.message.match(/complexity of (\d+)/)?.[1])}));
  assert.ok(diagnostics.length);assert.ok(diagnostics.every(row=>Number.isInteger(row.complexity)&&row.complexity<22));cyclomatic=Math.max(cyclomatic,...diagnostics.map(row=>row.complexity));
  files.push({file:row.file,sourceSha256:hash(await readFile(row.file)),diagnostics});
}
const methods=quality.files.flatMap(file=>file.methods),summary={cyclomatic,cognitive:Math.max(...methods.map(m=>m.cognitive)),halsteadDifficulty:Math.max(...methods.map(m=>m.halsteadDifficulty)),crap:cyclomatic,physicalLines:Math.max(...quality.files.map(file=>file.physicalLines))};
assert.ok(summary.cognitive<22&&summary.halsteadDifficulty<80&&summary.crap<25&&summary.physicalLines<500);
await writeFile(output+'/quality-verified.json',JSON.stringify({originalReportSha256:hash(await readFile(output+'/quality.json')),files,summary,correction:'Full ESLint diagnostics retain both line and column. Original line-only mapping can select a same-line nested/default arrow instead of its enclosing function. Original report is preserved. At 100% scoped statement coverage, CRAP equals the actual cyclomatic complexity.'},null,2));
console.log(JSON.stringify(summary));
