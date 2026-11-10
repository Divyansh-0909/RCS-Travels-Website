import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {contractOutcomes} from './closure-equivalence-contract.mjs';
import {httpOutcomes,ingressOutcomes} from './closure-equivalence-http.mjs';
import {observerOutcomes} from './closure-equivalence-observer.mjs';

const root=resolve(process.argv[2]??'.'),output=resolve(root,process.argv[3]??'output/phase9d-custody-local-2026-10-17'),campaign=process.argv[4];
assert.match(campaign,/^custody-mutations-\d{8}-\d{6}$/);
const hash=value=>createHash('sha256').update(value).digest('hex');
const load=file=>readFile(resolve(root,file),'utf8');
const protocol=await import(pathToFileURL(join(root,'tools/phase9d/custody-protocol.mjs')).href);
const {transportMac}=await import(pathToFileURL(join(root,'tools/phase9d/transport-protocol.mjs')).href);
const {closureCoreScope}=await import(pathToFileURL(join(root,'tools/phase9d/closure-scope.mjs')).href);
const dependencies=[...closureCoreScope,'tools/phase9d/custody-protocol.mjs','tools/phase9d/transport-protocol.mjs'];
const identities=async()=>Object.fromEntries(await Promise.all(dependencies.map(async file=>[file,hash(await load(file))])));
const sources=await identities(),id='equivalences-'+Date.now()+'-'+randomUUID(),record={id,campaign,started:new Date().toISOString(),node:process.versions.node,sources,reviews:[],code:1};
const cases=[
  ['ingress','0','ArrowFunction','() => undefined',3,73,81,'Both default constants fail all three strict string fault comparisons; no value escapes the callback.'],
  ['http','16','ConditionalExpression','true',9,34,48,'Native disconnected responses, no second writer: skipped internal header/end calls have no wire or application outcome; abort/error/recovery pair required.'],
  ['http','63','StringLiteral','""',20,88,106,'The private deadline error label is discarded by the opaque catch; status, response, outstanding slot and recovery remain identical.'],
  ['contract','51','OptionalChaining','actions[base.service].includes',21,58,89,'Unknown service rejects in either branch; private exception identity is not exposed by ingress.'],
  ['contract','70','ConditionalExpression','false',28,6,39,'Envelope already applies v1 event/source bounds; the generic branch applies the same HMAC with the same source key.'],
  ['contract','72','StringLiteral','""',28,21,39,'Same unreachable specialization: all admitted v1 frames receive the identical generic HMAC verification.'],
  ['contract','80','ConditionalExpression','true',32,73,119,'Every admitted JSON scalar/enumeration is bounded below frame capacity; malformed larger frames still reject.'],
  ['contract','82','EqualityOperator','Buffer.byteLength(JSON.stringify(frame)) < 8192',32,73,119,'No admitted closed ASCII frame can have exactly 8192 bytes; maximum-width enum enumeration is retained.'],
  ['observer','3','ArrayDeclaration','["Stryker was here"]',8,80,82,'An inert default string has no pid; it cannot match the already validated positive integer log PID. Explicit correlations still override the default.'],
  ['observer','98','ConditionalExpression','true',25,122,132,'The retained integer check and serialized-state byte bound independently reject every nonpositive budget: a valid closed empty spool already occupies 13 bytes.'],
  ['observer','99','EqualityOperator','maxBytes >= 0',25,122,132,'Zero cannot pass the retained serialized-state size bound; it never admits or changes a spool.'],
];
const moduleFor=async(file,source)=>{
  const rewritten=source.replace(/(from\s*)(['"])(\.\/[^'"]+)\2/g,(_all,prefix,_quote,path)=>prefix+JSON.stringify(new URL(path,pathToFileURL(resolve(root,file))).href));
  return import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));
};
const mutate=(source,mutant)=>{
  const lines=source.split('\n'),offset=p=>lines.slice(0,p.line-1).reduce((total,line)=>total+line.length+1,0)+p.column-1;
  return source.slice(0,offset(mutant.location.start))+'('+mutant.replacement+')'+source.slice(offset(mutant.location.end));
};
try{
  for(const [name,mutantId,mutator,replacement,line,start,end,condition]of cases){
    const reportFile=join(output,'mutation-core-'+campaign+'-'+name+'.json'),bytes=await readFile(reportFile),report=JSON.parse(bytes),file='tools/phase9d/closure-'+name+'.mjs',row=report.files[file];
    assert.ok(row);const source=await load(file);assert.equal(row.source,source,'SOURCE_DRIFT');
    const mutant=row.mutants.find(value=>value.id===mutantId);assert.ok(mutant);assert.equal(mutant.status,'Survived');
    assert.equal(mutant.mutatorName,mutator);assert.equal(mutant.replacement,replacement);
    assert.deepEqual(mutant.location,{start:{line,column:start},end:{line,column:end}});
    const variant=mutate(source,mutant),original=await moduleFor(file,source),changed=await moduleFor(file,variant);
    const observe=module=>name==='contract'?contractOutcomes(module,protocol):name==='http'?httpOutcomes(module,transportMac):name==='observer'?observerOutcomes(module):ingressOutcomes(module,protocol,transportMac);
    const before=await observe(original),after=await observe(changed);assert.deepEqual(after,before,'NON_EQUIVALENT:'+file+':'+mutantId);
    record.reviews.push({file,mutantId,mutator,replacement,location:mutant.location,sourceSha256:hash(source),variantSha256:hash(variant),reportSha256:hash(bytes),status:'REVIEWED_EQUIVALENT_ON_DECLARED_COMPOSITION',condition,originalOutcomeSha256:hash(JSON.stringify(before)),variantOutcomeSha256:hash(JSON.stringify(after)),originalOutcomes:before,variantOutcomes:after});
  }
  assert.deepEqual(await identities(),sources,'DEPENDENCY_DRIFT');record.code=0;
}catch(error){record.error={name:error.name,message:error.message};process.exitCode=1;}
finally{
  record.finished=new Date().toISOString();
  record.executors=Object.fromEntries(await Promise.all(['closure-equivalences.mjs','closure-equivalence-contract.mjs','closure-equivalence-http.mjs','closure-equivalence-observer.mjs'].map(async name=>[name,hash(await readFile(join(fileURLToPath(new URL('.',import.meta.url)),name)))])));
  await mkdir(output,{recursive:true});await writeFile(join(output,id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
}
console.log(JSON.stringify({id,code:record.code,reviewed:record.reviews.length,error:record.error}));
