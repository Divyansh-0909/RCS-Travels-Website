import assert from 'node:assert/strict';
import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {deriveShadowExport} from './export-projection.mjs';
import {exportSourceFixture,EXPORT_TEST_KEY} from '../../backend/tests/helpers/phase9dExportFixture.js';
import {executeBrokerAttempt} from './broker-execution.mjs';
import {prepareBrokerReplay} from './broker-replay.mjs';
import {hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-broker-2026-10-13');
const report=JSON.parse(await readFile(join(out,'mutation-broker-round3.json'))),reviewed=[];
const payload=deriveShadowExport(exportSourceFixture(),EXPORT_TEST_KEY);
const explanations={
  ConditionalExpression:'Removing the byte-size assertion yields the same bounded failure for the only oversized fixed offline fixture: that frame is independently invalid for the unchanged frozen adapter. All other fixed fixture frames are below the limit. This is not equivalence for arbitrary/live model responses.',
  EqualityOperator:'The fixed offline provider returns no frame of exactly 32768 bytes; it returns small valid frames or the independently invalid oversized frame. Both bounds have identical outcomes on every supported fixture.',
  executionError:'The internal USAGE_UNKNOWN message is caught without disclosure or category-specific routing. Both variants preserve the same unknown result and durable SQL operations.',
  filename:'The generated private filename is returned explicitly and passed to validation; no consumer requires its prefix. Owned-directory checks, suffix, immutable source binding and exclusive creation remain identical.'
};
const offset=(text,line,column)=>text.split('\n').slice(0,line-1).reduce((n,s)=>n+s.length+1,0)+column-1;
async function outcomes(execute){
  const values=[];
  for(const fixture of ['valid','timeout','429','5xx','malformed','oversized','unknown-usage']){
    const queries=[],stages=[],work={id:'attempt',requestId:'request',token:'token',payload};
    const client={async query(sql,args){queries.push({sql,args});return {rows:[{value:sql.includes('.reserve(')?work:true}]};}};
    const result=await execute(client,'request',fixture,async(name,seen)=>stages.push({name,work:seen}));values.push({fixture,result,queries,stages});
  }return values;
}
for(const[file,data]of Object.entries(report.files))for(const mutant of data.mutants.filter(m=>m.status==='Survived')){
  const original=await readFile(join(root,file),'utf8');assert.equal(hash(original),hash(data.source));
  const start=offset(original,mutant.location.start.line,mutant.location.start.column),end=offset(original,mutant.location.end.line,mutant.location.end.column);
  const name=join(dirname(join(root,file)),'.broker-equivalence-'+crypto.randomUUID()+'.mjs');
  const replacement=mutant.mutatorName==='StringLiteral'?mutant.replacement:'('+mutant.replacement+')';
  await writeFile(name,original.slice(0,start)+replacement+original.slice(end),{flag:'wx'});
  try{
    const variant=await import(pathToFileURL(name).href);let reason;
    if(file.endsWith('broker-execution.mjs')){
      assert.deepEqual(await outcomes(variant.executeBrokerAttempt),await outcomes(executeBrokerAttempt));
      reason=explanations[mutant.mutatorName]??explanations.executionError;
    }else{
      const originalRandom=crypto.randomUUID;let step=0;const next=()=>('00000000-0000-4000-8000-'+String(++step).padStart(12,'0'));
      // Each generation consumes scenario fixture IDs as well; reset the sequence
      // before the second invocation so exclusive creation sees the same identity.
      const runStable=async prepare=>{
        const output=join(tmpdir(),'rcs-broker-equivalent-'+originalRandom());await mkdir(output);step=0;crypto.randomUUID=next;syncBuiltinESMExports();let path;
        try{path=await prepare({mode:'record-replay',output,sources:{owned:'identity'}});const recipe=JSON.parse(await readFile(path));
          assert.equal(await prepare({mode:'saved-replay',path,output,sources:{owned:'identity'}}),path);step=0;
          await assert.rejects(prepare({mode:'record-replay',output,sources:{owned:'identity'}}),error=>error.code==='EEXIST');return recipe;
        }finally{crypto.randomUUID=originalRandom;syncBuiltinESMExports();if(path)await unlink(path);}
      };
      assert.deepEqual(await runStable(variant.prepareBrokerReplay),await runStable(prepareBrokerReplay));reason=explanations.filename;
    }
    reviewed.push({identity:JSON.stringify([file,mutant.location,mutant.mutatorName,mutant.replacement]),file,location:mutant.location,mutatorName:mutant.mutatorName,replacement:mutant.replacement,sourceSha256:hash(original),pairedWitness:'PASS',reason});
  }finally{await unlink(name);}
}
assert.equal(reviewed.length,4);await writeFile(join(out,'reviewed-equivalences.json'),JSON.stringify({reviewed,boundary:'Four executable paired reviews for this exact offline fixture/factory/runtime composition. Any new provider, fixture, consumer or binding invalidates these reviews.'},null,2));console.log(JSON.stringify({reviewed:4,pairedWitness:'PASS'}));
